/* Minesweeper: classic difficulties, first click always safe.
   Mines are placed only after the first click, excluding that cell.
   Best times per difficulty persist in localStorage. No guessing
   mode retries the mine layout until the board can be solved by
   logic alone, with no 50/50 guesses. */

const DIFFS = {
  beginner:     { cols: 9,  rows: 9,  mines: 10 },
  intermediate: { cols: 16, rows: 16, mines: 40 },
  expert:       { cols: 30, rows: 16, mines: 99 },
};

const LSKEY = "daumega.minesweeper.v1";
const NO_GUESS_TRIES = 400; /* mine layouts tried per game in No guessing mode */
const FLAG_MARK = "\u2691"; /* plain text flag glyph, not emoji */
const MINE_MARK = "\u2739"; /* plain text star glyph, not emoji */
const $ = id => document.getElementById(id);
var S = null; /* var so test harnesses can reach it */
let timerId = null;
let flagMode = false;
let noGuess = false;

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
    revealedCount: 0, flags: 0, seconds: 0, noGuessFallback: false,
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

function computeAdj(state) {
  for (let i = 0; i < state.cells.length; i++) {
    if (state.cells[i].mine) continue;
    state.cells[i].adj = neighbours(i, state.cols, state.rows)
      .filter(n => state.cells[n].mine).length;
  }
}

function resetMines(state) {
  state.cells.forEach(c => { c.mine = false; c.adj = 0; });
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
  computeAdj(state);
}

