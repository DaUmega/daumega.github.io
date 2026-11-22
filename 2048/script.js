/* 2048: slide the tiles, merge equal neighbours.
   Board is a flat 16-cell array, row-major. Progress (board, score,
   best, game-over flag) persists in localStorage. There is no win
   at 2048: the game only ends when no moves are left. */

const SIZE = 4;
const LSKEY = "daumega.2048.v1";
const $ = id => document.getElementById(id);
var S = null; // var so test harnesses can reach it

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

/* Slide one row left, merging each pair of equal neighbours once.
   Returns the new row, points gained, and whether anything changed. */
function slideRowLeft(row) {
  const tiles = row.filter(v => v);
  const out = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      out.push(tiles[i] * 2);
      gained += tiles[i] * 2;
      i++;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  const changed = out.some((v, i) => v !== row[i]);
  return { row: out, gained, changed };
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

/* Pure move: returns a new board, points gained, and whether it changed.
   Does not spawn a tile or touch S, so tests can call it directly. */
function moveBoard(board, dir) {
  const next = board.slice();
  let gained = 0;
  let changed = false;
  linesFor(dir).forEach(line => {
    const r = slideRowLeft(line.map(i => board[i]));
    r.row.forEach((v, j) => { next[line[j]] = v; });
    gained += r.gained;
    if (r.changed) changed = true;
  });
  return { board: next, gained, changed };
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
  if (!S || S.over) return;
  const r = moveBoard(S.board, dir);
  if (!r.changed) return;
  S.board = r.board;
  S.score += r.gained;
  if (S.score > S.best) S.best = S.score;
  spawnRandom();
  if (isGameOver(S.board)) {
    S.over = true;
    setStatus("Game over. Final score: " + S.score + ".");
  } else {
    setStatus("");
  }
  update();
}

function newGame() {
  const best = S ? S.best : 0;
  newState(best);
  setStatus("");
}

/* Best score only. The current board keeps going. */
function resetBest() {
  if (!S) return;
  S.best = 0;
  update();
  if (!S.over) setStatus("Best score cleared.");
}

function setStatus(m) { $("status").textContent = m; }

function renderAll() {
  const board = $("board");
  board.innerHTML = "";
  S.board.forEach(v => {
    const cell = document.createElement("div");
    cell.className = "tile" + (v ? " t" + v : " empty") + (v >= 1000 ? " long" : "");
    cell.setAttribute("role", "gridcell");
    cell.textContent = v || "";
    board.appendChild(cell);
  });
  $("score").textContent = S.score;
  $("best").textContent = S.best;
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
