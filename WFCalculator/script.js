const toggleBtn = document.getElementById("toggleOptionalBtn");
const optionalFields = document.getElementById("optionalFields");

document.getElementById("calculateBtn").addEventListener("click", () => {
	// --- Read helper to parse numeric inputs safely ---
	function num(id, def = 0) {
		const v = parseFloat(document.getElementById(id)?.value);
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

		// Optional weapon-specific attacks
		MGAttack: num("playerMGAttack", 0),
		WGAttack: num("playerWGAttack", 0),
		MSLAttack: num("playerMSLAttack", 0),
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

		// Optional weapon-specific attacks
		MGAttack: num("enemyMGAttack", 0),
		WGAttack: num("enemyWGAttack", 0),
		MSLAttack: num("enemyMSLAttack", 0),
	};

	// Basic validation
	if (!isFinite(player.power) || player.power <= 0 || !isFinite(enemy.power) || enemy.power <= 0) {
		alert("Please enter valid positive Power values for both Player and Enemy.");
		return;
	}

	// Calculation function
	function effectivePower(attacker, defender) {
		const breakStat = (attacker.weaponType === "physical") ? attacker.physBreak : attacker.energyBreak;
		const defenseStat = (attacker.weaponType === "physical") ? defender.physDef : defender.energyDef;

		const rawFactor = 1 + ((breakStat - defenseStat) * 0.001);
		const clampedFactor = Math.max(0.5, Math.min(1.5, rawFactor));

		const aerialNet = attacker.extraAerial - defender.reduceAerial;
		const playerNet = attacker.extraPlayer - defender.reducePlayer;

		const aerialFactor = 1 + (aerialNet / 100);
		const playerFactor = 1 + (playerNet / 100);

		const safeAerial = Math.max(0, aerialFactor);
		const safePlayer = Math.max(0, playerFactor);

		const totalMultiplier = safeAerial * safePlayer;
		return { clampedFactor, totalMultiplier };
	}

	// --- Calculate effective multipliers ---
	const playerFactors = effectivePower(player, enemy);
	const enemyFactors = effectivePower(enemy, player);

	// --- Apply same scaling to Power and the optional attack stats ---
	function scaleStats(entity, factors) {
		return {
			effectivePower: entity.power * factors.clampedFactor * factors.totalMultiplier,
			effectiveMG: entity.MGAttack * factors.clampedFactor * factors.totalMultiplier,
			effectiveWG: entity.WGAttack * factors.clampedFactor * factors.totalMultiplier,
			effectiveMSL: entity.MSLAttack * factors.clampedFactor * factors.totalMultiplier,
		};
	}

	const playerScaled = scaleStats(player, playerFactors);
	const enemyScaled = scaleStats(enemy, enemyFactors);

	// --- Win chance (same as before) ---
	let winChance;
	if (enemyScaled.effectivePower <= 0 && playerScaled.effectivePower <= 0) {
		winChance = 50;
	} else if (enemyScaled.effectivePower <= 0) {
		winChance = 100;
	} else {
		const ratio = playerScaled.effectivePower / enemyScaled.effectivePower;
		const steepness = 10;
		winChance = Math.round(100 / (1 + Math.exp(-steepness * (ratio - 1))));
		winChance = Math.max(0, Math.min(100, winChance));
	}

	// --- Output results ---
	document.getElementById("playerEffectivePower").textContent = playerScaled.effectivePower.toFixed(2);
	document.getElementById("enemyEffectivePower").textContent = enemyScaled.effectivePower.toFixed(2);

	// Create or update comparison lines for MG/WG/MSL if applicable
	function setStatLine(id, label, playerVal, enemyVal) {
		if (playerVal > 0 || enemyVal > 0) {
			let elem = document.getElementById(id);
			if (!elem) {
				const ul = document.querySelector("#results ul");
				elem = document.createElement("li");
				elem.id = id;
				ul.appendChild(elem);
			}
			elem.innerHTML = `<strong>${label}:</strong> Player ${playerVal.toFixed(2)} vs Enemy ${enemyVal.toFixed(2)}`;
		} else {
			// Remove the line if it exists but both values are 0
			const elem = document.getElementById(id);
			if (elem) elem.remove();
		}
	}

	setStatLine("mgCompare", "Main Gun Effective Attack", playerScaled.effectiveMG, enemyScaled.effectiveMG);
	setStatLine("wgCompare", "Wing Gun Effective Attack", playerScaled.effectiveWG, enemyScaled.effectiveWG);
	setStatLine("mslCompare", "Missile Effective Attack", playerScaled.effectiveMSL, enemyScaled.effectiveMSL);

	document.getElementById("winChance").textContent = `${winChance}%`;
	document.getElementById("results").style.display = "block";
});

document.getElementById("goBackBtn").addEventListener("click", () => {
	window.location.href = "../index.html";
});

// Toggle Optional Stats section
toggleBtn.addEventListener("click", () => {
	const isVisible = optionalFields.style.display === "block";
	if (isVisible) {
		optionalFields.style.display = "none";
		toggleBtn.textContent = "⚙️ Show Optional Stats";
	} else {
		optionalFields.style.display = "block";
		toggleBtn.textContent = "⚙️ Hide Optional Stats";
	}
});
