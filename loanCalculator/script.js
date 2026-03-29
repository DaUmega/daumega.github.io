document.getElementById("calculateBtn").addEventListener("click", calculate);

function calculate() {
    const amount          = parseFloat(document.getElementById("loanAmount").value);
    const annualRate      = parseFloat(document.getElementById("interestRate").value);
    const termValue       = parseFloat(document.getElementById("loanTerm").value);
    const termUnit        = document.getElementById("loanTermUnit").value;
    const paymentsPerYear = parseInt(document.getElementById("paymentFrequency").value);
    const compoundFreq    = parseInt(document.getElementById("compoundFrequency").value);

    const ppAmount     = parseFloat(document.getElementById("ppAmount").value)     || 0;
    const ppStart      = Math.max(1, parseInt(document.getElementById("ppStart").value)     || 1);
    const annualAmount = parseFloat(document.getElementById("annualAmount").value) || 0;
    const annualStart  = Math.max(1, parseInt(document.getElementById("annualStart").value) || 1);
    const lumpAmount   = parseFloat(document.getElementById("lumpAmount").value)   || 0;
    const lumpAt       = Math.max(1, parseInt(document.getElementById("lumpAt").value)      || 1);
    const iadDays      = Math.max(0, parseInt(document.getElementById("iadDays").value)     || 0);

    if (isNaN(amount) || isNaN(annualRate) || isNaN(termValue) || amount <= 0 || annualRate <= 0 || termValue <= 0) {
        showError("Please enter valid positive numbers for all required fields.");
        return;
    }
    hideError();

    const years         = termUnit === "months" ? termValue / 12 : termValue;
    const totalPayments = Math.round(years * paymentsPerYear);

    // Effective rate per period via stated compounding frequency
    const nominalRate     = annualRate / 100;
    const effectiveAnnual = Math.pow(1 + nominalRate / compoundFreq, compoundFreq) - 1;
    const ratePerPeriod   = Math.pow(1 + effectiveAnnual, 1 / paymentsPerYear) - 1;

    // IAD: compound interest accrued on principal for N days before amortization starts
    const dailyRate   = Math.pow(1 + effectiveAnnual, 1 / 365) - 1;
    const iadInterest = iadDays > 0 ? amount * (Math.pow(1 + dailyRate, iadDays) - 1) : 0;

    // Regular annuity payment (no prepayments)
    const basePayment = (amount * ratePerPeriod * Math.pow(1 + ratePerPeriod, totalPayments))
                      / (Math.pow(1 + ratePerPeriod, totalPayments) - 1);

    // Amortization loop
    let balance = amount, totalInterest = iadInterest, totalPrepaid = 0, paymentCount = 0;
    const principalData = [], interestData = [], schedule = [];

    while (balance > 0.005 && paymentCount < totalPayments * 2 + 1) {
        paymentCount++;
        const interestPayment = balance * ratePerPeriod;
        let principalPayment  = Math.min(basePayment - interestPayment, balance);

        // Accumulate all applicable prepayments this period
        let extra = 0;
        if (ppAmount     > 0 && paymentCount >= ppStart)  extra += ppAmount;
        if (annualAmount > 0 && paymentCount >= annualStart
            && (paymentCount - annualStart) % paymentsPerYear === 0) extra += annualAmount;
        if (lumpAmount   > 0 && paymentCount === lumpAt)  extra += lumpAmount;

        extra = Math.min(extra, Math.max(0, balance - principalPayment));
        totalPrepaid  += extra;
        balance       -= (principalPayment + extra);
        if (balance < 0.005) balance = 0;
        totalInterest += interestPayment;

        principalData.push(principalPayment);
        interestData.push(interestPayment);
        schedule.push({
            Payment:   paymentCount,
            Principal: principalPayment.toFixed(2),
            Extra:     extra.toFixed(2),
            Interest:  interestPayment.toFixed(2),
            Balance:   Math.max(0, balance).toFixed(2)
        });
        if (balance <= 0) break;
    }

    const totalPaid      = basePayment * paymentCount + totalPrepaid + iadInterest;
    const baselineInt    = basePayment * totalPayments - amount;
    const interestSaved  = baselineInt - (totalInterest - iadInterest);
    const anyPrepay      = ppAmount > 0 || annualAmount > 0 || lumpAmount > 0;

    setText("monthlyPayment", formatCurrency(basePayment));
    setText("totalPayment",   formatCurrency(totalPaid));
    setText("totalInterest",  formatCurrency(totalInterest));
    setText("monthsToPayoff", `${paymentCount} · ${(paymentCount / paymentsPerYear).toFixed(2)} yrs`);

    toggleRow("iadRow",    iadDays > 0);
    if (iadDays > 0) setText("iadInterestVal", `${formatCurrency(iadInterest)} (${iadDays} days)`);

    toggleRow("savedRow",  anyPrepay);
    toggleRow("soonerRow", anyPrepay);
    if (anyPrepay) {
        setText("interestSaved", formatCurrency(interestSaved));
        const saved = totalPayments - paymentCount;
        setText("payoffSooner", saved > 0 ? `${saved} fewer payments` : "Same schedule");
    }

    document.getElementById("results").style.display = "block";
    drawChart(principalData, interestData);

    const btn = document.getElementById("downloadCsvBtn");
    btn.style.display = "inline-block";
    btn.onclick = () => downloadCsv(schedule);
}

