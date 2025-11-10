document.getElementById("calculateBtn").addEventListener("click", () => {
	// --- Read helper to parse numeric inputs safely ---
	function num(id, def = 0) {
		const v = parseFloat(document.getElementById(id).value);
		return (isNaN(v) ? def : v);
	}

	// --- Gather player inputs ---
	const player = {
		weaponType: document.getElementById("playerWeaponType").value,
		power: num("playerPower", NaN),
		physBreak: num("playerPhysBreak", 0),
		physDef: num("playerPhysDef", 0),
		energyBreak: num("playerEnergyBreak", 0),
		energyDef: num("playerEnergyDef", 0),
		extraAerial: num("playerExtraAerial", 0),
		reduceAerial: num("playerReduceAerial", 0),
		extraPlayer: num("playerExtraPlayer", 0),
		reducePlayer: num("playerReducePlayer", 0),
	};

	// --- Gather enemy inputs ---
	const enemy = {
		weaponType: document.getElementById("enemyWeaponType").value,
		power: num("enemyPower", NaN),
		physBreak: num("enemyPhysBreak", 0),
		physDef: num("enemyPhysDef", 0),
		energyBreak: num("enemyEnergyBreak", 0),
		energyDef: num("enemyEnergyDef", 0),
		extraAerial: num("enemyExtraAerial", 0),
		reduceAerial: num("enemyReduceAerial", 0),
		extraPlayer: num("enemyExtraPlayer", 0),
		reducePlayer: num("enemyReducePlayer", 0),
	};

	// Basic validation
	if (!isFinite(player.power) || player.power <= 0 || !isFinite(enemy.power) || enemy.power <= 0) {
		alert("Please enter valid positive Power values for both Player and Enemy.");
		return;
	}

	// Calculation function
	function effectivePower(attacker, defender) {
		// choose break vs defense by attacker's weapon type
		const breakStat = (attacker.weaponType === "physical") ? attacker.physBreak : attacker.energyBreak;
		const defenseStat = (attacker.weaponType === "physical") ? defender.physDef : defender.energyDef;

		// break vs defense factor (1 + diff * 0.001), clamped
		const rawFactor = 1 + ((breakStat - defenseStat) * 0.001);
		const clampedFactor = Math.max(0.5, Math.min(1.5, rawFactor));

		// Net % = attacker's bonus - defender's reduction
		const aerialNet = attacker.extraAerial - defender.reduceAerial;
		const playerNet = attacker.extraPlayer - defender.reducePlayer;

		// Convert to multiplier: e.g., +20% → 1.2, -20% → 0.8
		const aerialFactor = 1 + (aerialNet / 100);
		const playerFactor = 1 + (playerNet / 100);

		// Prevent negative multipliers
		const safeAerial = Math.max(0, aerialFactor);
		const safePlayer = Math.max(0, playerFactor);

		// Combine all multipliers
		const totalMultiplier = safeAerial * safePlayer;

		return attacker.power * clampedFactor * totalMultiplier;
	}

	const playerEffective = effectivePower(player, enemy);
	const enemyEffective = effectivePower(enemy, player);

	// Win probability: logistic around ratio=1 (same shape you had)
	let winChance;
	if (enemyEffective <= 0 && playerEffective <= 0) {
		winChance = 50;
	} else if (enemyEffective <= 0) {
		winChance = 100;
	} else {
		const ratio = playerEffective / enemyEffective;
        const steepness = 10; // tweak for desired curve
		winChance = Math.round(100 / (1 + Math.exp(-steepness * (ratio - 1))));
		// clamp 0-100
		winChance = Math.max(0, Math.min(100, winChance));
	}

	// Output
	document.getElementById("playerEffectivePower").textContent = playerEffective.toFixed(2);
	document.getElementById("enemyEffectivePower").textContent = enemyEffective.toFixed(2);
	document.getElementById("winChance").textContent = `${winChance}%`;
	document.getElementById("results").style.display = "block";
});

document.getElementById("goBackBtn").addEventListener("click", () => {
	// keep same behavior as before
	window.location.href = "../index.html";
});

// Universal Dark Mode Toggle
(function () {
    const STORAGE_KEY = "darkMode", BODY = document.body;
    const TOGGLE_ID = "dark-mode-toggle", STYLE_ID = "universal-dark-mode-sheet";
    const SESSION_INIT = "dmInitialized", SESSION_USER_TOGGLED = "dmUserToggled";
    let applyTimer = 0, observer = null;

    // USER CONFIG: array of CSS selectors or elements that dark mode should ignore
    const EXCLUDE_ELEMENTS = ["#my-special-div123", ".no-dark123"];

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

    function isExcluded(el) {
        if (!EXCLUDE_ELEMENTS || !EXCLUDE_ELEMENTS.length) return false;
        return EXCLUDE_ELEMENTS.some(sel => {
            if (typeof sel === "string") return el.matches(sel);
            return el === sel;
        });
    }

    function applyDark() {
        clearTimeout(applyTimer);
        applyTimer = setTimeout(() => requestAnimationFrame(() => {
            document.querySelectorAll("body *").forEach(el => {
                if (el.dataset.dmProcessed || isExcluded(el)) return;
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
