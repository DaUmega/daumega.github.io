/* Puzzle generators: pure logic, no DOM. Needs WORDS and DEFS globals.
   Crossword mode: classic sparse generator (words cross, black squares emerge).
   Fill / license-plate modes: book-style dense grids (a few black squares
   carved first, then every slot is filled). */

const PLATE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1 like real plates

const DIFFS = {
  easy:    { size: 9,  minLen: 3, maxLen: 6, target: 12 },
  medium:  { size: 11, minLen: 3, maxLen: 7, target: 20 },
  hard:    { size: 13, minLen: 4, maxLen: 8, target: 28 },
  extreme: { size: 15, minLen: 4, maxLen: 9, target: 36 },
};

// book-style fill-ins: mostly blank with a scattering of black squares
// (~20% blocked keeps the fill CSP tractable; sparser blocks won't fill)
const FILL_BLOCKS = { easy: 16, medium: 24, hard: 34, extreme: 44 };
const FILL_MINLEN = { easy: 3, medium: 3, hard: 4, extreme: 4 };

function shuffled(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function slotKeysOf(s) {
  const out = [], dr = s.d === "D" ? 1 : 0, dc = s.d === "A" ? 1 : 0;
  for (let i = 0; i < s.len; i++) out.push((s.r + dr * i) + "," + (s.c + dc * i));
  return out;
}

function numberSlots(slots) {
  const numAt = {};
  let n = 0;
  slots.slice().sort((a, b) => a.r - b.r || a.c - b.c).forEach(s => {
    const key = s.r + "," + s.c;
    if (!(key in numAt)) numAt[key] = ++n;
    s.n = numAt[key];
  });
}

function clueText(s) {
  if (s.plate) return "License plate (" + s.len + ")";
  return DEFS[s.ans] || (s.len + " letters");
}

/* ---------------- crossword mode: classic sparse generator ---------------- */

function pickWord(L, needDefs) {
  const arr = WORDS[L] || [];
  if (!needDefs) return arr[(Math.random() * arr.length) | 0];
  // crosswords: only pick from words that have definitions for clues
  for (let t = 0; t < 50; t++) {
    const w = arr[(Math.random() * arr.length) | 0];
    if (w && DEFS[w]) return w;
  }
  return null;
}

function pluralOf(w) {
  // naive S/ES plural; good enough to thicken generation pools (fill-ins
  // don't show definitions, and crosswords fall back to "N letters").
  if (/[sxz]$|ch$|sh$/i.test(w)) return w + "ES";
  return w + "S";
}

const _indexCache = {};
function buildIndex(minLen, maxLen, needDefs) {
  const key = minLen + "-" + maxLen + "-" + (needDefs ? 1 : 0);
  if (_indexCache[key]) return _indexCache[key];
  const idx = {};
  const seen = {};
  for (let L = minLen; L <= maxLen; L++) {
    const pos = [];
    for (let k = 0; k < L; k++) pos.push({});
    seen[L] = new Set(WORDS[L] || []);
    // base words (crosswords need a definition for the clue; fill-ins don't)
    for (const w of (WORDS[L] || [])) {
      if (needDefs && !DEFS[w]) continue;
      for (let k = 0; k < L; k++) {
        const m = pos[k];
        (m[w[k]] = m[w[k]] || []).push(w);
      }
    }
    // plurals of (L-1)-letter words, if they fit this length and aren't dupes
    // (fill-ins only; they have no definitions for crossword clues)
    if (!needDefs && L >= 4 && L <= 7) {
      for (const w of (WORDS[L - 1] || [])) {
        const p = pluralOf(w);
        if (p.length !== L || seen[L].has(p)) continue;
        seen[L].add(p);
        for (let k = 0; k < L; k++) {
          const m = pos[k];
          (m[p[k]] = m[p[k]] || []).push(p);
        }
      }
      // plurals of (L-2)-letter words via +ES (e.g. BOX->BOXES)
      for (const w of (WORDS[L - 2] || [])) {
        const p = pluralOf(w);
        if (p.length !== L || seen[L].has(p)) continue;
        seen[L].add(p);
        for (let k = 0; k < L; k++) {
          const m = pos[k];
          (m[p[k]] = m[p[k]] || []).push(p);
        }
      }
    }
    idx[L] = pos;
  }
  _indexCache[key] = idx;
  return idx;
}

// One attempt at a crossword grid. Returns puzzle or null if too sparse.
function generateCrossword(cfg) {
  const { size, minLen, maxLen, target, needDefs } = cfg;
  const grid = [];
  for (let r = 0; r < size; r++) grid.push(new Array(size).fill(null));
  const slots = [], used = new Set(), idx = buildIndex(minLen, maxLen, needDefs);

  function place(r, c, dir, word) {
    const dr = dir === "D" ? 1 : 0, dc = dir === "A" ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      const rr = r + dr * i, cc = c + dc * i;
      if (!grid[rr][cc]) grid[rr][cc] = { ch: word[i], dirs: new Set() };
      grid[rr][cc].dirs.add(dir);
    }
    slots.push({ r, c, d: dir, len: word.length, ans: word, plate: false });
    used.add(word);
  }

  // Standard crossword adjacency rule: a new letter may not touch any
  // existing letter except at the crossing point(s) and along its own word.
  function canPlace(r, c, dir, word) {
    const L = word.length, dr = dir === "D" ? 1 : 0, dc = dir === "A" ? 1 : 0;
    let fresh = 0, cross = 0;
    for (let i = 0; i < L; i++) {
      const rr = r + dr * i, cc = c + dc * i;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) return false;
      const cell = grid[rr][cc];
      if (cell) {
        if (cell.ch !== word[i] || cell.dirs.has(dir)) return false;
        cross++;
      } else {
        fresh++;
        const chk = dir === "A" ? [[rr - 1, cc], [rr + 1, cc]] : [[rr, cc - 1], [rr, cc + 1]];
        if (i === 0) chk.push([rr - dr, cc - dc]);
        if (i === L - 1) chk.push([rr + dr, cc + dc]);
        for (const [nr, nc] of chk) {
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc]) return false;
        }
      }
    }
    if (!fresh) return false;
    if (slots.length && !cross) return false; // keep the grid connected
    return true;
  }

  function dictCands(L, k, ch) {
    const arr = (((idx[L] || [])[k] || {})[ch]) || [];
    // pick up to 30 random candidates without shuffling the whole array
    // (arrays can be huge with the supplemented wordlist; full shuffle was
    // causing the laptop-heating slowdown on medium fill-ins)
    const n = Math.min(30, arr.length), out = [];
    for (let i = 0; i < n; i++) out.push(arr[(Math.random() * arr.length) | 0]);
    return out;
  }

  // seed word in the middle
  const seedLen = minLen + ((Math.random() * (Math.min(maxLen, size) - minLen + 1)) | 0);
  const seedWord = pickWord(seedLen, needDefs);
  if (!seedWord) return null;
  place((size >> 1), (size - seedWord.length) >> 1, "A", seedWord);

  let attempts = 0;
  while (slots.length < target && attempts < 8000) {
    attempts++;
    const s = slots[(Math.random() * slots.length) | 0];
    const i = (Math.random() * s.len) | 0;
    const cr = s.r + (s.d === "D" ? i : 0), cc = s.c + (s.d === "A" ? i : 0);
    const ch = grid[cr][cc].ch, nd = s.d === "A" ? "D" : "A";
    const L = minLen + ((Math.random() * (maxLen - minLen + 1)) | 0);
    const k = (Math.random() * L) | 0;
    for (const w of dictCands(L, k, ch)) {
      if (used.has(w)) continue;
      const r0 = nd === "D" ? cr - k : cr, c0 = nd === "A" ? cc - k : cc;
      if (canPlace(r0, c0, nd, w)) { place(r0, c0, nd, w); break; }
    }
  }

  if (slots.length < 8) return null;
  numberSlots(slots);

  const cells = {};
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r][c]) cells[r + "," + c] = grid[r][c].ch;

  return { size, slots, cells };
}

