// -------------------- Constants & State --------------------
const STORAGE_KEY = "periodTrackerData";
let periods = [];
let currentYear, currentMonth;

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
const formatDate = date => date.toISOString().split("T")[0];
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const isSameOrBefore = (d1, d2) => formatDate(d1) <= formatDate(d2);
const isSameOrAfter = (d1, d2) => formatDate(d1) >= formatDate(d2);

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
    periodLengths() {
        return periods.map(p => {
            const start = new Date(p.start);
            const end = new Date(p.end);
            return Math.ceil((end - start) / 86400000) + 1;
        });
    },
    cycleLengths() {
        const cycles = [];
        for (let i = 1; i < periods.length; i++) {
            const diff = new Date(periods[i].start) - new Date(periods[i - 1].start);
            cycles.push(Math.ceil(diff / 86400000));
        }
        return cycles;
    },
    average(arr, fallback = 0) {
        return arr.length ? Math.round(arr.reduce((a, b) => a + b) / arr.length) : fallback;
    },
    averages() {
        const avgPeriodLength = this.average(this.periodLengths(), 5);
        const avgCycleLength = this.average(this.cycleLengths(), 28);
        return { 
            avgPeriodLength, 
            avgCycleLength, 
            avgOvulation: avgCycleLength - 14 
        };
    },
    getDayType(date) {
        if (!periods.length) return { type: null, info: null };

        const { avgPeriodLength, avgCycleLength } = this.averages();

        // Recorded periods
        for (let i = 0; i < periods.length; i++) {
            const { start, end } = periods[i];
            const s = new Date(start), e = new Date(end);
            if (isSameOrAfter(date, s) && isSameOrBefore(date, e))
                return { type: "period", info: `Recorded Period #${i + 1}` };
        }

        const lastStart = new Date(periods.at(-1).start);

        for (let c = 1; c <= 3; c++) {
            const predictedStart = addDays(lastStart, avgCycleLength * c);
            const predictedEnd = addDays(predictedStart, avgPeriodLength - 1);
            if (isSameOrAfter(date, predictedStart) && isSameOrBefore(date, predictedEnd))
                return { type: "predicted", info: `Predicted Period (Cycle +${c})` };

            const ovulationDay = addDays(predictedStart, avgCycleLength - 14);
            const fertileStart = addDays(ovulationDay, -5);
            const fertileEnd = addDays(ovulationDay, 1);
            if (isSameOrAfter(date, fertileStart) && isSameOrBefore(date, fertileEnd))
                return { 
                    type: formatDate(date) === formatDate(ovulationDay) ? "ovulation" : "fertile",
                    info: formatDate(date) === formatDate(ovulationDay)
                        ? "Predicted Ovulation"
                        : "Predicted Fertile Window"
                };
        }
        return { type: null, info: null };
    }
};

// -------------------- Data --------------------
function loadData() {
    try { periods = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { periods = []; }
}

function validateAndSortPeriods() {
    periods = periods
        .map(p => ({ start: new Date(p.start), end: new Date(p.end) }))
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(periods));
    updateStats();
}

function isValidPeriod(startStr, endStr, skipIndex = -1) {
    const start = new Date(startStr), end = new Date(endStr);
    if (isNaN(start) || isNaN(end) || start > end) return false;
    const duration = Math.ceil((end - start) / 86400000) + 1;
    if (duration < 1 || duration > 14) return false;
    return periods.every((p, i) => 
        i === skipIndex || end < new Date(p.start) || start > new Date(p.end)
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
        isSameOrAfter(date, new Date(p.start)) && isSameOrBefore(date, new Date(p.end))
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
loadData();
updateStats();
const today = new Date();
currentYear = today.getFullYear();
currentMonth = today.getMonth();
renderCalendar();
