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

// -------------------- Helper Functions --------------------
const formatDate = date => date.toISOString().split("T")[0];

const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

const isSameOrBefore = (d1, d2) => formatDate(d1) <= formatDate(d2);
const isSameOrAfter = (d1, d2) => formatDate(d1) >= formatDate(d2);

// -------------------- CycleMath Module --------------------
const CycleMath = {
    periodLengths() {
        return periods.map(p => {
            const start = new Date(p.start);
            const end = new Date(p.end);
            return Math.ceil((end - start) / (1000*60*60*24)) + 1;
        });
    },

    cycleLengths() {
        let cycles = [];
        for (let i = 1; i < periods.length; i++) {
            const prevStart = new Date(periods[i-1].start);
            const currStart = new Date(periods[i].start);
            cycles.push(Math.ceil((currStart - prevStart)/(1000*60*60*24)));
        }
        return cycles;
    },

    average(arr, fallback=0) {
        return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : fallback;
    },

    averages() {
        const avgPeriodLength = this.average(this.periodLengths(), 5);
        const avgCycleLength = this.average(this.cycleLengths(), 28);
        const avgOvulation = avgCycleLength - 14;
        return { avgPeriodLength, avgCycleLength, avgOvulation };
    },

    getDayType(date) {
        if (!periods.length) return { type:null, info:null };

        const { avgPeriodLength, avgCycleLength } = this.averages();

        // Check recorded periods
        for (let i = 0; i < periods.length; i++) {
            const p = periods[i];
            const start = new Date(p.start);
            const end = new Date(p.end);
            if (isSameOrAfter(date, start) && isSameOrBefore(date, end))
                return { type:"period", info:`Recorded Period #${i+1}` };
        }

        const lastStart = new Date(periods[periods.length-1].start);

        // Predict next 3 cycles
        for (let c = 0; c <= 3; c++) {
            const predictedStart = addDays(lastStart, avgCycleLength * c);
            const predictedEnd = addDays(predictedStart, avgPeriodLength - 1);

            if (isSameOrAfter(date, predictedStart) && isSameOrBefore(date, predictedEnd))
                return { type:"predicted", info:`Predicted Period (Cycle +${c})` };

            const ovulationDay = addDays(predictedStart, avgCycleLength - 14);
            const fertileStart = addDays(ovulationDay, -5);
            const fertileEnd = addDays(ovulationDay, 1);

            if (isSameOrAfter(date, fertileStart) && isSameOrBefore(date, fertileEnd)) {
                if (formatDate(date) === formatDate(ovulationDay))
                    return { type:"ovulation", info:"Predicted Ovulation" };
                return { type:"fertile", info:"Predicted Fertile Window" };
            }
        }

        return { type:null, info:null };
    }
};

// -------------------- Load / Save --------------------
function loadData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try { periods = JSON.parse(data); } catch { periods = []; }
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(periods));
    updateStats();
}

// -------------------- Calendar Navigation --------------------
function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
}

// -------------------- Calendar Rendering --------------------
function renderCalendar() {
    calendarEl.innerHTML = "";
    calendarEl.className = "calendar";

    renderCalendarHeader();
    renderCalendarDays();
}

function renderCalendarHeader() {
    const nav = document.createElement("div");
    nav.className = "calendar-header";

    const leftBtn = document.createElement("button");
    leftBtn.className = "nav-btn left-btn";
    leftBtn.textContent = "◀";
    leftBtn.onclick = prevMonth;

    const rightBtn = document.createElement("button");
    rightBtn.className = "nav-btn right-btn";
    rightBtn.textContent = "▶";
    rightBtn.onclick = nextMonth;

    const monthLabel = document.createElement("span");
    monthLabel.className = "month-label";
    monthLabel.textContent = ` ${new Date(currentYear, currentMonth).toLocaleString("default", { month: "long", year: "numeric" })} `;

    nav.append(leftBtn, monthLabel, rightBtn);
    calendarEl.appendChild(nav);
}