/* ---------------- fill / plates: dense book-style grids ---------------- */

// Carve a sparse set of black squares (180-degree symmetry) so that every
// white run has length within [minLen, maxLen] and all white cells connect.
// Minimalist block carving for plates/fill: place random blocks, ensuring
// no white run is shorter than minLen. No symmetry, no connectivity check
// (dense grids stay connected). Long runs are split to stay under maxLen.
function carveBlocks(size, nBlocks, minLen, maxLen) {
  const key = (r, c) => r + "," + c;
  const white = (blocks, r, c) => r >= 0 && r < size && c >= 0 && c < size && !blocks.has(key(r, c));

  // check runs through (r,c) only (fast local check, not full grid scan)
  function runsOkAt(blocks, r, c) {
    // horizontal run through (r,c)
    let left = c, right = c;
    while (white(blocks, r, left - 1)) left--;
    while (white(blocks, r, right + 1)) right++;
    const hLen = right - left + 1;
    if (hLen > 0 && hLen < minLen) return false;
    // vertical run through (r,c)
    let top = r, bot = r;
    while (white(blocks, top - 1, c)) top--;
    while (white(blocks, bot + 1, c)) bot++;
    const vLen = bot - top + 1;
    if (vLen > 0 && vLen < minLen) return false;
    return true;
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    const blocks = new Set();
    let tries = 0;
    while (blocks.size < nBlocks && tries < 500) {
      tries++;
      const r = (Math.random() * size) | 0, c = (Math.random() * size) | 0;
      const k = key(r, c);
      if (blocks.has(k)) continue;
      blocks.add(k);
      if (!runsOkAt(blocks, r, c)) blocks.delete(k);
    }
    // split any run longer than maxLen
    let ok = true;
    for (let r = 0; r < size && ok; r++) for (let c = 0; c < size && ok;) {
      if (white(blocks, r, c) && !white(blocks, r, c - 1)) {
        let L = 0; while (white(blocks, r, c + L)) L++;
        if (L > maxLen) {
          const mid = c + (L >> 1);
          blocks.add(key(r, mid));
          if (!runsOkAt(blocks, r, mid)) { ok = false; break; }
        }
        c += L;
      } else c++;
    }
    for (let c = 0; c < size && ok; c++) for (let r = 0; r < size && ok;) {
      if (white(blocks, r, c) && !white(blocks, r - 1, c)) {
        let L = 0; while (white(blocks, r + L, c)) L++;
        if (L > maxLen) {
          const mid = r + (L >> 1);
          blocks.add(key(mid, c));
          if (!runsOkAt(blocks, mid, c)) { ok = false; break; }
        }
        r += L;
      } else r++;
    }
    if (ok && blocks.size > 0) return blocks;
  }
  return null;
}

