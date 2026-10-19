const tools = [
  { name: "QR Code Generator",   desc: "Generate QR codes for anything and download. No ads, no bloat, all frontend.",                                        link: "qrMaker/index.html" },
  { name: "Period Tracker",       desc: "Track your cycle with full import/export. All data stays locally on your device.",                                   link: "ptracker/index.html" },
  { name: "Loan Calculator",      desc: "Calculate payments, interest, and amortization schedules with optional extra payments.",                             link: "loanCalculator/index.html" },
  { name: "P2PChat",             desc: "Encrypted peer-to-peer chatroom, file sharing, video streaming. No data saved anywhere.",                             link: "https://peerlive.duckdns.org" },
];

const games = [
  { name: "Crosswords & Fill-ins", desc: "In-browser crossword and fill-in puzzles with difficulty levels and license-plate fill-ins. Progress saves locally.", link: "crosswords/index.html" },
  { name: "Sudoku", desc: "In-browser Sudoku with 4 difficulty levels, guaranteed unique solutions, and hint/check tools. Progress saves locally.", link: "sudoku/index.html"},
  { name: "Wordle", desc: "Guess the hidden word in 6 tries. 4 difficulty levels by word length, keyboard included. Progress saves locally.", link: "wordle/index.html"},
];

function renderCards(items, listId) {
  const list = document.getElementById(listId);
  if (!list) return;
  items.forEach(({ name, desc, link }) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h2>${name}</h2><p>${desc}</p><button>Open</button>`;
    card.querySelector("button").addEventListener("click", () => window.location.href = link);
    list.appendChild(card);
  });
}

// Each page has only its own list; render whichever exists.
renderCards(tools, "toolList");
renderCards(games, "gameList");

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
