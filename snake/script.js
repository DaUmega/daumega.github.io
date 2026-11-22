/* Snake: 1 point per food, no wrap. Board is a CSS grid of divs.
   Pure logic (createState, stepState, spawnFood, setDir) has no DOM
   dependency so it can be smoke-tested under Node.
   Direction changes queue up (one applied per tick); each queued turn is
   validated against the previous queued direction, so two fast turns
   (e.g. right, up, left) can never collapse into a direct reversal. */

const LSKEY = "daumega.snake.v1";
const SPEEDS = { slow: 150, normal: 110, fast: 75 };
const MIN_SPEED_MS = 50, MAX_SPEED_MS = 300;
const POINTS_PER_FOOD = 1;
const MIN_SIZE = 10, MAX_SIZE = 30, DEFAULT_SIZE = 20;

function clampSize(n, fallback) {
  n = parseInt(n, 10);
  if (isNaN(n)) return fallback;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

function isOpposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function createState(width, height) {
  const w = clampSize(width, DEFAULT_SIZE);
  const h = clampSize(height, DEFAULT_SIZE);
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const state = {
    width: w, height: h,
    snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
    dir: { x: 1, y: 0 }, queue: [],
    food: null, score: 0, over: false,
  };
  state.food = spawnFood(state);
  return state;
}

/* Random empty cell, or null if the board is full (snake wins). */
function spawnFood(state, rand) {
  rand = rand || Math.random;
  const taken = new Set(state.snake.map(c => c.x + "," + c.y));
  const free = [];
  for (let y = 0; y < state.height; y++)
    for (let x = 0; x < state.width; x++)
      if (!taken.has(x + "," + y)) free.push({ x, y });
  if (!free.length) return null;
  return free[Math.floor(rand() * free.length)];
}

/* Queue a turn (at most 3 waiting). Ignored if it is the exact opposite
   of the current direction or of the last queued turn, so the snake can't
   reverse straight into itself, even across two fast key presses. */
function setDir(state, dx, dy) {
  const next = { x: dx, y: dy };
  const base = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (isOpposite(next, base)) return false;
  if (next.x === base.x && next.y === base.y) return false;
  if (state.queue.length >= 3) return false;
  state.queue.push(next);
  return true;
}

/* One tick. Returns "ok", "ate", "dead", or "win" (board full). */
function stepState(state) {
  if (state.over) return "dead";
  if (state.queue.length) state.dir = state.queue.shift();
  const head = state.snake[0];
  const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };
  if (next.x < 0 || next.x >= state.width || next.y < 0 || next.y >= state.height) {
    state.over = true;
    return "dead";
  }
  const eating = state.food && next.x === state.food.x && next.y === state.food.y;
  const body = eating ? state.snake : state.snake.slice(0, -1);
  if (body.some(c => c.x === next.x && c.y === next.y)) {
    state.over = true;
    return "dead";
  }
  state.snake.unshift(next);
  if (eating) {
    state.score += POINTS_PER_FOOD;
    state.food = spawnFood(state);
    return state.food ? "ate" : "win";
  }
  state.snake.pop();
  return "ok";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LSKEY, SPEEDS, POINTS_PER_FOOD, clampSize, isOpposite, createState, spawnFood, setDir, stepState };
}