function renderCalendarDays() {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth+1, 0);
    const startDay = firstDay.getDay();
    const today = new Date();

    for (let i=0; i<startDay; i++) calendarEl.appendChild(document.createElement("div"));

    for (let d=1; d<=lastDay.getDate(); d++) {
        const date = new Date(currentYear, currentMonth, d);
        const dateStr = formatDate(date);
        const div = document.createElement("div");
        div.className = "day";
        div.innerHTML = `<span>${d}</span>`;

        if (formatDate(today) === dateStr) div.classList.add("today");

        const { type, info } = CycleMath.getDayType(date);
        if (type) div.classList.add(type);

        div.addEventListener("click", () => showPopup(date, type, info));
        calendarEl.appendChild(div);
    }
}

// -------------------- Popup --------------------
function showPopup(date, type, info) {
    popupDate.textContent = date.toDateString();
    popupContent.innerHTML = "";

    const btnStart = document.createElement("button");
    btnStart.textContent = "Mark Period Start";
    btnStart.onclick = () => {
        periods.push({ start: formatDate(date), end: formatDate(date) });
        saveData(); renderCalendar(); closePopup();
    };

    const btnEnd = document.createElement("button");
    btnEnd.textContent = "Mark Period End";
    btnEnd.onclick = () => {
        if (periods.length > 0) {
            periods[periods.length-1].end = formatDate(date);
            saveData(); renderCalendar(); closePopup();
        } else alert("No start date recorded yet!");
    };

    popupContent.append(btnStart, btnEnd);

    let matchIndex = -1;
    for (let i = 0; i < periods.length; i++) {
        const start = new Date(periods[i].start);
        const end = new Date(periods[i].end);
        if (isSameOrAfter(date, start) && isSameOrBefore(date, end)) {
            matchIndex = i;
            break;
        }
    }
    if (matchIndex !== -1) addEditDeleteButtons(matchIndex);

    if (type && info) {
        const p = document.createElement("p");
        p.textContent = "Info: " + info;
        popupContent.appendChild(p);
    }

    overlay.style.display = "block";
    popup.style.display = "block";
}

function addEditDeleteButtons(index) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit Period Dates";
    editBtn.onclick = () => {
        const newStart = prompt("Enter new start (YYYY-MM-DD):", periods[index].start);
        const newEnd = prompt("Enter new end (YYYY-MM-DD):", periods[index].end);
        if (newStart && newEnd) {
            periods[index] = { start:newStart, end:newEnd };
            saveData(); renderCalendar(); closePopup();
        }
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete Period";
    delBtn.onclick = () => {
        if (confirm("Delete this recorded period?")) {
            periods.splice(index,1);
            saveData(); renderCalendar(); closePopup();
        }
    };

    popupContent.append(editBtn, delBtn);
}

function closePopup() {
    popup.style.display = "none";
    overlay.style.display = "none";
}

// -------------------- Statistics --------------------
function updateStats() {
    if (!periods.length) {
        statsEl.innerHTML = "No period data recorded yet.";
        return;
    }

    const { avgPeriodLength, avgCycleLength, avgOvulation } = CycleMath.averages();

    statsEl.innerHTML = `
        <b>Statistics:</b><br>
        Average Period Length: ${avgPeriodLength} days<br>
        Average Cycle Length: ${avgCycleLength} days<br>
        Estimated Ovulation Day (after period start): Day ${avgOvulation}
    `;
}

// -------------------- Export / Import / Clear --------------------
exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(periods, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "period_data.json";
    a.click();
    URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (Array.isArray(data)) {
                periods = data;
                saveData(); renderCalendar();
                alert("Data imported successfully!");
            } else alert("Invalid file format.");
        } catch { alert("Failed to parse file."); }
    };
    reader.readAsText(file);
    importFile.value = "";
});

clearBtn.addEventListener("click", () => {
    if (confirm("Delete ALL recorded data?")) {
        periods = []; saveData(); renderCalendar();
    }
});

document.getElementById("goBackBtn").addEventListener("click", () => {
	window.location.href = "../index.html"; // adjust if your tools page is elsewhere
});

// -------------------- Initialization --------------------
loadData();
updateStats();
const today = new Date();
currentYear = today.getFullYear();
currentMonth = today.getMonth();
renderCalendar();
