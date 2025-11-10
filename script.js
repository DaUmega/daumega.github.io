// Tool definitions, add more tools here
const tools = [
	{
		name: "Period Tracker",
		desc: "Track your cycle and export/import data securely, all stored locally on your device.",
		link: "ptracker/index.html"
	},
	{
		name: "Loan Calculator",
		desc: "Calculate loan payments, interest, and visualize amortization schedules with optional extra payments.",
		link: "loanCalculator/index.html"
	},
	{
		name: "PeerLive",
		desc: "Peer-to-peer encrypted live camera app with real-time chat and customizable display names.",
		link: "https://peerlive.duckdns.org"
	},
	{
		name: "WF PVP Power Calculator",
		desc: "Estimate your chance of victory in PvP battles in the mobile game Wing Fighter, using simplified formulas.",
		link: "WFCalculator/index.html"
	}
];

// Populate cards
const container = document.getElementById("toolList");

tools.forEach(tool => {
	const card = document.createElement("div");
	card.className = "card";

	const title = document.createElement("h2");
	title.textContent = tool.name;

	const desc = document.createElement("p");
	desc.textContent = tool.desc;

	const btn = document.createElement("button");
	btn.textContent = "Open";
	btn.addEventListener("click", () => {
		window.location.href = tool.link;
	});

	card.append(title, desc, btn);
	container.appendChild(card);
});

// Auto Year in Footer
document.getElementById("year").textContent = new Date().getFullYear();

// BTC Copy Functionality
document.getElementById("copyBTC").addEventListener("click", () => {
    const btcAddress = document.getElementById("btcDisplay").textContent.trim();
    const copyButton = document.getElementById("copyBTC");
    const successMessage = document.getElementById("successMessage");
    const messageSpan = document.getElementById("copyMessage");

    // Clear any previous messages
    messageSpan.textContent = '';
    messageSpan.style.color = '';

    navigator.clipboard.writeText(btcAddress)
        .then(() => {
            copyButton.style.display = 'none';
            successMessage.style.display = 'inline-block';

            // Revert to the original button after a few seconds
            setTimeout(() => {
                successMessage.style.display = 'none';
                copyButton.style.display = 'inline-block';
                messageSpan.textContent = '';
            }, 3000); // 3 seconds
        })
        .catch(err => {
            console.error("Copy failed: ", err);
            messageSpan.textContent = "Copy Failed. Please copy manually. ❌";
            messageSpan.style.color = "red";
        });
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
