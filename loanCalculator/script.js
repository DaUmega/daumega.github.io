document.getElementById("calculateBtn").addEventListener("click", () => {
    const amount = parseFloat(document.getElementById("loanAmount").value);
    const annualRate = parseFloat(document.getElementById("interestRate").value);
    const termValue = parseFloat(document.getElementById("loanTerm").value);
    const termUnit = document.getElementById("loanTermUnit").value;
    const paymentsPerYear = parseInt(document.getElementById("paymentFrequency").value);
    const extraPayment = parseFloat(document.getElementById("extraPayment").value) || 0;

    if (isNaN(amount) || isNaN(annualRate) || isNaN(termValue) || amount <= 0 || annualRate <= 0 || termValue <= 0) {
        alert("Please enter valid numbers.");
        return;
    }

    // Convert loan term into years
    const years = (termUnit === "months") ? termValue / 12 : termValue;

    const ratePerPeriod = annualRate / 100 / paymentsPerYear;
    const totalPayments = years * paymentsPerYear;

    // Formula: M = P[r(1+r)^n]/[(1+r)^n – 1]
    const numerator = amount * ratePerPeriod * Math.pow(1 + ratePerPeriod, totalPayments);
    const denominator = Math.pow(1 + ratePerPeriod, totalPayments) - 1;
    const basePayment = numerator / denominator;

    let balance = amount;
    let principalData = [];
    let interestData = [];
    let totalInterest = 0;
    let paymentCount = 0;

    let amortizationSchedule = [];

    while (balance > 0 && paymentCount < totalPayments + 1) {
        paymentCount++;
        let interestPayment = balance * ratePerPeriod;
        let principalPayment = basePayment - interestPayment;

        principalPayment += extraPayment;

        if (principalPayment > balance) {
            principalPayment = balance;
            interestPayment = balance * ratePerPeriod;
        }

        balance -= principalPayment;
        totalInterest += interestPayment;

        principalData.push(principalPayment);
        interestData.push(interestPayment);

        amortizationSchedule.push({
            Payment: paymentCount,
            Principal: principalPayment.toFixed(2),
            Interest: interestPayment.toFixed(2),
            Balance: balance.toFixed(2)
        });

        if (balance <= 0) break;
    }

    const totalPaid = (basePayment + extraPayment) * paymentCount;
    const baselineInterest = (basePayment * totalPayments) - amount;
    const interestSaved = baselineInterest - totalInterest;

    document.getElementById("monthlyPayment").textContent = formatCurrency(basePayment);
    document.getElementById("totalPayment").textContent = formatCurrency(totalPaid);
    document.getElementById("totalInterest").textContent = formatCurrency(totalInterest);
    document.getElementById("monthsToPayoff").textContent = `${paymentCount} (${(paymentCount / paymentsPerYear).toFixed(2)} years)`;

    // Remove old interest saved element if it exists
    let oldSaved = document.getElementById("interestSaved");
    if (oldSaved) oldSaved.remove();

    // Add new interest saved element
    if (extraPayment > 0) {
        let savedElem = document.createElement("p");
        savedElem.id = "interestSaved";
        savedElem.innerHTML = `<strong style="color:#2a7f62">Interest Saved: ${formatCurrency(interestSaved)}</strong>`;
        document.getElementById("results").appendChild(savedElem);
    }

    document.getElementById("results").style.display = "block";
    drawChart(principalData, interestData);

    // Show CSV download button
    const downloadBtn = document.getElementById("downloadCsvBtn");
    downloadBtn.style.display = "block";
    downloadBtn.onclick = () => downloadCsv(amortizationSchedule);
});

