/* Sudoku: generator + UI. No dependencies. Progress in localStorage only. */

function shuffled(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ---------- solver & generator (grid = Array(81), 0 = empty) ---------- */

function candidates(grid, i) {
  const used = new Array(10).fill(false);
  const r = (i / 9) | 0, c = i % 9;
  for (let k = 0; k < 9; k++) { used[grid[r * 9 + k]] = true; used[grid[k * 9 + c]] = true; }
  const br = r - r % 3, bc = c - c % 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++)
    used[grid[(br + dr) * 9 + bc + dc]] = true;
  const out = [];
  for (let n = 1; n <= 9; n++) if (!used[n]) out.push(n);
  return out;
}

// count solutions up to limit (MRV backtracking)
function countSolutions(grid, limit) {
  let count = 0;
  (function bt() {
    if (count >= limit) return;
    let bi = -1, bc = null;
    for (let i = 0; i < 81; i++) {
      if (grid[i] === 0) {
        const c = candidates(grid, i);
        if (!c.length) return;
        if (!bc || c.length < bc.length) { bc = c; bi = i; if (c.length === 1) break; }
      }
    }
    if (bi === -1) { count++; return; }
    for (const n of bc) { grid[bi] = n; bt(); grid[bi] = 0; if (count >= limit) return; }
  })();
  return count;
}

function fullGrid() {
  const grid = new Array(81).fill(0);
  (function bt() {
    let bi = -1;
    for (let i = 0; i < 81; i++) if (grid[i] === 0) { bi = i; break; }
    if (bi === -1) return true;
    for (const n of shuffled(candidates(grid, bi))) {
      grid[bi] = n;
      if (bt()) return true;
      grid[bi] = 0;
    }
    return false;
  })();
  return grid;
}

/* Difficulty by givens count: fewer givens = harder. Unique solution guaranteed. */
const GIVENS = { easy: 45, medium: 36, hard: 29, extreme: 26 };

function makePuzzle(diff) {
  const solution = fullGrid();
  const puzzle = solution.slice();
  const target = GIVENS[diff] || 36;
  let givens = 81;
  for (const i of shuffled([...Array(81).keys()])) {
    if (givens <= target) break;
    if (!puzzle[i]) continue;
    const j = 80 - i, bi = puzzle[i], bj = puzzle[j]; // rotational symmetry
    puzzle[i] = 0;
    const pair = j !== i && puzzle[j];
    if (pair) puzzle[j] = 0;
    const take = pair ? 2 : 1;
    if (givens - take < target || countSolutions(puzzle.slice(), 2) !== 1) {
      puzzle[i] = bi;
      if (pair) puzzle[j] = bj;
    } else givens -= take;
  }
  return { puzzle, solution };
}

/* ---------- state ---------- */

const LSKEY = "daumega.sudoku.v1";
const $ = id => document.getElementById(id);
var S = null; // var (not let) so test harnesses can reach it via window.eval
const cells = [], padBtns = [];

function newState(diff) {
  setStatus("Generating…");
  // let the UI paint before the (brief) generation work
  setTimeout(() => {
    const { puzzle, solution } = makePuzzle(diff);
    S = { diff, puzzle, solution, filled: new Array(81).fill(0), sel: null };
    save();
    renderAll();
  }, 30);
}

function save() {
  try {
    localStorage.setItem(LSKEY, JSON.stringify({
      diff: S.diff, puzzle: S.puzzle, solution: S.solution, filled: S.filled,
    }));
  } catch (e) {}
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && d.puzzle && d.puzzle.length === 81 && d.solution && d.solution.length === 81 &&
        (d.diff in GIVENS)) {
      S = { diff: d.diff, puzzle: d.puzzle, solution: d.solution,
            filled: d.filled || new Array(81).fill(0), sel: null };
      return true;
    }
  } catch (e) {}
  return false;
}

/* ---------- UI ---------- */

function setStatus(m) { $("status").textContent = m; }
function valAt(i) { return S.puzzle[i] || S.filled[i]; }
function clearErr() { cells.forEach(b => b.classList.remove("err")); }

function buildGrid() {
  const g = $("grid");
  for (let i = 0; i < 81; i++) {
    const b = document.createElement("button");
    b.className = "scell";
    const r = (i / 9) | 0, c = i % 9;
    if (c === 2 || c === 5) b.classList.add("box-r");
    if (r === 2 || r === 5) b.classList.add("box-b");
    b.setAttribute("role", "gridcell");
    b.setAttribute("aria-label", "row " + (r + 1) + " column " + (c + 1));
    b.addEventListener("click", () => select(i));
    g.appendChild(b);
    cells.push(b);
  }
}

function buildPad() {
  const np = $("numpad");
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement("button");
    b.className = "pnum";
    b.innerHTML = '<span class="pd">' + n + '</span><span class="pc"></span>';
    b.setAttribute("aria-label", "enter " + n);
    b.addEventListener("click", () => setNum(n));
    np.appendChild(b);
    padBtns.push(b);
  }
  const e = document.createElement("button");
  e.className = "pnum erase";
  e.textContent = "⌫ erase";
  e.addEventListener("click", () => setNum(0));
  np.appendChild(e);
}