function revealCell(state, idx) {
  if (state.over) return "over";
  const cell = state.cells[idx];
  if (!cell || cell.revealed || cell.flagged) return "noop";
  if (!state.started) {
    if (noGuess) state.noGuessFallback = !placeGuessFree(state, idx);
    else placeMines(state, idx);
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

/* --- guess-free: a solver that plays only with logic --- */

/* A copy of the board for the solver: same mines and numbers, but
   nothing revealed and nothing flagged. The solver only ever reads
   revealed numbers and its own flags, so anything it solves is
   something a player could solve too, with no guessing. */
function cloneForSolve(state) {
  return {
    cols: state.cols, rows: state.rows, mines: state.mines,
    cells: state.cells.map(c => ({ mine: c.mine, revealed: false, flagged: false, adj: c.adj })),
    revealedCount: 0, flags: 0, started: true, over: false, won: false,
  };
}

/* One pass of the two basic rules over every revealed number: if
   the flags around a number equal the number, the rest of its
   neighbours are safe; if flagged plus unflagged neighbours equal
   the number, the unflagged ones are mines. Returns true when it
   flagged or revealed anything, "mine" when a deduction went
   wrong (should not happen on a sound board). */
function solveStep(sim) {
  let moved = false;
  for (let i = 0; i < sim.cells.length; i++) {
    const c = sim.cells[i];
    if (!c.revealed || c.adj === 0) continue;
    const ns = neighbours(i, sim.cols, sim.rows);
    const unknown = ns.filter(n => !sim.cells[n].revealed && !sim.cells[n].flagged);
    if (!unknown.length) continue;
    const flagged = ns.filter(n => sim.cells[n].flagged).length;
    if (flagged === c.adj) {
      for (const n of unknown) {
        const r = revealCell(sim, n);
        if (r === "mine") return "mine";
        if (r !== "noop" && r !== "over") moved = true;
      }
    } else if (flagged + unknown.length === c.adj) {
      for (const n of unknown) if (toggleFlag(sim, n)) moved = true;
    }
  }
  return moved;
}

/* Subset rule: when one number's unknown neighbours are all inside
   another's, the difference must hold the difference in mines.
   If that difference is 0 the cells are safe, if it is all of them
   they are mines. Catches the 1-2 style patterns the basic rules
   cannot. Returns true when it moved, "mine" when a deduction
   went wrong. */
function solveSubset(sim) {
  const numbered = [];
  for (let i = 0; i < sim.cells.length; i++) {
    const c = sim.cells[i];
    if (!c.revealed || c.adj === 0) continue;
    const ns = neighbours(i, sim.cols, sim.rows);
    const u = new Set(ns.filter(n => !sim.cells[n].revealed && !sim.cells[n].flagged));
    if (!u.size) continue;
    const flagged = ns.filter(n => sim.cells[n].flagged).length;
    numbered.push({ u, need: c.adj - flagged });
  }
  for (const a of numbered) {
    for (const b of numbered) {
      if (a === b || a.u.size >= b.u.size) continue;
      let subset = true;
      a.u.forEach(x => { if (!b.u.has(x)) subset = false; });
      if (!subset) continue;
      const diff = [...b.u].filter(x => !a.u.has(x));
      const diffNeed = b.need - a.need;
      if (diffNeed === 0) {
        for (const n of diff) {
          if (revealCell(sim, n) === "mine") return "mine";
        }
        return true;
      }
      if (diffNeed === diff.length) {
        for (const n of diff) toggleFlag(sim, n);
        return true;
      }
    }
  }
  return false;
}

/* How many safe cells the solver can reveal from the first click.
   -1 when a deduction hits a mine (a broken board). */
function countSolved(state, firstIdx) {
  const sim = cloneForSolve(state);
  if (revealCell(sim, firstIdx) === "mine") return -1;
  const total = sim.cols * sim.rows;
  for (let iter = 0; iter < 1000; iter++) {
    if (sim.revealedCount === total - sim.mines) return sim.revealedCount;
    const step = solveStep(sim);
    if (step === "mine") return -1;
    if (step) continue;
    const sub = solveSubset(sim);
    if (sub === "mine") return -1;
    if (sub) continue;
    return sim.revealedCount;
  }
  return sim.revealedCount;
}

function isSolvable(state, firstIdx) {
  return countSolved(state, firstIdx) === state.cols * state.rows - state.mines;
}

/* Try mine layouts until the solver can finish the board from the
   first click with logic alone. Returns true when one was found;
   otherwise keeps the layout the solver got furthest on, so the
   board is as close to guess-free as the tries found. */
function placeGuessFree(state, exclude) {
  const totalSafe = state.cols * state.rows - state.mines;
  let best = -1, bestMines = null;
  for (let t = 0; t < NO_GUESS_TRIES; t++) {
    resetMines(state);
    placeMines(state, exclude);
    const solved = countSolved(state, exclude);
    if (solved === totalSafe) return true;
    if (solved > best) {
      best = solved;
      bestMines = state.cells.map(c => c.mine);
    }
  }
  resetMines(state);
  if (bestMines) {
    bestMines.forEach((m, i) => { state.cells[i].mine = m; });
    computeAdj(state);
  } else {
    /* every try busted, which should not happen: place once more */
    placeMines(state, exclude);
  }
  return false;
}

/* --- persistence: difficulty + best times per difficulty --- */

function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && d.best && typeof d.best === "object") {
      return {
        diff: (d.diff in DIFFS) ? d.diff : "beginner",
        best: d.best,
        noGuess: d.noGuess === true,
      };
    }
  } catch (e) {}
  return { diff: "beginner", best: { beginner: null, intermediate: null, expert: null }, noGuess: false };
}

function saveBest(diff, seconds) {
  try {
    const saved = loadSaved();
    const best = saved.best;
    if (best[diff] == null || seconds < best[diff]) {
      best[diff] = seconds;
      localStorage.setItem(LSKEY, JSON.stringify({ diff, best, noGuess: saved.noGuess }));
      return true;
    }
    localStorage.setItem(LSKEY, JSON.stringify({ diff: saved.diff, best, noGuess: saved.noGuess }));
  } catch (e) {}
  return false;
}

function saveDiff(diff) {
  try {
    const saved = loadSaved();
    localStorage.setItem(LSKEY, JSON.stringify({ diff, best: saved.best, noGuess: saved.noGuess }));
  } catch (e) {}
}

