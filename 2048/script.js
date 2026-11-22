/* 2048: slide the tiles, merge equal neighbours.
   Board is a flat 16-cell array, row-major. Progress (board, score,
   best, game-over flag) persists in localStorage. There is no win
   at 2048: the game only ends when no moves are left.
   Tiles slide instead of teleporting: each tile is positioned by
   its column and row in CSS, so moving it is just changing those
   two numbers and letting the transition run. A tile that spawns
   just appears, it does not slide. */

const SIZE = 4;
const LSKEY = "daumega.2048.v1";
const ANIM_MS = 130; /* must be just over the .tile transition in styles.css */
const $ = id => document.getElementById(id);
var S = null; // var so test harnesses can reach it
let animating = false;
let animTimer = null;

function emptyBoard() { return Array(SIZE * SIZE).fill(0); }

function newState(best) {
  S = { board: emptyBoard(), score: 0, best: best || 0, over: false };
  spawnRandom();
  spawnRandom();
  update();
}

function save() { try { localStorage.setItem(LSKEY, JSON.stringify(S)); } catch (e) {} }
function update() { save(); renderAll(); }

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && Array.isArray(d.board) && d.board.length === SIZE * SIZE &&
        d.board.every(v => Number.isInteger(v) && v >= 0)) {
      S = {
        board: d.board.slice(),
        score: Number.isInteger(d.score) && d.score >= 0 ? d.score : 0,
        best: Number.isInteger(d.best) && d.best >= 0 ? d.best : 0,
        over: Boolean(d.over)
      };
      return true;
    }
  } catch (e) {}
  return false;
}

/* One random tile: 2 with 90% chance, 4 with 10%. No-op on a full board. */
function spawnRandom() {
  const empty = [];
  S.board.forEach((v, i) => { if (!v) empty.push(i); });
  if (!empty.length) return;
  const i = empty[(Math.random() * empty.length) | 0];
  S.board[i] = Math.random() < 0.9 ? 2 : 4;
}

/* Slide one row of tile items left, merging each pair of equal
   neighbours once. Items are {v, src}; the output keeps, for each
   resulting tile, the source cells it came from, so the move can
   be animated. Returns the new row and points gained. */
function slideItems(items) {
  const out = [];
  let gained = 0;
  for (let i = 0; i < items.length; i++) {
    if (i + 1 < items.length && items[i].v === items[i + 1].v) {
      out.push({ v: items[i].v * 2, srcs: [items[i].src, items[i + 1].src] });
      gained += items[i].v * 2;
      i++;
    } else {
      out.push({ v: items[i].v, srcs: [items[i].src] });
    }
  }
  return { out, gained };
}

/* Lines of cell indexes for each direction, always read in slide order. */
function linesFor(dir) {
  const lines = [];
  for (let k = 0; k < SIZE; k++) {
    const line = [];
    for (let j = 0; j < SIZE; j++) {
      if (dir === "left") line.push(k * SIZE + j);
      else if (dir === "right") line.push(k * SIZE + (SIZE - 1 - j));
      else if (dir === "up") line.push(j * SIZE + k);
      else line.push((SIZE - 1 - j) * SIZE + k);
    }
    lines.push(line);
  }
  return lines;
}

/* Pure move: returns a new board, points gained, whether it changed,
   and the sources of every resulting tile ({to, srcs}) for the slide
   animation. Does not spawn a tile or touch S, so tests can call it
   directly. */
function moveBoard(board, dir) {
  const next = board.slice();
  let gained = 0;
  let changed = false;
  const sources = [];
  linesFor(dir).forEach(line => {
    const items = line.map(i => ({ v: board[i], src: i })).filter(t => t.v);
    const r = slideItems(items);
    r.out.forEach((t, j) => {
      next[line[j]] = t.v;
      sources.push({ to: line[j], srcs: t.srcs });
    });
    for (let j = r.out.length; j < SIZE; j++) next[line[j]] = 0;
    gained += r.gained;
    if (line.some(idx => next[idx] !== board[idx])) changed = true;
  });
  return { board: next, gained, changed, sources };
}

