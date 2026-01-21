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