function slotsFromBlocks(blocks, size, minLen) {
  const slots = [];
  const white = (r, c) => r >= 0 && r < size && c >= 0 && c < size && !blocks.has(r + "," + c);
  for (let r = 0; r < size; r++) for (let c = 0; c < size;) {
    if (white(r, c) && !white(r, c - 1)) {
      let L = 0; while (white(r, c + L)) L++;
      if (L >= minLen) slots.push({ r, c, d: "A", len: L });
      c += L;
    } else c++;
  }
  for (let c = 0; c < size; c++) for (let r = 0; r < size;) {
    if (white(r, c) && !white(r - 1, c)) {
      let L = 0; while (white(r + L, c)) L++;
      if (L >= minLen) slots.push({ r, c, d: "D", len: L });
      r += L;
    } else r++;
  }
  return slots;
}

// Fill predetermined slots with random license-plate codes honoring
// crossings. Codes are generated to fit, so this always succeeds fast.
function fillSlots(slots) {
  const keysOf = new Map(slots.map(s => [s, slotKeysOf(s)]));
  const used = new Set();
  const letters = {};
  const placed = [];

  const genCode = s => {
    const keys = keysOf.get(s);
    for (let t = 0; t < 50; t++) {
      let w = "", nl = 0;
      for (let i = 0; i < s.len; i++) {
        const ch = letters[keys[i]] || PLATE_CHARS[(Math.random() * PLATE_CHARS.length) | 0];
        w += ch;
        if (ch > "9") nl++;
      }
      if (nl >= 3 && !used.has(w)) return w;
    }
    return null;
  };

  for (const s of shuffled(slots.slice())) {
    const w = genCode(s);
    if (!w) return null;
    placed.push({ s, word: w });
    used.add(w);
    keysOf.get(s).forEach((k, i) => { letters[k] = w[i]; });
  }
  return placed;
}

