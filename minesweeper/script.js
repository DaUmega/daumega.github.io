/* Minesweeper: classic difficulties, first click always safe.
   Mines are placed only after the first click, excluding that cell.
   Best times per difficulty persist in localStorage. */

const DIFFS = {
  beginner:     { cols: 9,  rows: 9,  mines: 10 },
  intermediate: { cols: 16, rows: 16, mines: 40 },
  expert:       { cols: 30, rows: 16, mines: 99 },
};

const LSKEY = "daumega.minesweeper.v1";
const FLAG_MARK = "\u2691"; /* plain text flag glyph, not emoji */
const MINE_MARK = "\u2739"; /* plain text star glyph, not emoji */
const $ = id => document.getElementById(id);
var S = null; /* var so test harnesses can reach it */
let timerId = null;
let flagMode = false;

/* --- pure game logic (no DOM, testable in Node) --- */

function newGameState(diff) {
  const cfg = DIFFS[diff] || DIFFS.beginner;
  const total = cfg.cols * cfg.rows;
  const cells = [];
  for (let i = 0; i < total; i++) {
    cells.push({ mine: false, revealed: false, flagged: false, adj: 0 });
  }
  return {
    diff, cols: cfg.cols, rows: cfg.rows, mines: cfg.mines,
    cells, started: false, over: false, won: false,
    revealedCount: 0, flags: 0, seconds: 0,
  };
}

function neighbours(idx, cols, rows) {
  const r = Math.floor(idx / cols), c = idx % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

function placeMines(state, exclude) {
  const total = state.cols * state.rows;
  const pool = [];
  for (let i = 0; i < total; i++) if (i !== exclude) pool.push(i);
  /* Fisher-Yates shuffle, take the first state.mines entries */
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  for (let k = 0; k < state.mines; k++) state.cells[pool[k]].mine = true;
  for (let i = 0; i < total; i++) {
    if (state.cells[i].mine) continue;
    state.cells[i].adj = neighbours(i, state.cols, state.rows)
      .filter(n => state.cells[n].mine).length;
  }
}

function revealCell(state, idx) {
  if (state.over) return "over";
  const cell = state.cells[idx];
  if (!cell || cell.revealed || cell.flagged) return "noop";
  if (!state.started) {
    placeMines(state, idx);
    state.started = true;
  }
  if (cell.mine) {
    cell.revealed = true;
    state.over = true;
    state.won = false;
    return "mine";
  }
  /* Flood fill: reveal connected empty cells and their numbered neighbours */
  const stack = [idx];
  while (stack.length) {
    const cur = stack.pop();
    const c = state.cells[cur];
    if (c.revealed || c.flagged) continue;
    c.revealed = true;
    state.revealedCount++;
    if (c.adj === 0) {
      for (const n of neighbours(cur, state.cols, state.rows)) {
        const nc = state.cells[n];
        if (!nc.revealed && !nc.flagged && !nc.mine) stack.push(n);
      }
    }
  }
  if (state.revealedCount === state.cols * state.rows - state.mines) {
    state.over = true;
    state.won = true;
    return "win";
  }
  return "ok";
}

function toggleFlag(state, idx) {
  if (state.over) return false;
  const cell = state.cells[idx];
  if (!cell || cell.revealed) return false;
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  return true;
}

/* Chording: on a revealed numbered cell, if the flags around it
   equal its number, reveal all its unflagged neighbours. Returns
   "noop" when the flags do not match, otherwise the same results
   as revealCell ("ok", "win", "mine" when a flag was wrong). */
function chordCell(state, idx) {
  if (state.over) return "over";
  const cell = state.cells[idx];
  if (!cell || !cell.revealed || cell.adj === 0) return "noop";
  const ns = neighbours(idx, state.cols, state.rows);
  const flagged = ns.filter(n => state.cells[n].flagged).length;
  if (flagged !== cell.adj) return "noop";
  let result = "ok";
  for (const n of ns) {
    const nc = state.cells[n];
    if (nc.revealed || nc.flagged) continue;
    const r = revealCell(state, n);
    if (r === "mine") return "mine";
    if (r === "win") result = "win";
    if (state.over) break;
  }
  return result;
}

function minesRemaining(state) { return state.mines - state.flags; }

/* --- persistence: difficulty + best times per difficulty --- */

function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && d.best && typeof d.best === "object") {
      return { diff: (d.diff in DIFFS) ? d.diff : "beginner", best: d.best };
    }
  } catch (e) {}
  return { diff: "beginner", best: { beginner: null, intermediate: null, expert: null } };
}

