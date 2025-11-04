// -------------------- Constants & State --------------------
const STORAGE_KEY = "periodTrackerData";
const SETTINGS_KEY = "periodTrackerSettings";
let periods = [];
let currentYear, currentMonth;
let settings = { alpha: 0.6 }; // per-user adaptive alpha (default 0.6)

const calendarEl = document.getElementById("calendar");
const popup = document.getElementById("popup");
const overlay = document.getElementById("overlay");
const popupDate = document.getElementById("popupDate");
const popupContent = document.getElementById("popupContent");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const clearBtn = document.getElementById("clearBtn");
const statsEl = document.getElementById("stats");
const messageEl = document.getElementById("message");

// -------------------- Helpers --------------------
// formatDate -> use LOCAL date components (avoids UTC shift)
const pad = n => String(n).padStart(2, "0");
const formatDate = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// addDays -> do local-date arithmetic (safer across DST/timezones)
const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// keep isSameOrBefore / isSameOrAfter as-is (they use formatDate now consistently)
const isSameOrBefore = (d1, d2) => formatDate(d1) <= formatDate(d2);
const isSameOrAfter = (d1, d2) => formatDate(d1) >= formatDate(d2);

function atMidnight(d) {
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x;
}

function parseLocalDate(iso) {
  if (!iso) return new Date(NaN);
  const parts = String(iso).split("-");
  if (parts.length !== 3) return new Date(iso); // fallback for other formats
  const [y, m, d] = parts.map(Number);
  return new Date(y, m - 1, d);
}

const showMessage = text => {
    messageEl.textContent = text;
    messageEl.style.display = "block";
    setTimeout(() => messageEl.style.display = "none", 3000);
};

function showPopupError(text) {
    let msg = popupContent.querySelector("#popupMessage");
    if (!msg) {
        msg = document.createElement("div");
        msg.id = "popupMessage";
        Object.assign(msg.style, {
            padding: "8px",
            marginBottom: "8px",
            borderRadius: "4px",
            background: "#ffecec",
            color: "#b20000",
            fontSize: "0.95em"
        });
        popupContent.prepend(msg);
    }
    msg.textContent = text;
}
const clearPopupError = () => popupContent.querySelector("#popupMessage")?.remove();