// Fill predetermined slots with dictionary words honoring crossings.
// Greedy random sampling; returns null if a slot can't be filled (retry).
/* ---------------- dispatcher ---------------- */

function buildPuzzle(diffKey, mode) {
  const d = DIFFS[diffKey] || DIFFS.medium;
  if (mode === "plates") {
    // license plates: dense book-style grid (codes are generated to fit,
    // so the dense fill is trivial and fast). Slot lengths are capped just
    // below the grid size so no slot spans the entire board.
    const minLen = FILL_MINLEN[diffKey] || 3;
    const maxLen = d.size - 2;
    for (const nb of [FILL_BLOCKS[diffKey] || 24, 12, 6, 0]) {
      for (let t = 0; t < 10; t++) {
        const blocks = carveBlocks(d.size, nb, minLen, maxLen);
        if (!blocks) continue;
        const slots = slotsFromBlocks(blocks, d.size, minLen);
        if (slots.length < 8) continue;
        const placed = fillSlots(slots);
        if (!placed) continue;
        const full = placed.map(p => ({ r: p.s.r, c: p.s.c, d: p.s.d, len: p.s.len, ans: p.word, plate: true }));
        numberSlots(full);
        const cells = {};
        placed.forEach(p => slotKeysOf(p.s).forEach((k, i) => { cells[k] = p.word[i]; }));
        return { size: d.size, slots: full, cells };
      }
    }
    return null;
  }
  // crosswords and word fill-ins: word-first generator (black squares are
  // just uncovered cells, so the fill is solvable by construction).
  // Fill-ins cram in short words (3-6 letters) for book-style density.
  const cfg = {
    size: d.size,
    minLen: mode === "fill" ? 3 : d.minLen,
    maxLen: mode === "fill" ? Math.min(9, d.maxLen + 2) : d.maxLen,
    target: mode === "fill" ? d.target * 3 : d.target,
    needDefs: mode === "cross",
  };
  // A length bucket with a single slot is a forced placement (trivially easy),
  // so prefer puzzles where every length appears at least twice.
  function goodDistribution(slots) {
    const byLen = {};
    for (const s of slots) byLen[s.len] = (byLen[s.len] || 0) + 1;
    return Object.values(byLen).every(n => n >= 2);
  }
  let best = null, bestScore = -1;
  // fill-ins use fewer tries for mobile-friendly speed; crosswords keep 8
  // for quality (they're sparser and faster to generate)
  const tries = mode === "fill" ? 5 : 8;
  for (let t = 0; t < tries; t++) {
    const p = generateCrossword(cfg);
    if (p) {
      const white = Object.keys(p.cells).length;
      const score = white + (goodDistribution(p.slots) ? 100000 : 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
  }
  return best;
}
/* UI: grid, clues, word bank, keyboard, localStorage progress. Needs logic.js. */

const $ = id => document.getElementById(id);
const LSKEY = "daumega.xword.v1";
let S = null;

function buildMaps() {
  S._byStart = {};
  S._cover = {};
  for (const s of S.puz.slots) {
    S._byStart[s.r + "," + s.c + "," + s.d] = s;
    const dr = s.d === "D" ? 1 : 0, dc = s.d === "A" ? 1 : 0;
    for (let i = 0; i < s.len; i++) {
      const k = (s.r + dr * i) + "," + (s.c + dc * i);
      (S._cover[k] = S._cover[k] || {})[s.d] = s;
    }
  }
}

function newState(mode, diff) {
  let puz = null;
  // buildPuzzle can rarely return null (generation failed); retry instead
  // of crashing on a null puzzle
  for (let t = 0; t < 5 && !puz; t++) puz = buildPuzzle(diff, mode);
  if (!puz) {
    setStatus("Couldn't generate a puzzle. Try again.");
    return;
  }
  S = { mode, diff, puz, filled: {}, revealed: [], sel: null, armed: null };
  buildMaps();
  save();
}

function save() {
  try {
    localStorage.setItem(LSKEY, JSON.stringify({
      mode: S.mode, diff: S.diff,
      puz: S.puz, filled: S.filled, revealed: S.revealed,
    }));
  } catch (e) { /* private mode etc: play on without saving */ }
}

function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem(LSKEY));
    if (d && d.puz && d.puz.slots && d.puz.slots.length) return d;
  } catch (e) {}
  return null;
}

