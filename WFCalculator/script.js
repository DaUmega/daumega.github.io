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

		// damage modifier from aerial: (1 + attacker's extra%) * (1 - defender's reduction%)
		const aerialFactor = (1 + attacker.extraAerial / 100) * (1 - defender.reduceAerial / 100);
		// damage modifier from player-targeted bonuses
		const playerFactor = (1 + attacker.extraPlayer / 100) * (1 - defender.reducePlayer / 100);

		// ensure factors can't be negative (in case reductions >100%)
		const safeAerial = Math.max(0, aerialFactor);
		const safePlayer = Math.max(0, playerFactor);

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