function setText(id, val)          { document.getElementById(id).textContent = val; }
function toggleRow(id, show)       { document.getElementById(id).style.display = show ? "" : "none"; }
function showError(msg)            { const el = document.getElementById("formError"); el.textContent = msg; el.style.display = "block"; }
function hideError()               { document.getElementById("formError").style.display = "none"; }
function formatCurrency(num)       { return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function drawChart(principalData, interestData) {
    const canvas = document.getElementById("amortizationChart");
    const ctx    = canvas.getContext("2d");
    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const N = principalData.length;
    const mL = 60, mB = 40, mT = 20, mR = 20;
    const cW = canvas.width - mL - mR, cH = canvas.height - mT - mB;
    const bW = cW / N;
    const maxVal = Math.max(...principalData.map((p, i) => p + interestData[i]));

    const cAxis = "rgba(255,255,255,0.15)", cLabel = "#94a3b8",
          cPrin = "rgba(6,182,212,0.75)",   cInt   = "rgba(244,63,94,0.7)";

    ctx.strokeStyle = cAxis; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mL, mT); ctx.lineTo(mL, canvas.height - mB);
    ctx.lineTo(canvas.width - mR, canvas.height - mB);
    ctx.stroke();

    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "right"; ctx.fillStyle = cLabel;
    for (let i = 0; i <= 5; i++) {
        const val = (maxVal / 5) * i, y = canvas.height - mB - (val / maxVal) * cH;
        ctx.fillText("$" + Math.round(val), mL - 8, y + 4);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(canvas.width - mR, y); ctx.stroke();
    }

    ctx.textAlign = "center"; ctx.fillStyle = cLabel;
    const step = Math.ceil(N / 10);
    for (let i = 0; i <= N; i += step) ctx.fillText(i, mL + i * bW, canvas.height - 8);

    for (let i = 0; i < N; i++) {
        const x = mL + i * bW;
        const iH = (interestData[i]  / maxVal) * cH;
        const pH = (principalData[i] / maxVal) * cH;
        ctx.fillStyle = cInt;  ctx.fillRect(x, canvas.height - mB - iH,      bW, iH);
        ctx.fillStyle = cPrin; ctx.fillRect(x, canvas.height - mB - iH - pH, bW, pH);
    }

    ctx.fillStyle = cLabel; ctx.textAlign = "center";
    ctx.fillText("Payments", canvas.width / 2, canvas.height - 2);
    ctx.save(); ctx.rotate(-Math.PI / 2);
    ctx.fillText("Amount ($)", -canvas.height / 2, 12); ctx.restore();

    const lX = canvas.width - 105, lY = mT;
    ctx.fillStyle = cInt;  ctx.fillRect(lX, lY,      12, 12);
    ctx.fillStyle = cLabel; ctx.textAlign = "left";
    ctx.fillText("Interest",  lX + 17, lY + 10);
    ctx.fillStyle = cPrin; ctx.fillRect(lX, lY + 20, 12, 12);
    ctx.fillStyle = cLabel;
    ctx.fillText("Principal", lX + 17, lY + 30);
}

function downloadCsv(schedule) {
    const header = ["Payment","Principal","Extra Prepayment","Interest","Balance"];
    const rows   = schedule.map(p => [p.Payment, p.Principal, p.Extra, p.Interest, p.Balance]);
    const csv    = "data:text/csv;charset=utf-8," + header.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: encodeURI(csv), download: "amortization_schedule.csv" });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

document.getElementById("goBackBtn").addEventListener("click", () => { window.location.href = "../index.html"; });