function cellKey(r, c) { return r + "," + c; }
function cellInput(r, c) {
  return document.querySelector('input.cell[data-r="' + r + '"][data-c="' + c + '"]');
}
function isRevealed(k) { return S.revealed.indexOf(k) >= 0; }
function slotKeys(s) {
  const out = [], dr = s.d === "D" ? 1 : 0, dc = s.d === "A" ? 1 : 0;
  for (let i = 0; i < s.len; i++) out.push(cellKey(s.r + dr * i, s.c + dc * i));
  return out;
}
function activeSlot() {
  if (!S.sel) return null;
  const cov = S._cover[cellKey(S.sel.r, S.sel.c)];
  return cov ? (cov[S.sel.d] || cov.A || cov.D) : null;
}

/* ---------- rendering ---------- */

function renderGrid() {
  const g = $("grid"), n = S.puz.size;
  g.style.setProperty("--n", n);
  g.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = cellKey(r, c);
      if (!S.puz.cells[k]) {
        const b = document.createElement("div");
        b.className = "block";
        frag.appendChild(b);
        continue;
      }
      const wrap = document.createElement("div");
      wrap.className = "cellwrap";
      wrap.dataset.r = r; wrap.dataset.c = c;
      const num = S._byStart[k + ",A"] || S._byStart[k + ",D"];
      if (num) {
        const sp = document.createElement("span");
        sp.className = "num";
        sp.textContent = num.n;
        wrap.appendChild(sp);
      }
      const inp = document.createElement("input");
      inp.className = "cell";
      inp.dataset.r = r; inp.dataset.c = c;
      inp.maxLength = 1;
      inp.autocomplete = "off"; inp.autocapitalize = "characters";
      inp.spellcheck = false;
      inp.setAttribute("aria-label", "row " + (r + 1) + " column " + (c + 1));
      inp.value = S.filled[k] || "";
      if (isRevealed(k)) { inp.disabled = true; inp.classList.add("rev"); }
      wrap.appendChild(inp);
      frag.appendChild(wrap);
    }
  }
  g.appendChild(frag);
}