// -------------------- CycleMath --------------------
const CycleMath = {
    // Return array of recorded period lengths in days
    periodLengths() {
        return periods.map(p => {
            const start = parseLocalDate(p.start);
            const end = parseLocalDate(p.end);
            return Math.ceil((end - start) / 86400000) + 1;
        });
    },

    // Return array of recorded cycle lengths (days between consecutive starts)
    cycleLengths() {
        const cycles = [];
        for (let i = 1; i < periods.length; i++) {
            const diff = parseLocalDate(periods[i].start) - parseLocalDate(periods[i - 1].start);
            cycles.push(Math.ceil(diff / 86400000));
        }
        return cycles;
    },

    // Simple utility: weighted average with optional weights
    weightedAverage(values, weights = null) {
        if (!values.length) return 0;
        if (!weights) return Math.round(values.reduce((a, b) => a + b) / values.length);
        let wsum = 0, vwsum = 0;
        for (let i = 0; i < values.length; i++) {
            const w = weights[i] ?? 0;
            vwsum += values[i] * w;
            wsum += w;
        }
        return wsum ? Math.round(vwsum / wsum) : Math.round(values.reduce((a, b) => a + b) / values.length);
    },

    // Linear regression (index -> value) to detect trend in cycle lengths
    linearTrend(values) {
        if (values.length < 2) return { slope: 0, intercept: values.length ? values[0] : 0 };
        const n = values.length;
        const xs = values.map((_, i) => i + 1); // 1..n
        const xMean = xs.reduce((a, b) => a + b) / n;
        const yMean = values.reduce((a, b) => a + b) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
            num += (xs[i] - xMean) * (values[i] - yMean);
            den += (xs[i] - xMean) ** 2;
        }
        const slope = den ? num / den : 0;
        const intercept = yMean - slope * xMean;
        return { slope, intercept };
    },

    // Estimate standard deviation
    stddev(arr) {
        if (!arr.length) return 0;
        const mean = arr.reduce((a, b) => a + b) / arr.length;
        return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    },

    // Predict next N cycle lengths using a blend of recency-weighted average and linear trend
    predictCycleLengths(n = 4) {
        const cycles = this.cycleLengths();
        if (!cycles.length) return Array.from({ length: n }, () => 28); // fallback

        // recency weighting (exponential) - use per-user adaptive alpha
        // Note: weights defined as alpha^(len-1-i) so smaller alpha -> more recency emphasis.
        const alpha = settings.alpha ?? 0.6;

        const weights = cycles.map((_, i) => Math.pow(alpha, cycles.length - 1 - i));
        const weightedAvg = this.weightedAverage(cycles, weights);

        const { slope } = this.linearTrend(cycles);
        const std = this.stddev(cycles);

        const preds = [];
        for (let i = 1; i <= n; i++) {
            // Project with trend, but blend with weighted average to reduce overfitting
            let proj = weightedAvg + slope * i * 0.9;
            // Regularize and bound to plausible cycle lengths
            proj = Math.round(Math.max(21, Math.min(40, proj)));
            // if high variability, shrink toward 28
            if (std > 3.5) proj = Math.round(proj * 0.6 + 28 * 0.4);
            preds.push(proj);
        }
        return preds;
    },

    // Predict next N period lengths (days) using recency-weighted average and bounding
    predictPeriodLength() {
        const periodsArr = this.periodLengths();
        if (!periodsArr.length) return 5;
        const alpha = 0.6;
        const weights = periodsArr.map((_, i) => Math.pow(alpha, periodsArr.length - 1 - i));
        let p = this.weightedAverage(periodsArr, weights);
        p = Math.max(1, Math.min(14, p));
        return p;
    },

    // Public averages kept for compatibility; returns conservative estimates
    averages() {
        const avgPeriodLength = this.predictPeriodLength() || 5;
        const cyclePred = this.predictCycleLengths(1)[0] || 28;
        const avgCycleLength = Math.round(cyclePred);
        return {
            avgPeriodLength,
            avgCycleLength,
            avgOvulation: Math.max(1, avgCycleLength - 14)
        };
    },

    // Return best-matching day type for a given date using probabilistic scoring
    getDayType(date) {
        if (!periods.length) return { type: null, info: null };

        // Use recorded periods first (exact)
        for (let i = 0; i < periods.length; i++) {
            const { start, end } = periods[i];
            const s = parseLocalDate(start), e = parseLocalDate(end);
            if (isSameOrAfter(date, s) && isSameOrBefore(date, e))
                return { type: "period", info: `Recorded Period #${i + 1}` };
        }

        // Predict future cycles
        const lastStart = parseLocalDate(periods.at(-1).start);
        const predictedCycles = this.predictCycleLengths(4); // next 4 cycles
        const predictedPeriodLen = this.predictPeriodLength();

        // Initialize scores
        const scores = { period: 0, predicted: 0, ovulation: 0, fertile: 0 };
        let dayInfo = null;

        // We'll iterate advancing from the last known start (prevStart),
        // so each cycle uses its own length and the correct previous-start anchor.
        let prevStart = lastStart;

        for (let c = 0; c < predictedCycles.length; c++) {
            const cycleLen = predictedCycles[c];               // this cycle's length
            const predictedStart = addDays(prevStart, cycleLen); // next period start
            const predictedEnd = addDays(predictedStart, predictedPeriodLen - 1);

            // --- Predicted period scoring (soft window around predicted period) ---
            const windowStart = addDays(predictedStart, -1);
            const windowEnd = addDays(predictedEnd, 1);

            if (isSameOrAfter(date, windowStart) && isSameOrBefore(date, windowEnd)) {
                const normDate = atMidnight(date);
                const normStart = atMidnight(predictedStart);
                const daysSinceStart = (normDate - normStart) / 86400000;
                const centerOffset = (predictedPeriodLen - 1) / 2;
                const dist = Math.abs(daysSinceStart - centerOffset);
                const denom = Math.max(1, predictedPeriodLen / 2);
                const score = Math.max(0, 1 - (dist / denom));
                scores.period = Math.max(scores.period, score);
                scores.predicted = Math.max(scores.predicted, score);
                dayInfo = `Predicted Period (Cycle +${c + 1})`;
            }

            // --- Ovulation and fertile window scoring ---
            // Ovulation for *this* predicted cycle happens relative to the cycle's start (prevStart):
            // ovulation ≈ prevStart + (cycleLen - 14)  (bounded to at least day 1)
            const ovulationDay = addDays(prevStart, Math.max(1, cycleLen - 14));
            const daysFromOv = (date - ovulationDay) / 86400000;

            if (daysFromOv >= -6 && daysFromOv <= 1) {
                if (Math.round(daysFromOv) === 0) {
                    scores.ovulation = Math.max(scores.ovulation, 1);
                    dayInfo = "Predicted Ovulation";
                } else {
                    // Linear scoring for fertile days (better before ovulation)
                    const score = daysFromOv < 0 ? 1 + daysFromOv / 6 : 0.5;
                    scores.fertile = Math.max(scores.fertile, score * 0.9);
                    if (!dayInfo) dayInfo = "Predicted Fertile Window";
                }
            }

            // advance prevStart to this predicted period start for next iteration
            prevStart = predictedStart;
        }

        // --- Pick best type ---
        const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const [bestType, bestScore] = entries[0];

        // Threshold to avoid false positives
        if (bestScore < 0.1) return { type: null, info: null };

        if (bestType === "period" || bestType === "predicted") {
            return { type: "predicted", info: dayInfo ?? "Predicted Period" };
        }
        if (bestType === "ovulation") return { type: "ovulation", info: dayInfo ?? "Predicted Ovulation" };
        if (bestType === "fertile") return { type: "fertile", info: dayInfo ?? "Predicted Fertile Window" };

        return { type: null, info: null };
    }
};