/* --- DOM wiring (browser only) --- */
if (typeof document !== "undefined") {
  const $ = id => document.getElementById(id);
  const boardEl = $("board"), statusEl = $("status"), scoreEl = $("scoreLine");
  const startBtn = $("startBtn"), newBtn = $("newBtn");
  const widthInput = $("widthInput"), heightInput = $("heightInput");
  const customSpeedInput = $("customSpeedInput");

  let S = null, timer = null, running = false, started = false;
  let speed = "normal", customMs = null, best = 0, cells = [];
  let touchX = null, touchY = null;

  /* Custom speed overrides the Slow/Normal/Fast buttons when set. */
  function speedMs() { return customMs || SPEEDS[speed]; }

  function loadPrefs() {
    try {
      const d = JSON.parse(localStorage.getItem(LSKEY));
      if (d && typeof d === "object") {
        if (Number.isInteger(d.best) && d.best >= 0) best = d.best;
        if (d.speed in SPEEDS) speed = d.speed;
        if (Number.isInteger(d.customMs) && d.customMs >= MIN_SPEED_MS && d.customMs <= MAX_SPEED_MS) {
          customMs = d.customMs;
          customSpeedInput.value = customMs;
        }
        if (d.width) widthInput.value = clampSize(d.width, DEFAULT_SIZE);
        if (d.height) heightInput.value = clampSize(d.height, DEFAULT_SIZE);
      }
    } catch (e) {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(LSKEY, JSON.stringify({
        best, speed, customMs,
        width: S ? S.width : clampSize(widthInput.value, DEFAULT_SIZE),
        height: S ? S.height : clampSize(heightInput.value, DEFAULT_SIZE),
      }));
    } catch (e) {}
  }

  function setStatus(m) { statusEl.textContent = m; }

  function renderScore() {
    scoreEl.textContent = "Score: " + S.score + " \u00b7 Best: " + best;
  }

  function buildBoard() {
    boardEl.style.setProperty("--cols", S.width);
    boardEl.innerHTML = "";
    cells = [];
    for (let i = 0; i < S.width * S.height; i++) {
      const c = document.createElement("div");
      c.className = "cell";
      boardEl.appendChild(c);
      cells.push(c);
    }
  }

  function render() {
    for (let i = 0; i < cells.length; i++) cells[i].className = "cell";
    S.snake.forEach((c, i) => {
      cells[c.y * S.width + c.x].className = "cell " + (i === 0 ? "head" : "snake");
    });
    if (S.food) cells[S.food.y * S.width + S.food.x].className = "cell food";
    renderScore();
  }

  function stopTimer() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    running = false;
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(tick, speedMs());
    running = true;
  }

  function tick() {
    const res = stepState(S);
    if (res === "dead") return gameOver("Game over. Score: " + S.score + ". Press New game to play again.");
    if (res === "win") return gameOver("You win! The board is full. Score: " + S.score + ".");
    if (S.score > best) { best = S.score; savePrefs(); }
    render();
  }

  function gameOver(msg) {
    stopTimer();
    started = false;
    startBtn.textContent = "Start";
    if (S.score > best) { best = S.score; savePrefs(); }
    render();
    setStatus(msg);
  }

  function newGame() {
    stopTimer();
    /* Never silently clamp: 100x100 is outside 10-30, so say so and
       show the size actually used. */
    const rawW = parseInt(widthInput.value, 10);
    const rawH = parseInt(heightInput.value, 10);
    const outOfRange = isNaN(rawW) || isNaN(rawH) ||
      rawW < MIN_SIZE || rawW > MAX_SIZE || rawH < MIN_SIZE || rawH > MAX_SIZE;
    S = createState(widthInput.value, heightInput.value);
    widthInput.value = S.width;
    heightInput.value = S.height;
    started = true;
    startBtn.textContent = "Pause";
    buildBoard();
    render();
    setStatus(outOfRange
      ? "Board size is 10-30, using " + S.width + "x" + S.height + ". Arrow keys or WASD to steer, Space to pause."
      : "Playing. Arrow keys or WASD to steer, Space to pause.");
    startTimer();
    savePrefs();
  }

  function toggleStart() {
    if (!S || S.over) { newGame(); return; }
    if (!started) {
      started = true;
      startBtn.textContent = "Pause";
      setStatus("Playing. Arrow keys or WASD to steer, Space to pause.");
      startTimer();
      return;
    }
    if (running) {
      stopTimer();
      startBtn.textContent = "Resume";
      setStatus("Paused. Score: " + S.score + ".");
    } else {
      startBtn.textContent = "Pause";
      setStatus("Playing. Arrow keys or WASD to steer, Space to pause.");
      startTimer();
    }
  }

  function setSpeed(next) {
    if (!(next in SPEEDS)) return;
    speed = next;
    customMs = null;
    customSpeedInput.value = "";
    document.querySelectorAll("#speedSeg button").forEach(b =>
      b.classList.toggle("on", b.dataset.speed === next));
    savePrefs();
    if (running) startTimer();
  }

  function applyCustomSpeed() {
    const raw = parseInt(customSpeedInput.value, 10);
    if (isNaN(raw)) {
      setStatus("Enter a custom speed in ms, " + MIN_SPEED_MS + "-" + MAX_SPEED_MS + " (50 fastest, 300 slowest).");
      return;
    }
    const clamped = Math.min(MAX_SPEED_MS, Math.max(MIN_SPEED_MS, raw));
    customMs = clamped;
    customSpeedInput.value = clamped;
    document.querySelectorAll("#speedSeg button").forEach(b => b.classList.remove("on"));
    savePrefs();
    if (running) startTimer();
    setStatus(raw === clamped
      ? "Custom speed " + clamped + " ms per step."
      : "Custom speed is " + MIN_SPEED_MS + "-" + MAX_SPEED_MS + " ms, using " + clamped + " ms.");
  }

  function resetSize() {
    widthInput.value = DEFAULT_SIZE;
    heightInput.value = DEFAULT_SIZE;
    newGame();
  }

  const KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };

  document.addEventListener("keydown", e => {
    const tag = (e.target && e.target.tagName) || "";
    const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (e.key === " " && !inField) {
      e.preventDefault();
      toggleStart();
      return;
    }
    const dir = KEYS[e.key];
    if (!dir) return;
    if (!inField) e.preventDefault();
    if (S && !S.over) {
      setDir(S, dir[0], dir[1]);
      if (!started && !running) toggleStart();
    }
  });

  boardEl.addEventListener("touchstart", e => {
    const t = e.changedTouches[0];
    touchX = t.clientX; touchY = t.clientY;
  }, { passive: true });

  boardEl.addEventListener("touchend", e => {
    if (touchX === null || !S || S.over) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX, dy = t.clientY - touchY;
    touchX = touchY = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(S, dx > 0 ? 1 : -1, 0);
    else setDir(S, 0, dy > 0 ? 1 : -1);
    if (!started && !running) toggleStart();
  }, { passive: true });

  function pad(dx, dy) {
    if (!S || S.over) return;
    setDir(S, dx, dy);
    if (!started && !running) toggleStart();
  }
  $("upBtn").addEventListener("click", () => pad(0, -1));
  $("downBtn").addEventListener("click", () => pad(0, 1));
  $("leftBtn").addEventListener("click", () => pad(-1, 0));
  $("rightBtn").addEventListener("click", () => pad(1, 0));

  document.querySelectorAll("#speedSeg button").forEach(b =>
    b.addEventListener("click", () => setSpeed(b.dataset.speed)));

  startBtn.addEventListener("click", toggleStart);
  newBtn.addEventListener("click", newGame);
  $("resetSizeBtn").addEventListener("click", resetSize);
  $("applySpeedBtn").addEventListener("click", applyCustomSpeed);
  customSpeedInput.addEventListener("keydown", e => { if (e.key === "Enter") applyCustomSpeed(); });
  $("goBackBtn").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "../games.html";
  });

  loadPrefs();
  document.querySelectorAll("#speedSeg button").forEach(b =>
    b.classList.toggle("on", !customMs && b.dataset.speed === speed));
  S = createState(widthInput.value, heightInput.value);
  buildBoard();
  render();
  setStatus("Press Start to play. Arrow keys or WASD to steer, Space to pause.");
}
