const tools = [
  { name: "QR Code Generator",   desc: "Generate QR codes for anything and download. No ads, no bloat, all frontend.",                                      link: "qrMaker/index.html" },
  { name: "Period Tracker",       desc: "Track your cycle with full import/export. All data stays locally on your device.",                                   link: "ptracker/index.html" },
  { name: "Loan Calculator",      desc: "Calculate payments, interest, and amortization schedules with optional extra payments.",                             link: "loanCalculator/index.html" },
  { name: "PeerLive",             desc: "Encrypted peer-to-peer streaming. Like Twitch, but no data saved anywhere.",                                         link: "https://peerlive.duckdns.org" },
  { name: "WF PVP Calculator",    desc: "Estimate your PvP odds in Wing Fighter using simplified combat formulas.",                                           link: "WFCalculator/index.html" },
];

const list = document.getElementById("toolList");
tools.forEach(({ name, desc, link }) => {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<h2>${name}</h2><p>${desc}</p><button>Open</button>`;
  card.querySelector("button").addEventListener("click", () => window.location.href = link);
  list.appendChild(card);
});

document.getElementById("year").textContent = new Date().getFullYear();

function makeCopyBtn(btnId, displayId, feedbackId) {
  document.getElementById(btnId).addEventListener("click", () => {
    const addr = document.getElementById(displayId).textContent.trim();
    const btn  = document.getElementById(btnId);
    const fb   = document.getElementById(feedbackId);
    navigator.clipboard.writeText(addr).then(() => {
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = btnId === "copyBTC" ? "Copy BTC" : "Copy XMR"; }, 3000);
    }).catch(() => { fb.textContent = "Copy failed - please copy manually."; });
  });
}

makeCopyBtn("copyBTC", "btcDisplay", "copyBTCFeedback");
makeCopyBtn("copyXMR", "xmrDisplay", "copyXMRFeedback");