function isGameOver(board) {
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) return false;
    const r = (i / SIZE) | 0, c = i % SIZE;
    if (c + 1 < SIZE && board[i] === board[i + 1]) return false;
    if (r + 1 < SIZE && board[i] === board[i + SIZE]) return false;
  }
  return true;
}

function doMove(dir) {
  if (!S || S.over || animating) return;
  const r = moveBoard(S.board, dir);
  if (!r.changed) return;
  /* Tile divs currently on the board, keyed by their cell, so the
     animation can slide each one from where it is to where it goes. */
  const divs = {};
  Array.from($("board").children).forEach(el => {
    if (el.dataset && el.dataset.idx != null) divs[el.dataset.idx] = el;
  });
  S.board = r.board;
  S.score += r.gained;
  if (S.score > S.best) S.best = S.score;
  spawnRandom();
  if (isGameOver(S.board)) S.over = true;
  save();
  renderScores();
  /* Slide: point every moving tile at its destination cell. Tiles
     that merge slide together; the redraw below, after the slide,
     leaves a single tile with the merged value. */
  animating = true;
  r.sources.forEach(s => {
    s.srcs.forEach(src => {
      const el = divs[src];
      if (el) placeTile(el, s.to);
    });
  });
  animTimer = setTimeout(() => {
    animating = false;
    animTimer = null;
    renderAll();
  }, ANIM_MS);
}

function cancelAnim() {
  if (animTimer !== null) { clearTimeout(animTimer); animTimer = null; }
  animating = false;
}

function newGame() {
  cancelAnim();
  const best = S ? S.best : 0;
  newState(best);
  setStatus("");
}

/* Best score only. The current board keeps going. */
function resetBest() {
  if (!S) return;
  cancelAnim();
  S.best = 0;
  update();
  if (!S.over) setStatus("Best score cleared.");
}

function setStatus(m) { $("status").textContent = m; }

function renderScores() {
  $("score").textContent = S.score;
  $("best").textContent = S.best;
}

/* A tile's position is its column and row, as CSS variables. The
   stylesheet turns those into left/top, so moving a tile is just
   changing the two numbers. CSS handles resizing, no JS geometry. */
function placeTile(el, idx) {
  el.style.setProperty("--c", idx % SIZE);
  el.style.setProperty("--r", (idx / SIZE) | 0);
}

function renderAll() {
  const board = $("board");
  board.innerHTML = "";
  for (let i = 0; i < SIZE * SIZE; i++) {
    const bg = document.createElement("div");
    bg.className = "bgcell";
    board.appendChild(bg);
  }
  S.board.forEach((v, i) => {
    if (!v) return;
    const tile = document.createElement("div");
    tile.className = "tile t" + v + (v >= 1000 ? " long" : "");
    tile.setAttribute("role", "gridcell");
    tile.dataset.idx = i;
    tile.textContent = v;
    placeTile(tile, i);
    board.appendChild(tile);
  });
  renderScores();
  if (S.over) setStatus("Game over. Final score: " + S.score + ".");
}

function init() {
  $("goBackBtn").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "../games.html";
  });
  $("newBtn").addEventListener("click", newGame);
  $("resetBestBtn").addEventListener("click", resetBest);
  document.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    const dir = { arrowleft: "left", a: "left", arrowright: "right", d: "right",
      arrowup: "up", w: "up", arrowdown: "down", s: "down" }[k];
    if (!dir) return;
    e.preventDefault();
    doMove(dir);
  });
  let sx = 0, sy = 0;
  const board = $("board");
  board.addEventListener("touchstart", e => {
    sx = e.changedTouches[0].clientX;
    sy = e.changedTouches[0].clientY;
  }, { passive: true });
  board.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }, { passive: true });
  if (!load()) newState(0);
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);

/* Node smoke-test hook: require() exposes the pure logic only */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { moveBoard, slideItems, isGameOver };
}