function renderClues() {
  for (const d of ["A", "D"]) {
    const ol = d === "A" ? $("across") : $("down");
    ol.innerHTML = "";
    S.puz.slots.filter(s => s.d === d).sort((a, b) => a.n - b.n).forEach(s => {
      const li = document.createElement("li");
      li.dataset.r = s.r; li.dataset.c = s.c; li.dataset.d = s.d;
      const b = document.createElement("span");
      b.className = "clue-n";
      b.textContent = s.n;
      li.appendChild(b);
      li.appendChild(document.createTextNode(clueText(s)));
      li.addEventListener("click", () => {
        select(s.r, s.c, s.d);
        const inp = cellInput(s.r, s.c);
        if (inp) inp.focus({ preventScroll: true });
      });
      ol.appendChild(li);
    });
  }
}

function renderBank() {
  const bank = $("bank");
  bank.innerHTML = "";
  const byLen = {};
  for (const s of S.puz.slots) (byLen[s.len] = byLen[s.len] || []).push(s);
  Object.keys(byLen).map(Number).sort((a, b) => a - b).forEach(L => {
    const grp = document.createElement("div");
    grp.className = "bank-group";
    const h = document.createElement("h3");
    h.textContent = L + " characters";
    grp.appendChild(h);
    const words = [...new Set(byLen[L].map(s => s.ans))].sort();
    for (const w of words) {
      const b = document.createElement("button");
      b.className = "bank-word";
      b.textContent = w;
      b.dataset.word = w;
      b.addEventListener("click", () => {
        S.armed = S.armed === w ? null : w;
        paintArmed();
        setStatus(S.armed ? "Tap a slot to place " + w : "Word unselected.");
      });
      grp.appendChild(b);
    }
    bank.appendChild(grp);
  });
  refreshBankUsed();
}

function refreshBankUsed() {
  document.querySelectorAll(".bank-word").forEach(b => {
    const w = b.dataset.word;
    const used = S.puz.slots.some(s => s.ans === w &&
      slotKeys(s).every(k => S.filled[k] === S.puz.cells[k]));
    b.classList.toggle("used", used);
  });
}

function paintArmed() {
  document.querySelectorAll(".bank-word").forEach(b =>
    b.classList.toggle("armed", b.dataset.word === S.armed));
}

function paintSel() {
  document.querySelectorAll(".cellwrap.inword").forEach(e => e.classList.remove("inword"));
  document.querySelectorAll(".cellwrap.cursor").forEach(e => e.classList.remove("cursor"));
  document.querySelectorAll("#cluePane li.cur").forEach(e => e.classList.remove("cur"));
  const s = activeSlot();
  if (s) {
    slotKeys(s).forEach(k => {
      const [r, c] = k.split(",");
      const w = document.querySelector('.cellwrap[data-r="' + r + '"][data-c="' + c + '"]');
      if (w) w.classList.add("inword");
    });
    const cur = document.querySelector('.cellwrap[data-r="' + S.sel.r + '"][data-c="' + S.sel.c + '"]');
    if (cur) cur.classList.add("cursor");
    const li = document.querySelector('#cluePane li[data-r="' + s.r + '"][data-c="' + s.c + '"][data-d="' + s.d + '"]');
    if (li) li.classList.add("cur");
    setStatus(slotLabel(s), true);
  }
}

function setStatus(msg, sticky) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("sticky", !!sticky);
}

// Fill-ins and plate puzzles never show the definition: just the slot
// number and length, otherwise the puzzle answers itself.
function slotLabel(s) {
  const tag = s.n + (s.d === "A" ? "A" : "D");
  if (S.mode === "cross") return tag + " — " + clueText(s);
  if (S.mode === "plates") return tag + " — " + s.len + " characters";
  return tag + " — " + s.len + " letters";
}

function renderAll() {
  renderGrid();
  if (S.mode === "cross") { renderClues(); } else { renderBank(); }
  $("cluePane").hidden = S.mode !== "cross";
  $("bankPane").hidden = S.mode === "cross";
  document.querySelectorAll("#modeSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.mode === S.mode));
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.classList.toggle("on", b.dataset.diff === S.diff));
  S.sel = null;
  paintSel();
  setStatus(S.mode === "plates" ? "Fit every plate into the grid." :
    S.mode === "fill" ? "Fit every word into the grid." : "Pick a square and type.", true);
}

