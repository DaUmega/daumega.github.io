/* Memory Match.
   Flip two cards at a time and find all matching pairs.
   Grid size and best (fewest moves) per size persist in localStorage. */

"use strict";

var LSKEY = "daumega.memory.v1";

/* Plain text glyphs, one per pair. 32 covers the largest grid, 8x8. */
var SYMBOLS = ["★", "♠", "♥", "♦", "♣", "☀", "☾", "✿", "♪", "⚓", "✈", "✦", "♞", "♜", "☂", "☘", "⚡", "✚", "○", "□", "△", "◇", "☆", "♫", "☯", "✖", "●", "▲", "■", "◆", "⌘", "❖"];

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* Deck for `pairs` pairs: each symbol exactly twice, shuffled. */
function buildDeck(pairs) {
  var deck = [];
  for (var i = 0; i < pairs; i++) {
    deck.push(SYMBOLS[i], SYMBOLS[i]);
  }
  return shuffle(deck);
}

/* Rows and cols must be 2-8 with an even total number of cells. */
function isValidSize(rows, cols) {
  return rows >= 2 && rows <= 8 && cols >= 2 && cols <= 8 &&
    Number.isInteger(rows) && Number.isInteger(cols) &&
    (rows * cols) % 2 === 0;
}

/* Why a size is rejected, or null when it is fine. The old message
   blamed an odd total for every bad size, so 8x8 (64 cells, even)
   wrongly said "an odd total". */
function sizeError(rows, cols) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols))
    return "Enter whole numbers for rows and columns.";
  if (rows < 2 || rows > 8 || cols < 2 || cols > 8)
    return rows + "x" + cols + " is outside 2-8. The largest grid is 8x8.";
  if ((rows * cols) % 2 !== 0)
    return rows + "x" + cols + " has " + (rows * cols) +
      " cells, an odd total. Pick rows and columns with an even total (e.g. 3x4).";
  return null;
}

function sizeKey(rows, cols) { return rows + "x" + cols; }

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SYMBOLS: SYMBOLS, shuffle: shuffle, buildDeck: buildDeck, isValidSize: isValidSize, sizeError: sizeError, sizeKey: sizeKey };
}