function formatCurrency(num) {
    return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function drawChart(principalData, interestData) {
    const canvas = document.getElementById("amortizationChart");
    const ctx = canvas.getContext("2d");

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const totalPeriods = principalData.length;
    const marginLeft = 60;
    const marginBottom = 40;
    const marginTop = 20;
    const marginRight = 20;

    const chartWidth = canvas.width - marginLeft - marginRight;
    const chartHeight = canvas.height - marginTop - marginBottom;

    const barWidth = chartWidth / totalPeriods;
    const maxPayment = Math.max(...principalData.map((p, i) => p + interestData[i]));

    // Axes
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginLeft, marginTop);
    ctx.lineTo(marginLeft, canvas.height - marginBottom);
    ctx.lineTo(canvas.width - marginRight, canvas.height - marginBottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = "#000";
    ctx.font = "12px Arial";
    ctx.textAlign = "right";
    let steps = 5;
    for (let i = 0; i <= steps; i++) {
        let val = (maxPayment / steps) * i;
        let y = canvas.height - marginBottom - (val / maxPayment) * chartHeight;
        ctx.fillText("$" + Math.round(val), marginLeft - 8, y + 4);
        ctx.beginPath();
        ctx.moveTo(marginLeft - 3, y);
        ctx.lineTo(marginLeft + 3, y);
        ctx.stroke();
    }

    // X-axis labels
    ctx.textAlign = "center";
    for (let i = 0; i <= totalPeriods; i += Math.ceil(totalPeriods / 10)) {
        let x = marginLeft + i * barWidth;
        ctx.fillText(i.toString(), x, canvas.height - 20);
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - marginBottom - 3);
        ctx.lineTo(x, canvas.height - marginBottom + 3);
        ctx.stroke();
    }

    // Draw bars
    for (let i = 0; i < totalPeriods; i++) {
        let interestHeight = (interestData[i] / maxPayment) * chartHeight;
        let principalHeight = (principalData[i] / maxPayment) * chartHeight;

        let x = marginLeft + i * barWidth;
        let yInterest = canvas.height - marginBottom - interestHeight;
        let yPrincipal = yInterest - principalHeight;

        ctx.fillStyle = "rgba(255,0,0,0.7)";
        ctx.fillRect(x, yInterest, barWidth, interestHeight);

        ctx.fillStyle = "rgba(0,0,255,0.7)";
        ctx.fillRect(x, yPrincipal, barWidth, principalHeight);
    }

    // Axis labels
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Payments →", canvas.width / 2, canvas.height - 5);

    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Payment Amount ($)", -canvas.height / 2, 15);
    ctx.restore();

    // Legend
    const legendX = canvas.width - 120;
    const legendY = 20;
    ctx.fillStyle = "rgba(255,0,0,0.7)";
    ctx.fillRect(legendX, legendY, 15, 15);
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.fillText("Interest", legendX + 20, legendY + 12);

    ctx.fillStyle = "rgba(0,0,255,0.7)";
    ctx.fillRect(legendX, legendY + 25, 15, 15);
    ctx.fillStyle = "#000";
    ctx.fillText("Principal", legendX + 20, legendY + 37);
}

function downloadCsv(schedule) {
    const header = ["Payment", "Principal", "Interest", "Balance"];
    const rows = schedule.map(p => [p.Payment, p.Principal, p.Interest, p.Balance]);

    let csvContent = "data:text/csv;charset=utf-8," 
        + header.join(",") + "\n"
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "amortization_schedule.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.getElementById("goBackBtn").addEventListener("click", () => {
    window.location.href = "../index.html";
});

