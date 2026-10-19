/* Dice roller: pool of d4-d100, roll all, tap a die to remove it.
   d6 renders pips, others show the number. Progress in localStorage only. */

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const LSKEY = "daumega.dice.v1";
const $ = id => document.getElementById(id);
var S = null; // var so test harnesses can reach it

/* pip positions (row, col) in a 3x3 grid for d6 faces */
const PIPS = {
  1: [[1,1]],
  2: [[0,0],[2,2]],
  3: [[0,0],[1,1],[2,2]],
  4: [[0,0],[0,2],[2,0],[2,2]],
  5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
  6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]],
};

function newState() { S = { dice: [] }; save(); renderAll(); }
function save() { try { localStorage.setItem(LSKEY, JSON.stringify(S)); } catch (e) {} }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && Array.isArray(d.dice)) { S = d; return true; }
  } catch (e) {}
  return false;
}

function addDie(sides) { S.dice.push({ sides, value: 0 }); save(); renderAll(); }
function removeDie(i) { S.dice.splice(i, 1); save(); renderAll(); }
function clearDice() { S.dice = []; save(); renderAll(); }

function roll() {
  if (!S.dice.length) { setStatus("Add some dice first."); return; }
  S.dice.forEach(d => d.value = 1 + ((Math.random() * d.sides) | 0));
  setStatus("");
  save(); renderAll();
}

function setStatus(m) { $("status").textContent = m; }

function dieEl(d, i) {
  const el = document.createElement("button");
  el.className = "die";
  el.title = "d" + d.sides + " — tap to remove";
  if (d.sides === 6 && d.value) {
    const g = document.createElement("span");
    g.className = "pips";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const p = document.createElement("span");
      p.className = "pip" + (PIPS[d.value].some(([pr, pc]) => pr === r && pc === c) ? " on" : "");
      g.appendChild(p);
    }
    el.appendChild(g);
  } else {
    el.innerHTML = '<span class="dval">' + (d.value || "&ndash;") +
      '</span><span class="dtag">d' + d.sides + "</span>";
  }
  el.addEventListener("click", () => removeDie(i));
  return el;
}

function renderAll() {
  const pool = $("pool");
  pool.innerHTML = "";
  if (!S.dice.length) {
    pool.innerHTML = '<p class="empty">No dice yet. Add some above.</p>';
  } else {
    S.dice.forEach((d, i) => pool.appendChild(dieEl(d, i)));
  }
  const rolled = S.dice.filter(d => d.value);
  $("total").textContent = rolled.length ?
    "Total: " + rolled.reduce((a, d) => a + d.value, 0) : "";
}

function buildAddBar() {
  const bar = $("addBar");
  SIDES.forEach(s => {
    const b = document.createElement("button");
    b.className = "addbtn";
    b.textContent = "d" + s;
    b.addEventListener("click", () => addDie(s));
    bar.appendChild(b);
  });
}

function init() {
  $("goBackBtn").addEventListener("click", () => location.href = "../index.html");
  $("rollBtn").addEventListener("click", roll);
  $("clearBtn").addEventListener("click", clearDice);
  document.addEventListener("keydown", e => {
    if (e.code === "Space" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault(); roll();
    }
  });
  buildAddBar();
  if (!load()) newState(); else renderAll();
}

document.addEventListener("DOMContentLoaded", init);
