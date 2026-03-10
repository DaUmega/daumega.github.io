document.getElementById("calculateBtn").addEventListener("click", () => {
    const amount = parseFloat(document.getElementById("loanAmount").value);
    const annualRate = parseFloat(document.getElementById("interestRate").value);
    const termValue = parseFloat(document.getElementById("loanTerm").value);
    const termUnit = document.getElementById("loanTermUnit").value;
    const paymentsPerYear = parseInt(document.getElementById("paymentFrequency").value);
    const extraPayment = parseFloat(document.getElementById("extraPayment").value) || 0;

    if (isNaN(amount) || isNaN(annualRate) || isNaN(termValue) || amount <= 0 || annualRate <= 0 || termValue <= 0) {
        const err = document.getElementById("formError");
        err.textContent = "Please enter valid positive numbers for all required fields.";
        err.style.display = "block";
        return;
    }
    document.getElementById("formError").style.display = "none";

    const years = (termUnit === "months") ? termValue / 12 : termValue;
    const ratePerPeriod = annualRate / 100 / paymentsPerYear;
    const totalPayments = years * paymentsPerYear;

    const numerator = amount * ratePerPeriod * Math.pow(1 + ratePerPeriod, totalPayments);
    const denominator = Math.pow(1 + ratePerPeriod, totalPayments) - 1;
    const basePayment = numerator / denominator;

    let balance = amount, principalData = [], interestData = [];
    let totalInterest = 0, paymentCount = 0, amortizationSchedule = [];

    while (balance > 0 && paymentCount < totalPayments + 1) {
        paymentCount++;
        let interestPayment = balance * ratePerPeriod;
        let principalPayment = basePayment - interestPayment + extraPayment;
        if (principalPayment > balance) {
            principalPayment = balance;
            interestPayment = balance * ratePerPeriod;
        }
        balance -= principalPayment;
        totalInterest += interestPayment;
        principalData.push(principalPayment);
        interestData.push(interestPayment);
        amortizationSchedule.push({ Payment: paymentCount, Principal: principalPayment.toFixed(2), Interest: interestPayment.toFixed(2), Balance: balance.toFixed(2) });
        if (balance <= 0) break;
    }

    const totalPaid = (basePayment + extraPayment) * paymentCount;
    const baselineInterest = (basePayment * totalPayments) - amount;
    const interestSaved = baselineInterest - totalInterest;

    document.getElementById("monthlyPayment").textContent = formatCurrency(basePayment);
    document.getElementById("totalPayment").textContent = formatCurrency(totalPaid);
    document.getElementById("totalInterest").textContent = formatCurrency(totalInterest);
    document.getElementById("monthsToPayoff").textContent = `${paymentCount} (${(paymentCount / paymentsPerYear).toFixed(2)} yrs)`;

    document.getElementById("interestSaved")?.remove();
    if (extraPayment > 0) {
        const el = document.createElement("p");
        el.id = "interestSaved";
        el.textContent = `Interest Saved: ${formatCurrency(interestSaved)}`;
        document.getElementById("results").appendChild(el);
    }

    document.getElementById("results").style.display = "block";
    drawChart(principalData, interestData);

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
    const mL = 60, mB = 40, mT = 20, mR = 20;
    const cW = canvas.width - mL - mR;
    const cH = canvas.height - mT - mB;
    const barWidth = cW / totalPeriods;
    const maxPayment = Math.max(...principalData.map((p, i) => p + interestData[i]));

    // Theme colors
    const colorAxis   = "rgba(255,255,255,0.15)";
    const colorLabel  = "#94a3b8";
    const colorPrin   = "rgba(6,182,212,0.75)";
    const colorInt    = "rgba(244,63,94,0.7)";

    // Axes
    ctx.strokeStyle = colorAxis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mL, mT);
    ctx.lineTo(mL, canvas.height - mB);
    ctx.lineTo(canvas.width - mR, canvas.height - mB);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = colorLabel;
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
        const val = (maxPayment / 5) * i;
        const y = canvas.height - mB - (val / maxPayment) * cH;
        ctx.fillText("$" + Math.round(val), mL - 8, y + 4);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(canvas.width - mR, y); ctx.stroke();
    }

    // X-axis labels
    ctx.fillStyle = colorLabel;
    ctx.textAlign = "center";
    for (let i = 0; i <= totalPeriods; i += Math.ceil(totalPeriods / 10)) {
        const x = mL + i * barWidth;
        ctx.fillText(i.toString(), x, canvas.height - 8);
    }

    // Bars
    for (let i = 0; i < totalPeriods; i++) {
        const x = mL + i * barWidth;
        const iH = (interestData[i] / maxPayment) * cH;
        const pH = (principalData[i] / maxPayment) * cH;
        const yI = canvas.height - mB - iH;
        const yP = yI - pH;
        ctx.fillStyle = colorInt;  ctx.fillRect(x, yI, barWidth, iH);
        ctx.fillStyle = colorPrin; ctx.fillRect(x, yP, barWidth, pH);
    }

    // Axis labels
    ctx.fillStyle = colorLabel;
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("Payments", canvas.width / 2, canvas.height - 2);
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Amount ($)", -canvas.height / 2, 12);
    ctx.restore();

    // Legend
    const lX = canvas.width - 100, lY = mT;
    ctx.fillStyle = colorInt;  ctx.fillRect(lX, lY, 12, 12);
    ctx.fillStyle = colorLabel; ctx.textAlign = "left"; ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText("Interest", lX + 17, lY + 10);
    ctx.fillStyle = colorPrin; ctx.fillRect(lX, lY + 20, 12, 12);
    ctx.fillStyle = colorLabel;
    ctx.fillText("Principal", lX + 17, lY + 30);
}

function downloadCsv(schedule) {
    const header = ["Payment", "Principal", "Interest", "Balance"];
    const rows = schedule.map(p => [p.Payment, p.Principal, p.Interest, p.Balance]);
    const csv = "data:text/csv;charset=utf-8," + header.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: encodeURI(csv), download: "amortization_schedule.csv" });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

document.getElementById("goBackBtn").addEventListener("click", () => { window.location.href = "../index.html"; });
