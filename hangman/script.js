/* Hangman: guess the hidden word, 6 wrong guesses allowed.
   Wordlist comes from ../wordle/words.js (WORDS, uppercase, plus
   WORDLE_ANSWER_COUNTS). Falls back to a small inline list if
   WORDS is undefined, so the game still works standalone.
   No difficulty levels: the word is random, and its length is
   random too, since a longer word can be easier than a short one.
   Wins/losses in localStorage only. */

const MAX_WRONG = 6;
const LSKEY = "daumega.hangman.v1";
const $ = id => document.getElementById(id);
var S = null;

/* About 12 common words, matching lengths where possible. */
const FALLBACK = {
  "4": ["BEAR", "FISH", "MOON"],
  "5": ["APPLE", "HOUSE", "WATER", "MUSIC"],
  "6": ["GARDEN", "PLANET"],
  "7": ["RAINBOW", "JOURNEY", "CAPTAIN"],
};

function pickAnswer() {
  /* Random length first, then a random word of that length.
     Answers come from the curated prefix; the full list is only
     used as the fallback pool when no counts are available. */
  if (typeof WORDS !== "undefined") {
    const lens = Object.keys(WORDS).map(Number)
      .filter(n => WORDS[String(n)] && WORDS[String(n)].length);
    const len = lens[(Math.random() * lens.length) | 0];
    let pool = WORDS[String(len)];
    if (typeof WORDLE_ANSWER_COUNTS !== "undefined") {
      pool = pool.slice(0, WORDLE_ANSWER_COUNTS[String(len)] || pool.length);
    }
    return pool[(Math.random() * pool.length) | 0];
  }
  const lens = Object.keys(FALLBACK);
  const len = lens[(Math.random() * lens.length) | 0];
  const pool = FALLBACK[len];
  return pool[(Math.random() * pool.length) | 0];
}

function wrongGuesses() {
  return S.guessed.filter(ch => !S.answer.includes(ch));
}

function newState() {
  const prev = S || { wins: 0, losses: 0 };
  const answer = pickAnswer();
  S = {
    len: answer.length, answer,
    guessed: [], done: false, won: false,
    wins: prev.wins || 0, losses: prev.losses || 0,
  };
  save();
  renderAll();
  setStatus("");
}

function save() {
  try {
    localStorage.setItem(LSKEY, JSON.stringify(S));
  } catch (e) {}
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && d.answer && Array.isArray(d.guessed)) {
      d.len = d.answer.length;
      d.wins = d.wins || 0;
      d.losses = d.losses || 0;
      d.done = !!d.done;
      d.won = !!d.won;
      S = d;
      return true;
    }
  } catch (e) {}
  return false;
}

function setStatus(m) {
  const el = $("status");
  el.textContent = m;
  el.classList.remove("win", "lose");
  if (S && S.done) el.classList.add(S.won ? "win" : "lose");
}

/* --- input --- */
function guessLetter(ch) {
  if (!S || S.done) return;
  ch = (ch || "").toUpperCase();
  if (!/^[A-Z]$/.test(ch) || S.guessed.includes(ch)) return;
  S.guessed.push(ch);
  if (S.answer.split("").every(c => S.guessed.includes(c))) {
    S.done = true;
    S.won = true;
    S.wins++;
    setStatus("You got it! The word was " + S.answer);
  } else if (wrongGuesses().length >= MAX_WRONG) {
    S.done = true;
    S.won = false;
    S.losses++;
    setStatus("Out of guesses. The word was " + S.answer);
  } else {
    setStatus("");
  }
  save();
  renderAll();
}

/* --- rendering --- */
function renderWord() {
  const w = $("word");
  w.innerHTML = "";
  for (const c of S.answer) {
    const d = document.createElement("span");
    d.className = "wcell";
    const known = S.guessed.includes(c);
    if (known) {
      d.textContent = c;
      d.classList.add("revealed");
    } else if (S.done && !S.won) {
      d.textContent = c;
      d.classList.add("missed");
    } else {
      d.textContent = "";
    }
    w.appendChild(d);
  }
}

function renderGallows() {
  const wrong = wrongGuesses().length;
  for (let i = 0; i < MAX_WRONG; i++) {
    const part = $("part" + i);
    if (!part) continue;
    part.classList.toggle("show", i < wrong);
    part.classList.toggle("lost", S.done && !S.won);
  }
}

function renderKbd() {
  const kb = $("kbd");
  kb.innerHTML = "";
  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  rows.forEach(row => {
    const div = document.createElement("div");
    div.className = "krow";
    for (const ch of row) {
      const b = document.createElement("button");
      b.className = "kkey";
      b.textContent = ch;
      b.disabled = S.done || S.guessed.includes(ch);
      if (S.guessed.includes(ch)) {
        b.classList.add(S.answer.includes(ch) ? "good" : "bad");
      }
      b.addEventListener("click", () => guessLetter(ch));
      div.appendChild(b);
    }
    kb.appendChild(div);
  });
}

function renderAll() {
  renderWord();
  renderGallows();
  renderKbd();
  const wrong = wrongGuesses();
  $("wrong").textContent = wrong.length ? "Wrong: " + wrong.join(" ") : "";
  $("score").textContent = "Wins " + S.wins + "  Losses " + S.losses;
  if (S.done) {
    setStatus(S.won
      ? "You got it! The word was " + S.answer
      : "Out of guesses. The word was " + S.answer);
  }
}

/* --- wiring --- */
function init() {
  $("goBackBtn").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "../games.html";
  });
  $("newBtn").addEventListener("click", () => newState());
  document.addEventListener("keydown", e => {
    if (/^[a-zA-Z]$/.test(e.key)) guessLetter(e.key);
  });
  if (!load()) newState();
  else renderAll();
}

document.addEventListener("DOMContentLoaded", init);