if (typeof document !== "undefined") {

  var $ = function (id) { return document.getElementById(id); };

  var S = {
    rows: 4, cols: 4, deck: [],
    flipped: [], matched: {}, lock: false,
    moves: 0, matches: 0, seconds: 0,
    timerId: null, started: false, won: false
  };

  var saved = { best: {}, size: "4x4", customRows: 4, customCols: 4 };

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(LSKEY));
      if (d && typeof d === "object") {
        if (d.best && typeof d.best === "object") saved.best = d.best;
        if (typeof d.size === "string") saved.size = d.size;
        if (d.customRows) saved.customRows = d.customRows;
        if (d.customCols) saved.customCols = d.customCols;
      }
    } catch (e) {}
  }

  function save() {
    try { localStorage.setItem(LSKEY, JSON.stringify(saved)); } catch (e) {}
  }

  function stopTimer() {
    if (S.timerId !== null) { clearInterval(S.timerId); S.timerId = null; }
  }

  function startTimer() {
    if (S.timerId !== null) return;
    S.timerId = setInterval(function () {
      S.seconds++;
      renderStats();
    }, 1000);
  }

  function bestFor() {
    var b = saved.best[sizeKey(S.rows, S.cols)];
    return (typeof b === "number") ? b : null;
  }

  function renderStats() {
    var total = (S.rows * S.cols) / 2;
    var best = bestFor();
    $("stats").innerHTML =
      "Moves: " + S.moves +
      " &middot; Time: " + S.seconds + "s" +
      " &middot; Matches: " + S.matches + "/" + total +
      " &middot; <span class=\"best\">Best (" + sizeKey(S.rows, S.cols) + "): " +
      (best === null ? "--" : best + " moves") + "</span>";
  }

  function setStatus(msg) { $("status").textContent = msg; }

  function renderBoard() {
    var board = $("board");
    board.style.setProperty("--cols", S.cols);
    board.innerHTML = "";
    S.deck.forEach(function (sym, i) {
      var btn = document.createElement("button");
      btn.className = "card";
      btn.type = "button";
      btn.textContent = "?";
      btn.setAttribute("aria-label", "card " + (i + 1) + ", face down");
      btn.addEventListener("click", function () { flip(i); });
      board.appendChild(btn);
    });
  }

  function cardEl(i) { return $("board").children[i]; }

  function flip(i) {
    if (S.lock || S.won) return;
    if (S.matched[i] || S.flipped.indexOf(i) !== -1) return;
    if (!S.started) { S.started = true; startTimer(); }

    S.flipped.push(i);
    var el = cardEl(i);
    el.textContent = S.deck[i];
    el.classList.add("flipped");
    el.setAttribute("aria-label", "card " + (i + 1) + ", " + S.deck[i]);

    if (S.flipped.length < 2) return;

    S.moves++;
    var a = S.flipped[0], b = S.flipped[1];
    if (S.deck[a] === S.deck[b]) {
      S.matched[a] = true; S.matched[b] = true;
      S.matches++;
      S.flipped = [];
      cardEl(a).classList.add("matched");
      cardEl(b).classList.add("matched");
      renderStats();
      if (S.matches === S.deck.length / 2) win();
    } else {
      S.lock = true;
      renderStats();
      setTimeout(function () {
        [a, b].forEach(function (idx) {
          var c = cardEl(idx);
          c.textContent = "?";
          c.classList.remove("flipped");
          c.setAttribute("aria-label", "card " + (idx + 1) + ", face down");
        });
        S.flipped = [];
        S.lock = false;
      }, 700);
    }
  }

  function win() {
    S.won = true;
    stopTimer();
    var key = sizeKey(S.rows, S.cols);
    var best = saved.best[key];
    var isBest = (typeof best !== "number") || S.moves < best;
    if (isBest) { saved.best[key] = S.moves; save(); }
    renderStats();
    setStatus("You win! " + S.moves + " moves in " + S.seconds + "s" +
      (isBest ? " (new best for " + key + ")." : "."));
  }

  /* Returns false and shows a message if the size is not allowed. */
  function newGame(rows, cols) {
    var err = sizeError(rows, cols);
    if (err) {
      setStatus(err);
      return false;
    }
    stopTimer();
    S.rows = rows; S.cols = cols;
    S.deck = buildDeck((rows * cols) / 2);
    S.flipped = []; S.matched = {}; S.lock = false;
    S.moves = 0; S.matches = 0; S.seconds = 0;
    S.started = false; S.won = false;
    renderBoard();
    renderStats();
    setStatus("Flip two cards to find a match.");
    return true;
  }

  /* Best scores only, for every grid size. The current game keeps going. */
  function resetBest() {
    saved.best = {};
    save();
    renderStats();
    setStatus("Best scores cleared for all grid sizes.");
  }

  function markSeg(size) {
    var btns = $("sizeSeg").querySelectorAll("button");
    btns.forEach(function (b) { b.classList.toggle("on", b.dataset.size === size); });
  }

  function startFromSeg(size) {
    if (size === "custom") return startCustom();
    var parts = size.split("x");
    saved.size = size; save();
    markSeg(size);
    newGame(parseInt(parts[0], 10), parseInt(parts[1], 10));
  }

  function startCustom() {
    var rows = parseInt($("customRows").value, 10);
    var cols = parseInt($("customCols").value, 10);
    if (isValidSize(rows, cols)) {
      saved.size = "custom";
      saved.customRows = rows; saved.customCols = cols; save();
      markSeg("custom");
    }
    newGame(rows, cols);
  }

  function init() {
    load();
    $("customRows").value = saved.customRows;
    $("customCols").value = saved.customCols;

    $("goBackBtn").addEventListener("click", function () {
      if (history.length > 1) history.back();
      else location.href = "../games.html";
    });
    $("newBtn").addEventListener("click", function () {
      if (saved.size === "custom") startCustom();
      else startFromSeg(saved.size);
    });
    $("resetBestBtn").addEventListener("click", resetBest);
    $("sizeSeg").querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { startFromSeg(b.dataset.size); });
    });
    $("applyCustomBtn").addEventListener("click", startCustom);
    ["customRows", "customCols"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") startCustom();
      });
    });

    markSeg(saved.size);
    if (saved.size === "custom") newGame(saved.customRows, saved.customCols);
    else startFromSeg(saved.size);
  }

  init();
}