/* ---------- selection & editing ---------- */

function select(r, c, dir) {
  const k = cellKey(r, c), cov = S._cover[k];
  if (!cov) return;
  const dirs = Object.keys(cov);
  if (S.sel && S.sel.r === r && S.sel.c === c && !dir) {
    if (dirs.length > 1) S.sel.d = S.sel.d === "A" ? "D" : "A";
  } else {
    S.sel = { r, c, d: dir && cov[dir] ? dir : (cov[S.sel && S.sel.d] ? S.sel.d : dirs[0]) };
  }
  // armed word from the bank: place it into a matching slot through this square
  if (S.armed) {
    const word = S.armed;
    const cands = dirs.map(d => cov[d]).filter(s => s.len === word.length);
    const s = (S.sel && cands.find(x => x.d === S.sel.d)) || cands[0];
    if (s) {
      slotKeys(s).forEach((kk, i) => {
        if (!isRevealed(kk)) {
          S.filled[kk] = word[i];
          const inp = cellInput(...kk.split(",").map(Number));
          if (inp) inp.value = word[i];
        }
      });
      S.armed = null;
      paintArmed();
      paintSel();
      setStatus("Placed " + word + ".");
      afterEdit();
      return;
    }
    paintSel();
    setStatus(word + " (" + word.length + ") fits no slot through this square.");
    return;
  }
  paintSel();
}

function moveSel(step) {
  const s = activeSlot();
  if (!s || !S.sel) return;
  const dr = s.d === "D" ? 1 : 0, dc = s.d === "A" ? 1 : 0;
  const i = s.d === "D" ? S.sel.r - s.r : S.sel.c - s.c;
  const ni = Math.min(s.len - 1, Math.max(0, i + step));
  const nr = s.r + dr * ni, nc = s.c + dc * ni;
  S.sel = { r: nr, c: nc, d: s.d };
  paintSel();
  const inp = cellInput(nr, nc);
  if (inp) inp.focus({ preventScroll: true });
}

function afterEdit() {
  refreshBankUsed();
  save();
  const keys = Object.keys(S.puz.cells);
  if (keys.length && keys.every(k => S.filled[k] === S.puz.cells[k]))
    setStatus("Solved. Nice work.");
}

function wireGrid() {
  const g = $("grid");
  g.addEventListener("click", e => {
    const inp = e.target.closest("input.cell");
    if (inp) select(+inp.dataset.r, +inp.dataset.c);
  });
  g.addEventListener("input", e => {
    const t = e.target;
    if (!t.classList || !t.classList.contains("cell") || t.disabled) return;
    const r = +t.dataset.r, c = +t.dataset.c, k = cellKey(r, c);
    const v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
    t.value = v;
    if (v) S.filled[k] = v; else delete S.filled[k];
    t.classList.remove("wrong");
    if (!S.sel || S.sel.r !== r || S.sel.c !== c) select(r, c);
    if (v) moveSel(1);
    afterEdit();
  });
  g.addEventListener("keydown", e => {
    const t = e.target;
    if (!t.classList || !t.classList.contains("cell")) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    if (e.key === "Backspace") {
      if (!t.value) {
        e.preventDefault();
        moveSel(-1);
        const s = activeSlot();
        if (s && S.sel) {
          const k = cellKey(S.sel.r, S.sel.c);
          if (!isRevealed(k)) {
            delete S.filled[k];
            const inp = cellInput(S.sel.r, S.sel.c);
            if (inp) { inp.value = ""; inp.classList.remove("wrong"); }
          }
          afterEdit();
        }
      }
      return;
    }
    const mv = { ArrowUp: [-1, 0, "D"], ArrowDown: [1, 0, "D"], ArrowLeft: [0, -1, "A"], ArrowRight: [0, 1, "A"] }[e.key];
    if (mv) {
      e.preventDefault();
      const k2 = cellKey(r + mv[0], c + mv[1]);
      if (S.puz.cells[k2]) select(r + mv[0], c + mv[1], mv[2]);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      select(r, c); // toggles direction on same cell
    }
  });
}

