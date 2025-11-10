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
    const STORAGE_KEY = "darkMode", BODY = document.body;
    const TOGGLE_ID = "dark-mode-toggle", STYLE_ID = "universal-dark-mode-sheet";
    const SESSION_INIT = "dmInitialized", SESSION_USER_TOGGLED = "dmUserToggled";
    let applyTimer = 0, observer = null;

    // insert stylesheet once
    if (!document.getElementById(STYLE_ID)) {
        const s = document.createElement("style");
        s.id = STYLE_ID;
        s.textContent = `
            .dark-mode {
                --dm-bg:#0f0f10;--dm-surface:#1e1e1e;--dm-text:#eaeaea;--dm-muted:#bdbdbd;--dm-accent:#eaeaea;
            }
            .dark-mode, .dark-mode body {background-color:var(--dm-bg) !important; color:var(--dm-text) !important;}
            .dark-mode .dm-btn {background:#2a2a2a !important; color:var(--dm-text) !important; border:1px solid rgba(200,200,200,0.45) !important; border-radius:8px !important; box-shadow:0 0 10px rgba(200,200,200,0.18) !important;}
            .dark-mode .dm-title {color:var(--dm-accent) !important;}
            .dark-mode .dm-note {color:var(--dm-muted) !important; font-style:italic;}
            .dark-mode .dm-panel {background:var(--dm-surface) !important; color:var(--dm-text) !important; border:1px solid rgba(255,255,255,0.03) !important; box-shadow:0 6px 18px rgba(0,0,0,0.35) inset !important;}
            .dm-transition * {transition: color 0.25s ease, background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease !important;}
        `;
        document.head.appendChild(s);
    }

    function parseRgb(str) {
        if (!str) return null;
        const m = str.match(/rgba?\((\d+)[^\d]+(\d+)[^\d]+(\d+)/i);
        if (m) return [+m[1], +m[2], +m[3]];
        const h = (str.match(/^#([0-9a-f]{6})$/i) || [])[1];
        return h ? [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)] : null;
    }
    const brightness = rgb => rgb ? (rgb[0]*299 + rgb[1]*587 + rgb[2]*114)/1000 : 255;

    function applyDark() {
        clearTimeout(applyTimer);
        applyTimer = setTimeout(() => requestAnimationFrame(() => {
            document.querySelectorAll("body *").forEach(el => {
                if (el.dataset.dmProcessed) return;
                try {
                    el.dataset.dmOriginalStyle = el.getAttribute("style") || "";
                    const cs = getComputedStyle(el), bg = cs.backgroundColor || "", fs = parseFloat(cs.fontSize || 0);
                    const added = [];
                    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button" ||
                        (el.tagName === "INPUT" && ["button","submit","reset"].includes((el.type||"").toLowerCase()))) {
                        added.push("dm-btn"); el.classList.add("dm-btn");
                    } else {
                        const txt = (el.textContent || "").trim();
                        if (/[\p{Emoji}]/u.test(txt) || fs >= 18) { added.push("dm-title"); el.classList.add("dm-title"); }
                        else if (fs <= 12 || cs.fontStyle === "italic") { added.push("dm-note"); el.classList.add("dm-note"); }
                        const rgb = parseRgb(bg);
                        if ((rgb && brightness(rgb) > 150) || (cs.backgroundImage && cs.backgroundImage !== "none")) {
                            added.push("dm-panel"); el.classList.add("dm-panel");
                        }
                    }
                    if (added.length) el.dataset.dmAddedClasses = added.join(" ");
                    el.dataset.dmProcessed = "1";
                } catch (e) {}
            });
        }), 50);
    }

    function restoreStyles() {
        clearTimeout(applyTimer);
        if (observer) observer.disconnect();
        document.querySelectorAll("[data-dm-processed='1']").forEach(el => {
            try {
                const orig = el.dataset.dmOriginalStyle || "";
                orig ? el.setAttribute("style", orig) : el.removeAttribute("style");
                (el.dataset.dmAddedClasses || "").split(/\s+/).forEach(c => c && el.classList.remove(c));
                delete el.dataset.dmProcessed; delete el.dataset.dmOriginalStyle; delete el.dataset.dmAddedClasses;
            } catch (e) {}
        });
        BODY.classList.remove("dark-mode");
    }

    function ensureToggle() {
        let t = document.getElementById(TOGGLE_ID);
        if (!t) {
            t = Object.assign(document.createElement("button"), {
                id: TOGGLE_ID,
                textContent: "🌙",
                onclick() {
                    const enabled = BODY.classList.toggle("dark-mode");
                    this.textContent = enabled ? "☀️" : "🌙";
                    sessionStorage.setItem(SESSION_USER_TOGGLED, "1");
                    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
                    if (enabled) {
                        // one-time transition on first toggle
                        BODY.classList.add("dm-transition");
                        applyDark();
                        startObserver();
                        setTimeout(() => BODY.classList.remove("dm-transition"), 260);
                    } else restoreStyles();
                }
            });
            Object.assign(t.style, { position:"fixed",bottom:"15px",right:"15px",background:"transparent",border:"2px solid rgba(200,200,200,0.22)",borderRadius:"8px",fontSize:"1.4rem",cursor:"pointer",zIndex:2147483647,padding:"6px",lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.18s ease,border-color 0.18s ease,opacity 0.18s ease" });
            t.onmouseenter = () => { t.style.transform="scale(1.15)"; t.style.borderColor="rgba(200,200,200,0.7)"; };
            t.onmouseleave = () => { t.style.transform="scale(1)"; t.style.borderColor="rgba(200,200,200,0.22)"; };
            document.body.appendChild(t);
        }
        return t;
    }

    function startObserver() {
        observer && observer.disconnect();
        observer = new MutationObserver(muts => {
            if (!isEnabled()) return;
            for (const m of muts) if (m.addedNodes && m.addedNodes.length) { applyDark(); break; }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    const isEnabled = () => BODY.classList.contains("dark-mode");

    function init() {
        const toggle = ensureToggle();
        const saved = localStorage.getItem(STORAGE_KEY), inited = sessionStorage.getItem(SESSION_INIT);
        if (!inited) {
            sessionStorage.setItem(SESSION_INIT, "1");
            toggle.textContent = saved === "true" ? "☀️" : "🌙";
            return;
        }
        const userToggled = sessionStorage.getItem(SESSION_USER_TOGGLED);
        if (userToggled === "1" || saved === "true") {
            BODY.classList.toggle("dark-mode", saved === "true");
            toggle.textContent = saved === "true" ? "☀️" : "🌙";
            if (saved === "true") { applyDark(); startObserver(); }
        } else toggle.textContent = "🌙";
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();

    window.addEventListener("popstate", () => { clearTimeout(applyTimer); applyTimer = setTimeout(init, 40); });
})();