// -------------------- Data --------------------
function loadData() {
    try { periods = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { periods = []; }
}

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (s && typeof s.alpha === "number") settings = s;
    } catch {
        settings = { alpha: 0.6 };
    }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Compute an adaptive alpha (0.25..0.95) based on cycle variability.
// Lower alpha -> more emphasis on recent (useful when cycles are stable).
// Higher alpha -> flatter weights (useful when cycles are volatile).
function computeAdaptiveAlpha() {
    const cycles = CycleMath.cycleLengths();
    if (!cycles.length) return settings.alpha ?? 0.6;

    const n = cycles.length;
    const std = CycleMath.stddev(cycles);

    const MAX_STD = 6;    // std at or above this maps to MAX_ALPHA
    const MIN_ALPHA = 0.25;
    const MAX_ALPHA = 0.95;
    // Map variability to base alpha (0 -> stable -> MIN_ALPHA, 1 -> volatile -> MAX_ALPHA)
    const t = clamp(std / MAX_STD, 0, 1);
    const baseAlpha = MIN_ALPHA + t * (MAX_ALPHA - MIN_ALPHA);

    // If we have only a few cycles, be conservative and blend toward a sensible default.
    // With very few cycles trust is low; with ~10+ cycles trust approaches 1.
    const defaultAlpha = 0.6;
    const trust = clamp((n - 2) / 8, 0, 1); // 2 cycles -> 0 trust, 10 cycles -> ~1 trust
    const blended = defaultAlpha * (1 - trust) + baseAlpha * trust;

    // Round to 2 decimals for stable persistence
    return Math.round(blended * 100) / 100;
}

// Update settings.alpha based on current data and persist.
function adaptAndSaveAlpha() {
    const newAlpha = computeAdaptiveAlpha();
    console.log("newAlpha:", newAlpha);
    if (Math.abs((settings.alpha ?? 0.6) - newAlpha) >= 0.01) {
        settings.alpha = newAlpha;
        saveSettings();
    }
}