/* ---------- actions ---------- */

function inProgress() { return Object.keys(S.filled).length > 0; }

function confirmNew() {
  return !inProgress() || confirm("Start a new puzzle? Current progress will be lost.");
}

function wireControls() {
  $("goBackBtn").addEventListener("click", () => { window.location.href = "../index.html"; });
  document.querySelectorAll("#modeSeg button").forEach(b =>
    b.addEventListener("click", () => {
      const m = b.dataset.mode;
      if (m === S.mode) return;
      if (!confirmNew()) return;
      newState(m, S.diff);
      renderAll();
    }));
  document.querySelectorAll("#diffSeg button").forEach(b =>
    b.addEventListener("click", () => {
      if (b.dataset.diff === S.diff) return;
      if (!confirmNew()) return;
      newState(S.mode, b.dataset.diff);
      renderAll();
    }));
  $("newBtn").addEventListener("click", () => {
    if (!confirmNew()) return;
    newState(S.mode, S.diff);
    renderAll();
  });
  $("checkBtn").addEventListener("click", () => {
    let wrong = 0, empty = 0;
    for (const k in S.puz.cells) {
      const [r, c] = k.split(",");
      const inp = cellInput(+r, +c);
      const f = S.filled[k];
      if (!f || isRevealed(k)) { if (!f) empty++; continue; }
      if (f !== S.puz.cells[k]) { wrong++; if (inp) inp.classList.add("wrong"); }
      else if (inp) inp.classList.remove("wrong");
    }
    setStatus(wrong ? wrong + " letter" + (wrong > 1 ? "s" : "") + " wrong." :
      (empty ? "Everything filled so far is correct." : "Solved. Nice work."));
  });
  const reveal = keys => {
    keys.forEach(k => {
      S.filled[k] = S.puz.cells[k];
      if (!S.revealed.includes(k)) S.revealed.push(k);
    });
    renderAll();
    afterEdit();
  };
  $("revealLetterBtn").addEventListener("click", () => {
    if (S.sel) reveal([cellKey(S.sel.r, S.sel.c)]);
  });
  $("revealWordBtn").addEventListener("click", () => {
    const s = activeSlot();
    if (s) reveal(slotKeys(s));
  });
  $("revealAllBtn").addEventListener("click", () => {
    if (confirm("Reveal the whole puzzle?")) reveal(Object.keys(S.puz.cells));
  });
  $("clearBtn").addEventListener("click", () => {
    if (!confirm("Clear your letters? Revealed letters stay.")) return;
    for (const k of Object.keys(S.filled)) if (!isRevealed(k)) delete S.filled[k];
    renderAll();
    save();
  });
}

/* ---------- init ---------- */

function init() {
  const d = loadSaved();
  if (d) {
    S = {
      mode: ["cross", "fill", "plates"].includes(d.mode) ? d.mode : "cross",
      diff: DIFFS[d.diff] ? d.diff : "medium",
      puz: d.puz,
      filled: d.filled || {}, revealed: d.revealed || [],
      sel: null, armed: null,
    };
    buildMaps();
  } else {
    newState("cross", "medium");
  }
  wireGrid();
  wireControls();
  renderAll();
  // Warm the word index cache in the background so the first fill-in
  // generation doesn't pay the build cost (was causing the "easy/medium
  // slow on first try" perception; the index is shared across difficulties)
  setTimeout(() => { try { buildIndex(3, 6, false); } catch (e) {} }, 100);
}

document.addEventListener("DOMContentLoaded", init);