function saveBest(diff, seconds) {
  try {
    const saved = loadSaved();
    const best = saved.best;
    if (best[diff] == null || seconds < best[diff]) {
      best[diff] = seconds;
      localStorage.setItem(LSKEY, JSON.stringify({ diff, best }));
      return true;
    }
    localStorage.setItem(LSKEY, JSON.stringify({ diff: saved.diff, best }));
  } catch (e) {}
  return false;
}

function saveDiff(diff) {
  try {
    const saved = loadSaved();
    localStorage.setItem(LSKEY, JSON.stringify({ diff, best: saved.best }));
  } catch (e) {}
}

/* --- timer (DOM layer; starts on first click, stops on win/lose) --- */

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    S.seconds++;
    $("timer").textContent = S.seconds;
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) { clearInterval(timerId); timerId = null; }
}

/* --- rendering --- */

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (cls ? " " + cls : "");
}

function bestText(diff) {
  const saved = loadSaved();
  const b = saved.best[diff];
  return b == null ? "\u2013" : b + "s";
}

function renderHud() {
  $("mineCount").textContent = minesRemaining(S);
  $("timer").textContent = S.seconds;
  $("bestTime").textContent = bestText(S.diff);
  $("faceBtn").textContent = S.over ? (S.won ? "B-)" : ":(") : ":)";
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";
  board.className = "board cols-" + S.cols;
  board.style.setProperty("--cols", S.cols);
  S.cells.forEach((cell, i) => {
    const el = document.createElement("button");
    el.className = "cell";
    el.type = "button";
    el.dataset.idx = i;
    el.setAttribute("aria-label", "cell " + (Math.floor(i / S.cols) + 1) + "," + ((i % S.cols) + 1));
    if (cell.revealed) {
      el.classList.add("revealed");
      if (cell.mine) {
        el.classList.add("mine");
        el.textContent = MINE_MARK;
      } else if (cell.adj > 0) {
        el.classList.add("n" + cell.adj);
        el.textContent = cell.adj;
      }
    } else if (cell.flagged) {
      el.classList.add("flagged");
      el.textContent = FLAG_MARK;
    }
    board.appendChild(el);
  });
  renderHud();
}

function revealAllMines(hitIdx) {
  S.cells.forEach((cell, i) => {
    if (!cell.mine) return;
    const el = $("board").children[i];
    if (!el) return;
    if (i === hitIdx) el.classList.add("hit");
    if (!cell.revealed) {
      cell.revealed = true;
      el.classList.add("revealed", "mine");
      el.textContent = MINE_MARK;
    }
  });
}

function endGame(won) {
  stopTimer();
  if (won) {
    const isBest = saveBest(S.diff, S.seconds);
    setStatus("You win in " + S.seconds + "s" +
      (isBest ? " - new best time for " + S.diff + "!" : "."), "win");
  } else {
    setStatus("Boom. You hit a mine. Press New game to try again.", "lose");
  }
  renderHud();
}

function handleReveal(idx) {
  if (!S || S.over) return;
  const wasStarted = S.started;
  const res = revealCell(S, idx);
  if (res === "noop" || res === "over") return;
  if (!wasStarted && S.started) startTimer();
  if (res === "mine") {
    revealAllMines(idx);
    renderBoard();
    /* re-mark the hit mine after the rebuild */
    const hit = $("board").children[idx];
    if (hit) hit.classList.add("hit");
    endGame(false);
  } else if (res === "win") {
    renderBoard();
    endGame(true);
  } else {
    renderBoard();
    setStatus("");
  }
}

function handleFlag(idx) {
  if (!S || S.over) return;
  if (toggleFlag(S, idx)) { renderBoard(); setStatus(""); }
}