function validateAndSortPeriods() {
    periods = periods
        .map(p => ({ start: parseLocalDate(p.start), end: parseLocalDate(p.end) }))
        .filter(p => !isNaN(p.start) && !isNaN(p.end) && p.start <= p.end)
        .map(p => ({
            start: formatDate(p.start),
            end: formatDate(p.end),
            duration: Math.ceil((p.end - p.start) / 86400000) + 1
        }))
        .filter(p => p.duration >= 1 && p.duration <= 14)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .filter((p, i, arr) => i === 0 || new Date(p.start) > new Date(arr[i - 1].end))
        .map(({ start, end }) => ({ start, end }));
}

function saveData() {
    validateAndSortPeriods();
    // adjust per-user alpha after validating/saving periods
    adaptAndSaveAlpha();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(periods));
    updateStats();
}

function isValidPeriod(startStr, endStr, skipIndex = -1) {
    const start = parseLocalDate(startStr), end = parseLocalDate(endStr);
    if (isNaN(start) || isNaN(end) || start > end) return false;
    const duration = Math.ceil((end - start) / 86400000) + 1;
    if (duration < 1 || duration > 14) return false;
    return periods.every((p, i) => 
        i === skipIndex || end < parseLocalDate(p.start) || start > parseLocalDate(p.end)
    );
}

// -------------------- Calendar --------------------
function prevMonth() { if (--currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(); }
function nextMonth() { if (++currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); }

function renderCalendar() {
    calendarEl.innerHTML = "";
    calendarEl.className = "calendar";
    renderCalendarHeader();
    renderCalendarDays();
}

function renderCalendarHeader() {
    const nav = document.createElement("div");
    nav.className = "calendar-header";

    const mkBtn = (cls, text, cb) => {
        const btn = document.createElement("button");
        btn.className = `nav-btn ${cls}`;
        btn.textContent = text;
        btn.onclick = cb;
        return btn;
    };

    const label = document.createElement("span");
    label.className = "month-label";
    label.textContent = new Date(currentYear, currentMonth)
        .toLocaleString("default", { month: "long", year: "numeric" });

    nav.append(mkBtn("left-btn", "◀", prevMonth), label, mkBtn("right-btn", "▶", nextMonth));
    calendarEl.appendChild(nav);
}

function renderCalendarDays() {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDay = firstDay.getDay();
    const today = formatDate(new Date());

    calendarEl.append(...Array.from({ length: startDay }, () => document.createElement("div")));

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(currentYear, currentMonth, d);
        const dateStr = formatDate(date);
        const div = document.createElement("div");
        div.className = "day";
        div.innerHTML = `<span>${d}</span>`;
        if (today === dateStr) div.classList.add("today");
        const { type, info } = CycleMath.getDayType(date);
        if (type) div.classList.add(type);
        div.onclick = () => showPopup(date, type, info);
        calendarEl.appendChild(div);
    }
}

// -------------------- Popup --------------------
function showPopup(date, type, info) {
    popupDate.textContent = date.toDateString();
    popupContent.innerHTML = "";
    clearPopupError();

    const addBtn = (text, cb) => {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.onclick = cb;
        popupContent.appendChild(btn);
    };

    addBtn("Mark Period Start", () => {
        periods.push({ start: formatDate(date), end: formatDate(date) });
        saveData(); renderCalendar(); closePopup();
        showMessage("Marked period start.");
    });

    addBtn("Mark Period End", () => {
        if (!periods.length) return showPopupError("No start date recorded yet.");

        // Find the most recent period that has no proper end (end == start or end < start)
        let i = periods
            .map((p, idx) => ({ ...p, idx }))
            .reverse()
            .find(p => new Date(p.end) <= new Date(p.start))?.idx;

        // If none found, default to last
        if (i === undefined) i = periods.length - 1;

        if (isValidPeriod(periods[i].start, formatDate(date), i)) {
            periods[i].end = formatDate(date);
            saveData(); renderCalendar(); closePopup();
            showMessage("Marked period end.");
        } else showPopupError("Invalid end date for this period.");
    });

    const idx = periods.findIndex(p =>
        isSameOrAfter(date, parseLocalDate(p.start)) && isSameOrBefore(date, parseLocalDate(p.end))
    );
    if (idx !== -1) addEditDeleteButtons(idx);

    if (type && info) popupContent.insertAdjacentHTML("beforeend", `<p>Info: ${info}</p>`);

    overlay.style.display = popup.style.display = "block";
}