function saveNoGuess(value) {
  try {
    const saved = loadSaved();
    localStorage.setItem(LSKEY, JSON.stringify({ diff: saved.diff, best: saved.best, noGuess: value }));
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
    setStatus(S.noGuessFallback ?
      "No fully guess-free board found, this is the closest one." : "");
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
    const saved = loadSaved();
    localStorage.setItem(LSKEY, JSON.stringify({
      diff: S.diff,
      best: { beginner: null, intermediate: null, expert: null },
      noGuess: saved.noGuess,
    }));
  } catch (e) {}
  renderBoard();
  setStatus("Best times cleared.");
}

function renderNoGuessBtn() {
  const btn = $("noGuessBtn");
  btn.classList.toggle("on", noGuess);
  btn.setAttribute("aria-pressed", String(noGuess));
  btn.textContent = "Guess-Free Mode: " + (noGuess ? "on" : "off");
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
  $("noGuessBtn").addEventListener("click", () => {
    noGuess = !noGuess;
    saveNoGuess(noGuess);
    renderNoGuessBtn();
    newGame(S.diff);
  });

  $("faceBtn").addEventListener("click", () => newGame(S.diff));

  const board = $("board");
  /* No left+right chord handler: the browser has no left+right
     gesture of its own, it just fires a left mousedown, a right
     mousedown, then a left click. The click below already chords
     a number, so left+right on a number works the same with no
     extra code. The contextmenu check below stops the right half
     of that press from flagging the cell. */
  /* Long-press (about 500ms) flags / unflags, for touch.
     Some phones fire BOTH the press timer and a contextmenu for
     the same long press, which used to flag twice and end up
     unmarked. One key per press, shared by both paths, makes sure
     a press flags exactly once, and the tap that follows it is
     ignored instead of acting on the cell. */
  let pressTimer = null;
  let pressId = 0;
  let flaggedKey = "";
  let longPressed = false;
  let lastPointerType = "";
  function flagOnce(idx, id) {
    const key = id + ":" + idx;
    if (key === flaggedKey) return;
    flaggedKey = key;
    handleFlag(idx);
  }
  board.addEventListener("pointerdown", e => {
    /* A new press starts here, so any leftover long-press
       suppression from the last one is stale: on touch, a long
       press fires a contextmenu that eats the click, so the click
       handler never gets to clear it, and the next tap would be
       swallowed. The long press's own click, if one fires at all,
       always comes before the next pointerdown, so clearing here
       cannot swallow it. */
    longPressed = false;
    const cell = e.target.closest(".cell");
    if (!cell) return;
    lastPointerType = e.pointerType || "";
    pressId++;
    const id = pressId, idx = Number(cell.dataset.idx);
    pressTimer = setTimeout(() => {
      flagOnce(idx, id);
      longPressed = true;
    }, 500);
  });
  const cancelPress = () => { if (pressTimer !== null) { clearTimeout(pressTimer); pressTimer = null; } };
  board.addEventListener("pointerup", cancelPress);
  board.addEventListener("pointerleave", cancelPress);
  board.addEventListener("pointercancel", cancelPress);
  /* Right-click flags; suppress the browser context menu on the board.
     If the left button is also down (e.buttons bit 1), this is the
     right half of a left+right press, not a flag. */
  board.addEventListener("contextmenu", e => {
    e.preventDefault();
    if (e.buttons & 1) return;
    const cell = e.target.closest(".cell");
    if (!cell) return;
    flagOnce(Number(cell.dataset.idx), pressId);
    if (lastPointerType === "touch") longPressed = true;
  });
  board.addEventListener("click", e => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    if (longPressed) { longPressed = false; return; }
    const idx = Number(cell.dataset.idx);
    /* Click a revealed number to chord it: open its unflagged
       neighbours when the flags around it match the number. */
    const c = S.cells[idx];
    if (c && c.revealed && c.adj > 0) { handleChord(idx); return; }
    if (flagMode) handleFlag(idx);
    else handleReveal(idx);
  });

  const saved = loadSaved();
  noGuess = saved.noGuess === true;
  renderNoGuessBtn();
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
  module.exports = { DIFFS, newGameState, placeMines, neighbours, revealCell, toggleFlag, chordCell, minesRemaining, countSolved, isSolvable };
}