// Universal Dark Mode Toggle
(function () {
    const STORAGE_KEY = "darkMode", body = document.body;

    // Dark mode CSS
    const sheet = document.createElement("style");
    sheet.id = "universal-dark-mode-sheet";
    sheet.textContent = `
        .dark-mode {
            --dm-bg:#0f0f10;--dm-surface:#1e1e1e;--dm-text:#eaeaea;--dm-muted:#bdbdbd;--dm-accent:#eaeaea;
        }
        .dark-mode, .dark-mode body {background-color:var(--dm-bg)!important;color:var(--dm-text)!important;}
        .dark-mode .dm-btn {background:#2a2a2a!important;color:var(--dm-text)!important;border:1px solid rgba(200,200,200,0.45)!important;border-radius:8px!important;box-shadow:0 0 10px rgba(200,200,200,0.18)!important;}
        .dark-mode .dm-title {color:var(--dm-accent)!important;}
        .dark-mode .dm-note {color:var(--dm-muted)!important;font-style:italic;}
        .dark-mode .dm-panel {background:var(--dm-surface)!important;color:var(--dm-text)!important;border:1px solid rgba(255,255,255,0.03)!important;box-shadow:0 6px 18px rgba(0,0,0,0.35) inset!important;}
        .dark-mode * {transition:color 0.25s ease,background-color 0.25s ease,border-color 0.25s ease,box-shadow 0.25s ease!important;}
    `;
    document.head.appendChild(sheet);

    // Toggle button
    const toggle = Object.assign(document.createElement("button"), {
        id: "dark-mode-toggle",
        textContent: "🌙",
        onclick() {
            const enabled = body.classList.toggle("dark-mode");
            toggle.textContent = enabled ? "☀️" : "🌙";
            localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
            enabled ? applyDark() : restoreStyles();
        }
    });
    Object.assign(toggle.style, {
        position:"fixed",bottom:"15px",right:"15px",background:"transparent",
        border:"2px solid rgba(200,200,200,0.22)",borderRadius:"8px",
        fontSize:"1.4rem",cursor:"pointer",zIndex:2147483647,
        padding:"6px",lineHeight:"1",display:"flex",
        alignItems:"center",justifyContent:"center",
        transition:"transform 0.18s ease,border-color 0.18s ease,opacity 0.18s ease"
    });
    toggle.onmouseenter = () => { toggle.style.transform="scale(1.15)"; toggle.style.borderColor="rgba(200,200,200,0.7)"; };
    toggle.onmouseleave = () => { toggle.style.transform="scale(1)"; toggle.style.borderColor="rgba(200,200,200,0.22)"; };
    document.body.appendChild(toggle);

    // Load preference
    const saved = localStorage.getItem(STORAGE_KEY);
    body.classList.toggle("dark-mode", saved === "true");
	toggle.textContent = saved === "true" ? "☀️" : "🌙";
	if (saved === "true") applyDark();

    const brightness = rgb => (rgb[0]*299 + rgb[1]*587 + rgb[2]*114)/1000;

    function applyDark() {
        document.querySelectorAll("*").forEach(el => {
            if (el.dataset.dmProcessed) return;
            el.dataset.dmOriginalStyle = el.getAttribute("style")||"";
            const added = [];
            try {
                const cs = getComputedStyle(el), bg = cs.backgroundColor || "", color = cs.color || "", fs = parseFloat(cs.fontSize||0);
                if (el.tagName==="BUTTON" || el.getAttribute("role")==="button") added.push("dm-btn", el.classList.add("dm-btn"));
                else {
                    if (/[\p{Emoji}]/u.test(el.textContent||"") || fs>=18) added.push("dm-title", el.classList.add("dm-title"));
                    else if (fs<=12 || cs.fontStyle==="italic") added.push("dm-note", el.classList.add("dm-note"));
                    if (bg && bg!=="rgba(0, 0, 0, 0)" && bg.match(/\d+/)) {
                        const rgb = bg.match(/\d+/g).map(Number);
                        if (brightness(rgb)>150) added.push("dm-panel", el.classList.add("dm-panel"));
                    }
                    if (el.tagName==="INPUT" && ["button","submit","reset"].includes((el.type||"").toLowerCase())) added.push("dm-btn", el.classList.add("dm-btn"));
                }
                if (added.length) el.dataset.dmAddedClasses = added.join(" ");
            } catch(e){}
            el.dataset.dmProcessed = "1";
        });
    }

    function restoreStyles() {
        document.querySelectorAll("[data-dm-processed='1']").forEach(el=>{
            const orig = el.dataset.dmOriginalStyle||""; orig ? el.setAttribute("style",orig) : el.removeAttribute("style");
            (el.dataset.dmAddedClasses||"").split(/\s+/).forEach(c=>c&&el.classList.remove(c));
            delete el.dataset.dmProcessed; delete el.dataset.dmOriginalStyle; delete el.dataset.dmAddedClasses;
        });
        body.classList.remove("dark-mode");
    }
})();