function addEditDeleteButtons(index) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit Period Dates";
    editBtn.onclick = () => {
        popupContent.querySelector("#editForm")?.remove();
        clearPopupError();

        popupContent.insertAdjacentHTML("beforeend", `
            <div id="editForm">
                <input type="date" id="editStart" value="${periods[index].start}">
                <input type="date" id="editEnd" value="${periods[index].end}">
                <button id="saveEdit">Save</button>
            </div>`);

        popupContent.querySelector("#saveEdit").onclick = () => {
            const newStart = editStart.value, newEnd = editEnd.value;
            if (isValidPeriod(newStart, newEnd, index)) {
                periods[index] = { start: newStart, end: newEnd };
                saveData(); renderCalendar(); closePopup();
                showMessage("Period updated.");
            } else showPopupError("Invalid period! Duration must be 1–14 days and must not overlap other periods.");
        };
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete Period";
    delBtn.onclick = () => {
        clearPopupError();
        popupContent.querySelector("#deleteConfirm")?.remove();

        popupContent.insertAdjacentHTML("beforeend", `
            <div id="deleteConfirm" style="margin-top:10px;padding:8px;background:#fff3cd;border:1px solid #ffeeba;border-radius:6px;">
                <p style="margin:0 0 8px;color:#856404;">Are you sure you want to delete this period entry?</p>
                <button id="yesDel" style="background:#b20000;color:white;margin-right:8px;">Yes, Delete</button>
                <button id="noDel">Cancel</button>
            </div>`);

        yesDel.onclick = () => {
            periods.splice(index, 1);
            saveData(); renderCalendar(); closePopup();
            showMessage("Period deleted.");
        };
        noDel.onclick = () => deleteConfirm.remove();
    };

    popupContent.append(editBtn, delBtn);
}

const closePopup = () => {
    popup.style.display = overlay.style.display = "none";
    clearPopupError();
};

// -------------------- Stats --------------------
function updateStats() {
    if (!periods.length)
        return statsEl.innerHTML = "No period data recorded yet.";
    const { avgPeriodLength, avgCycleLength, avgOvulation } = CycleMath.averages();
    statsEl.innerHTML = `
        <b>Statistics:</b><br>
        Average Period Length: ${avgPeriodLength} days<br>
        Average Cycle Length: ${avgCycleLength} days<br>
        Estimated Ovulation Day (after period start): Day ${avgOvulation}`;
}

// -------------------- Export / Import / Clear --------------------
exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(periods, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: "period_data.json"
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showMessage("Data exported.");
};

importBtn.onclick = () => importFile.click();
importFile.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (Array.isArray(data)) {
                periods = data;
                saveData(); renderCalendar();
                showMessage("Data imported successfully.");
            } else showMessage("Invalid file format.");
        } catch { showMessage("Failed to parse file."); }
    };
    reader.readAsText(file);
    importFile.value = "";
};

clearBtn.onclick = () => {
    const box = document.getElementById("clearConfirm");
    box.style.display = "block";
};

document.getElementById("yesClear").onclick = () => {
    periods = [];
    saveData();
    renderCalendar();
    showMessage("All data cleared.");
    document.getElementById("clearConfirm").style.display = "none";
};

document.getElementById("noClear").onclick = () => {
    document.getElementById("clearConfirm").style.display = "none";
};

document.getElementById("goBackBtn").onclick = () => window.location.href = "../index.html";

// -------------------- Init --------------------
loadSettings();
loadData();
// ensure loaded data is validated/sorted before computing/adapting alpha
validateAndSortPeriods();
adaptAndSaveAlpha();
updateStats();
const today = new Date();
currentYear = today.getFullYear();
currentMonth = today.getMonth();
renderCalendar();