function handleChord(idx) {
  if (!S || S.over) return;
  const res = chordCell(S, idx);
  if (res === "noop" || res === "over") return;
  if (res === "mine") {
    /* Find the mine that was hit: the first revealed mine */
    let hit = -1;
    S.cells.forEach((c, i) => { if (c.mine && c.revealed && hit < 0) hit = i; });
    revealAllMines(hit);
    renderBoard();
    if (hit >= 0) { const el = $("board").children[hit]; if (el) el.classList.add("hit"); }
    endGame(false);
  } else if (res === "win") {
    renderBoard();
    endGame(true);
  } else {
    renderBoard();
    setStatus("");
  }
}

function newGame(diff) {
  stopTimer();
  flagMode = false;
  const btn = $("flagBtn");
  btn.classList.remove("on");
  btn.setAttribute("aria-pressed", "false");
  btn.textContent = "Flag mode: off";
  S = newGameState(diff);
  saveDiff(diff);
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.diff === diff));
  renderBoard();
  setStatus("");
}

/* Best times only, for every difficulty. The current game keeps going. */
function resetBest() {
  if (!S) return;
  try {
    localStorage.setItem(LSKEY, JSON.stringify({
      diff: S.diff,
      best: { beginner: null, intermediate: null, expert: null },
    }));
  } catch (e) {}
  renderBoard();
  setStatus("Best times cleared.");
}

/* --- wiring --- */

function init() {
  $("goBackBtn").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "../games.html";
  });
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.addEventListener("click", () => { if (b.dataset.diff !== S.diff) newGame(b.dataset.diff); }));
  $("newBtn").addEventListener("click", () => newGame(S.diff));
  $("resetBestBtn").addEventListener("click", resetBest);
  $("flagBtn").addEventListener("click", () => {
    flagMode = !flagMode;
    const btn = $("flagBtn");
    btn.classList.toggle("on", flagMode);
    btn.setAttribute("aria-pressed", String(flagMode));
    btn.textContent = "Flag mode: " + (flagMode ? "on" : "off");
  });

  $("faceBtn").addEventListener("click", () => newGame(S.diff));

  const board = $("board");
  /* Chording: left + right mouse buttons together on a revealed
     number opens its unflagged neighbours when the flags match.
     Double-click on a number does the same, for mice and touch. */
  let down = new Set(), chorded = false;
  board.addEventListener("mousedown", e => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    down.add(e.button);
    if (down.has(0) && down.has(2)) {
      chorded = true;
      handleChord(Number(cell.dataset.idx));
    }
  });
  board.addEventListener("mouseup", () => { down.clear(); });
  board.addEventListener("mouseleave", () => { down.clear(); });
  board.addEventListener("dblclick", e => {
    const cell = e.target.closest(".cell");
    if (cell) handleChord(Number(cell.dataset.idx));
  });
  /* Right-click flags; suppress the browser context menu on the board.
     If the left button is also down, this is a chord, not a flag. */
  board.addEventListener("contextmenu", e => {
    e.preventDefault();
    if (down.has(0)) return;
    const cell = e.target.closest(".cell");
    if (cell) handleFlag(Number(cell.dataset.idx));
  });
  /* Long-press (about 500ms) flags / unflags, for touch */
  let pressTimer = null;
  let longPressed = false;
  board.addEventListener("pointerdown", e => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      handleFlag(Number(cell.dataset.idx));
    }, 500);
  });
  const cancelPress = () => { if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; } };
  board.addEventListener("pointerup", cancelPress);
  board.addEventListener("pointerleave", cancelPress);
  board.addEventListener("pointercancel", cancelPress);
  board.addEventListener("click", e => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    if (chorded) { chorded = false; return; }
    if (longPressed) { longPressed = false; return; }
    const idx = Number(cell.dataset.idx);
    if (flagMode) handleFlag(idx);
    else handleReveal(idx);
  });

  const saved = loadSaved();
  S = newGameState(saved.diff);
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.diff === S.diff));
  renderBoard();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

/* Node smoke-test hook: require() exposes the pure logic only */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DIFFS, newGameState, placeMines, neighbours, revealCell, toggleFlag, chordCell, minesRemaining };
}