function render() {
  const selVal = S.sel !== null ? valAt(S.sel) : 0;
  const sr = S.sel !== null ? (S.sel / 9) | 0 : -1, sc = S.sel !== null ? S.sel % 9 : -1;
  for (let i = 0; i < 81; i++) {
    const b = cells[i], giv = S.puzzle[i], v = giv || S.filled[i];
    const r = (i / 9) | 0, c = i % 9;
    b.textContent = v || "";
    b.classList.toggle("given", !!giv);
    b.classList.toggle("user", !giv && !!v);
    b.classList.toggle("sel", i === S.sel);
    const rel = S.sel !== null && i !== S.sel &&
      (r === sr || c === sc || ((r / 3) | 0) === ((sr / 3) | 0) && ((c / 3) | 0) === ((sc / 3) | 0));
    b.classList.toggle("rel", rel);
    b.classList.toggle("same", !!selVal && v === selVal && i !== S.sel);
  }
  const remaining = new Array(10).fill(9);
  for (let i = 0; i < 81; i++) { const v = valAt(i); if (v) remaining[v]--; }
  padBtns.forEach((b, k) => {
    const left = remaining[k + 1];
    b.querySelector(".pc").textContent = left > 0 ? left + " left" : "done";
    b.classList.toggle("done", left === 0);
  });
}

function renderAll() {
  render();
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.diff === S.diff));
  setStatus("Select a cell, then type or tap a number.");
}

function select(i) {
  S.sel = i;
  clearErr();
  render();
}

function setNum(n) {
  if (S.sel === null) { setStatus("Select a cell first."); return; }
  const i = S.sel;
  if (S.puzzle[i]) return; // givens aren't editable
  clearErr();
  S.filled[i] = (S.filled[i] === n) ? 0 : n; // tapping same number erases
  save();
  render();
  checkWin(true);
}

function checkWin(quiet) {
  for (let i = 0; i < 81; i++)
    if (!S.puzzle[i] && S.filled[i] !== S.solution[i]) return false;
  setStatus("Solved! Nice work.");
  return true;
}

function doCheck() {
  clearErr();
  let wrong = 0, empty = 0;
  for (let i = 0; i < 81; i++) {
    if (S.puzzle[i]) continue;
    const v = S.filled[i];
    if (!v) empty++;
    else if (v !== S.solution[i]) { cells[i].classList.add("err"); wrong++; }
  }
  if (!wrong && !empty) setStatus("Solved! Nice work.");
  else if (!wrong) setStatus("No mistakes so far. " + empty + " cells to go.");
  else setStatus(wrong + " incorrect" + (wrong > 1 ? " cells" : " cell") + ". Tap them to fix.");
}

function doHint() {
  const empt = [];
  for (let i = 0; i < 81; i++) if (!S.puzzle[i] && !S.filled[i]) empt.push(i);
  if (!empt.length) { setStatus("No empty cells left."); return; }
  const i = empt[(Math.random() * empt.length) | 0];
  S.filled[i] = S.solution[i];
  S.sel = i;
  clearErr();
  save();
  render();
  setStatus("Hint placed.");
  checkWin(true);
}

function doClear() {
  if (!S.filled.some(v => v)) return;
  uiConfirm("Clear all your entries?").then(ok => {
    if (!ok) return;
    S.filled = new Array(81).fill(0);
    clearErr();
    save();
    render();
    setStatus("Cleared. Fresh start.");
  });
}

// Div-based confirm (browsers block window.confirm popups)
let modalResolve = null;
function uiConfirm(msg) {
  return new Promise(res => {
    modalResolve = res;
    $("modalMsg").textContent = msg;
    $("modal").classList.remove("hidden");
  });
}
function initModal() {
  $("modalYes").addEventListener("click", () => { $("modal").classList.add("hidden"); if (modalResolve) modalResolve(true); });
  $("modalNo").addEventListener("click", () => { $("modal").classList.add("hidden"); if (modalResolve) modalResolve(false); });
}

async function confirmNew() {
  if (!S.filled.some(v => v)) return true;
  return await uiConfirm("Start a new puzzle? Progress will be lost.");
}

function init() {
  buildGrid();
  buildPad();
  $("goBackBtn").addEventListener("click", () => { window.location.href = "../index.html"; });
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.addEventListener("click", async () => {
      if (b.dataset.diff === S.diff) return;
      if (!(await confirmNew())) return;
      newState(b.dataset.diff);
    }));
  $("newBtn").addEventListener("click", async () => { if (await confirmNew()) newState(S.diff); });
  $("checkBtn").addEventListener("click", doCheck);
  $("hintBtn").addEventListener("click", doHint);
  $("clearBtn").addEventListener("click", doClear);
  document.addEventListener("keydown", e => {
    if (S.sel === null || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key >= "1" && e.key <= "9") setNum(+e.key);
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { e.preventDefault(); setNum(0); }
    else if (e.key.indexOf("Arrow") === 0) {
      e.preventDefault();
      const r = (S.sel / 9) | 0, c = S.sel % 9;
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      select(((r + d[0] + 9) % 9) * 9 + ((c + d[1] + 9) % 9));
    }
  });
  if (load()) renderAll();
  else newState("medium");
  initModal();
}

document.addEventListener("DOMContentLoaded", init);
