/* Dice roller: pool of d4-d100, hold dice between rolls,
   tap held dice to remove. d6 renders pips, others show the number.
   A custom d2-d10000 goes straight into the pool, like any die.
   Optional modifier to total and rolls counter (with optional max)
   persist in localStorage. */

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const LSKEY = "daumega.dice.v1";
const $ = id => document.getElementById(id);
var S = null; // var so test harnesses can reach it

/* Pip cells (0-8, row-major) in a 3x3 grid for d6 faces */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const validSides = n => Number.isInteger(n) && n >= 2 && n <= 10000;
const int = (v, d = 0) => Number.isInteger(v) ? v : d;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const limitMsg = () => "Roll limit reached (" + S.limit + "). Reset rolls to roll again.";

function newState() { S = { dice: [], rolls: 0, limit: 0, mod: 0 }; update(); }
function save() { try { localStorage.setItem(LSKEY, JSON.stringify(S)); } catch (e) {} }
function update() { save(); renderAll(); }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && Array.isArray(d.dice)) {
      // Older saves may lack the newer fields; fill them in.
      // Any saved custom sides are ignored now, custom dice live only in the pool.
      S = { dice: d.dice, rolls: int(d.rolls), limit: int(d.limit), mod: int(d.mod) };
      return true;
    }
  } catch (e) {}
  return false;
}

function addDie(sides) { S.dice.push({ sides, value: 0, held: false, removeOnRoll: false }); update(); }

function addCustomDie() {
  const input = $("customSides");
  const sides = Number(input.value);
  if (!validSides(sides)) {
    setStatus("Enter a whole number of sides from 2 to 10000, e.g. 7 or 30.");
    input.focus();
    return;
  }
  addDie(sides);
  setStatus("");
  input.value = "";
  input.focus();
}

function toggleDieState(i) {
  const die = S.dice[i];
  if (die.removeOnRoll) { die.held = false; die.removeOnRoll = false; }
  else if (die.held) { die.removeOnRoll = true; }
  else { die.held = true; }
  update();
}
function clearDice() { S.dice = []; S.rolls = 0; setStatus(""); update(); }
function resetRolls() { S.rolls = 0; setStatus(""); update(); }

function setLimit(value) {
  S.limit = value === "" ? 0 : clamp(Math.floor(Number(value) || 0), 1, 99);
  if (S.limit && S.rolls > S.limit) S.rolls = S.limit;
  update();
}
function setMod(value) {
  S.mod = value === "" ? 0 : clamp(Math.floor(Number(value) || 0), -1000, 1000);
  update();
}

function roll() {
  if (!S.dice.length) { setStatus("Add some dice first."); return; }
  if (S.limit && S.rolls >= S.limit) { setStatus(limitMsg()); return; }
  S.dice = S.dice.filter(d => !d.removeOnRoll);
  const rollable = S.dice.filter(d => !d.held);
  if (!rollable.length) {
    setStatus(S.dice.length ? "All dice are held." : "");
    update();
    return;
  }
  rollable.forEach(d => d.value = 1 + ((Math.random() * d.sides) | 0));
  S.rolls += 1; // counts every roll that actually rolled a die, first roll included
  setStatus(S.limit && S.rolls >= S.limit ? limitMsg() : "");
  update();
}

function setStatus(m) { $("status").textContent = m; }

function dieEl(d, i) {
  const el = document.createElement("button");
  el.className = "die" + (d.held ? " held" : "") + (d.removeOnRoll ? " remove-on-roll" : "");
  const action = d.removeOnRoll ? "marked for removal on next roll; click to unhold" :
    d.held ? "held; click to mark for removal" : "click to hold";
  el.title = "d" + d.sides + " - " + action;
  el.setAttribute("aria-label", "d" + d.sides + ", " + action);
  if (d.sides === 6 && d.value) {
    const g = document.createElement("span");
    g.className = "pips";
    for (let c = 0; c < 9; c++) {
      const p = document.createElement("span");
      p.className = "pip" + (PIPS[d.value].includes(c) ? " on" : "");
      g.appendChild(p);
    }
    el.appendChild(g);
  } else {
    el.innerHTML = '<span class="dval' + (String(d.value).length > 3 ? " long" : "") + '">' + (d.value || "&ndash;") +
      '</span><span class="dtag">d' + d.sides + "</span>";
  }
  el.addEventListener("click", () => toggleDieState(i));
  return el;
}

function syncInput(input, value) { if (document.activeElement !== input) input.value = value || ""; }

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
    "Total: " + (rolled.reduce((a, d) => a + d.value, 0) + S.mod) + (S.mod ? " (" + (S.mod > 0 ? "+" : "") + S.mod + ")" : "") : "";
  $("rolls").textContent = S.limit ? "Rolls: " + S.rolls + "/" + S.limit : "Rolls: " + S.rolls;
  $("rollBtn").disabled = Boolean(S.limit && S.rolls >= S.limit);
  syncInput($("rollLimit"), S.limit);
  syncInput($("mod"), S.mod);
}

function buildAddBar() {
  const bar = $("addBar");
  bar.innerHTML = "";
  SIDES.forEach(s => {
    const b = document.createElement("button");
    b.className = "addbtn";
    b.textContent = "d" + s;
    b.addEventListener("click", () => addDie(s));
    bar.appendChild(b);
  });
}

function init() {
  $("goBackBtn").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "../games.html";
  });
  $("rollBtn").addEventListener("click", roll);
  $("clearBtn").addEventListener("click", clearDice);
  $("resetRollsBtn").addEventListener("click", resetRolls);
  $("addCustomBtn").addEventListener("click", addCustomDie);
  $("customSides").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCustomDie(); } });
  $("rollLimit").addEventListener("input", e => setLimit(e.target.value));
  $("mod").addEventListener("input", e => setMod(e.target.value));
  document.addEventListener("keydown", e => {
    if (e.code === "Space" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault(); roll();
    }
  });
  if (!load()) newState();
  buildAddBar();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
