/* Wordle: guess the hidden word. Needs WORDS global from ../words.js.
   Difficulty = word length. Progress in localStorage only. */

const DIFFS = {
  easy:    { len: 4, rows: 7 },
  medium:  { len: 5, rows: 6 },
  hard:    { len: 6, rows: 6 },
  extreme: { len: 7, rows: 5 },
};

const LSKEY = "daumega.wordle.v1";
const $ = id => document.getElementById(id);
var S = null;
let cells = [], keyBtns = {};

function wordList(len) {
  return (WORDS[String(len)] || []).map(w => w.toLowerCase());
}

function newState(diff) {
  const cfg = DIFFS[diff] || DIFFS.medium;
  const list = wordList(cfg.len);
  const answer = list[(Math.random() * list.length) | 0];
  S = { diff, len: cfg.len, rows: cfg.rows, answer,
        guesses: [], cur: "", done: false, won: false };
  save();
  renderAll();
}

function save() {
  try {
    localStorage.setItem(LSKEY, JSON.stringify(S));
  } catch (e) {}
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && d.answer && d.len && (d.diff in DIFFS)) { S = d; return true; }
  } catch (e) {}
  return false;
}

function setStatus(m) { $("status").textContent = m; }

/* --- scoring: returns array of 'g'/'y'/'x' per letter --- */
function scoreGuess(guess, answer) {
  const n = answer.length, res = new Array(n).fill("x");
  const counts = {};
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) res[i] = "g";
    else counts[answer[i]] = (counts[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (res[i] !== "g" && counts[guess[i]] > 0) { res[i] = "y"; counts[guess[i]]--; }
  }
  return res;
}

/* --- input --- */
function pressKey(k) {
  if (!S || S.done) return;
  if (k === "enter") { submitGuess(); return; }
  if (k === "back") { S.cur = S.cur.slice(0, -1); renderRow(); save(); return; }
  if (/^[a-z]$/.test(k) && S.cur.length < S.len) {
    S.cur += k; renderRow(); save();
  }
}

function submitGuess() {
  if (S.cur.length < S.len) { setStatus("Not enough letters"); return; }
  const list = wordList(S.len);
  if (!list.includes(S.cur)) { setStatus("Not in word list"); return; }
  const sc = scoreGuess(S.cur, S.answer);
  S.guesses.push({ word: S.cur, score: sc });
  S.cur = "";
  if (S.guesses[S.guesses.length - 1].score.every(s => s === "g")) {
    S.done = true; S.won = true;
    setStatus("You got it in " + S.guesses.length + " " +
      (S.guesses.length === 1 ? "try!" : "tries!"));
  } else if (S.guesses.length >= S.rows) {
    S.done = true;
    setStatus("Out of guesses. The word was " + S.answer.toUpperCase());
  } else {
    setStatus("");
  }
  save();
  renderAll();
}

/* --- rendering --- */
function buildBoard() {
  const b = $("board");
  b.innerHTML = "";
  b.style.setProperty("--cols", S.len);
  cells = [];
  for (let r = 0; r < S.rows; r++) {
    for (let c = 0; c < S.len; c++) {
      const d = document.createElement("div");
      d.className = "wcell";
      b.appendChild(d);
      cells.push(d);
    }
  }
}

function renderRow() {
  const r = S.guesses.length;
  for (let c = 0; c < S.len; c++) {
    const d = cells[r * S.len + c];
    d.textContent = (S.cur[c] || "").toUpperCase();
    d.classList.toggle("filled", !!S.cur[c]);
  }
}

function renderAll() {
  buildBoard();
  // past guesses
  S.guesses.forEach((g, r) => {
    for (let c = 0; c < S.len; c++) {
      const d = cells[r * S.len + c];
      d.textContent = g.word[c].toUpperCase();
      d.classList.add(g.score[c] === "g" ? "good" : g.score[c] === "y" ? "mid" : "bad");
    }
  });
  if (!S.done) renderRow();
  renderKbd();
  // difficulty buttons
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.diff === S.diff));
}

function renderKbd() {
  const kb = $("kbd");
  kb.innerHTML = "";
  keyBtns = {};
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const state = {}; // letter -> best state (g > y > x)
  S.guesses.forEach(g => {
    for (let i = 0; i < g.word.length; i++) {
      const ch = g.word[i], sc = g.score[i];
      const rank = { g: 3, y: 2, x: 1 };
      if (!state[ch] || rank[sc] > rank[state[ch]]) state[ch] = sc;
    }
  });
  rows.forEach((row, ri) => {
    const div = document.createElement("div");
    div.className = "krow";
    if (ri === 2) {
      const enter = document.createElement("button");
      enter.className = "kkey wide"; enter.textContent = "Enter";
      enter.addEventListener("click", () => pressKey("enter"));
      div.appendChild(enter);
    }
    for (const ch of row) {
      const b = document.createElement("button");
      b.className = "kkey";
      b.textContent = ch.toUpperCase();
      if (state[ch]) b.classList.add(state[ch] === "g" ? "good" : state[ch] === "y" ? "mid" : "bad");
      b.addEventListener("click", () => pressKey(ch));
      div.appendChild(b);
      keyBtns[ch] = b;
    }
    if (ri === 2) {
      const back = document.createElement("button");
      back.className = "kkey wide"; back.textContent = "⌫";
      back.addEventListener("click", () => pressKey("back"));
      div.appendChild(back);
    }
    kb.appendChild(div);
  });
}

/* --- wiring --- */
function init() {
  $("goBackBtn").addEventListener("click", () => location.href = "../index.html");
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.addEventListener("click", () => newState(b.dataset.diff)));
  $("newBtn").addEventListener("click", () => newState(S ? S.diff : "medium"));
  document.addEventListener("keydown", e => {
    if (e.key === "Enter") pressKey("enter");
    else if (e.key === "Backspace") pressKey("back");
    else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toLowerCase());
  });
  if (!load()) newState("medium");
  else renderAll();
  if (S.done) setStatus(S.won ?
    "You got it in " + S.guesses.length + "!" :
    "The word was " + S.answer.toUpperCase());
}

document.addEventListener("DOMContentLoaded", init);
