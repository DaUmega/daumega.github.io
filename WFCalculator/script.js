const toggleBtn = document.getElementById("toggleOptionalBtn");
const optionalFields = document.getElementById("optionalFields");

toggleBtn.addEventListener("click", () => {
  const open = optionalFields.style.display === "block";
  optionalFields.style.display = open ? "none" : "block";
  toggleBtn.textContent = open ? "Show Optional Stats" : "Hide Optional Stats";
});

document.getElementById("goBackBtn").addEventListener("click", () => { window.location.href = "../index.html"; });

document.getElementById("calculateBtn").addEventListener("click", () => {
  const err = document.getElementById("formError");
  err.style.display = "none";

  const num = (id, def = 0) => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? def : v; };

  const player = {
    weaponType:   document.getElementById("playerWeaponType").value,
    power:        num("playerPower", NaN),
    dodge:        num("playerDodge", NaN),
    hit:          num("playerHit", NaN),
    physBreak:    num("playerPhysBreak"),
    physDef:      num("playerPhysDef"),
    energyBreak:  num("playerEnergyBreak"),
    energyDef:    num("playerEnergyDef"),
    extraAerial:  num("playerExtraAerial"),
    reduceAerial: num("playerReduceAerial"),
    extraPlayer:  num("playerExtraPlayer"),
    reducePlayer: num("playerReducePlayer"),
    MGAttack:     num("playerMGAttack"),
    WGAttack:     num("playerWGAttack"),
    MSLAttack:    num("playerMSLAttack"),
  };

  const enemy = {
    weaponType:   document.getElementById("enemyWeaponType").value,
    power:        num("enemyPower", NaN),
    dodge:        num("enemyDodge", NaN),
    hit:          num("enemyHit", NaN),
    physBreak:    num("enemyPhysBreak"),
    physDef:      num("enemyPhysDef"),
    energyBreak:  num("enemyEnergyBreak"),
    energyDef:    num("enemyEnergyDef"),
    extraAerial:  num("enemyExtraAerial"),
    reduceAerial: num("enemyReduceAerial"),
    extraPlayer:  num("enemyExtraPlayer"),
    reducePlayer: num("enemyReducePlayer"),
    MGAttack:     num("enemyMGAttack"),
    WGAttack:     num("enemyWGAttack"),
    MSLAttack:    num("enemyMSLAttack"),
  };

  // Validation
  const invalid = [
    [!isFinite(player.power) || player.power <= 0 || !isFinite(enemy.power) || enemy.power <= 0, "Please enter valid positive Power values for both Player and Enemy."],
    [!isFinite(player.dodge) || !isFinite(enemy.dodge), "Dodge Rate is required for both Player and Enemy."],
    [!isFinite(player.hit)   || !isFinite(enemy.hit),   "Hit Rate is required for both Player and Enemy."],
  ].find(([cond]) => cond);

  if (invalid) { err.textContent = invalid[1]; err.style.display = "block"; return; }

  // Dodge factor: your dodge % minus their hit %, capped 0–80%
  // Result = how much of enemy attacks you evade (1 = full damage, lower = more evasion)
  const dodgeFactor = (myDodge, theirHit) => {
    const effectiveDodge = Math.max(0, Math.min(80, myDodge - theirHit));
    return 1 - (effectiveDodge / 100);
  };

  // Defense/break factor
  const defenseFactor = (attacker, defender) => {
    const brk = attacker.weaponType === "physical" ? attacker.physBreak : attacker.energyBreak;
    const def = attacker.weaponType === "physical" ? defender.physDef   : defender.energyDef;
    return Math.max(0.5, Math.min(1.5, 1 + (brk - def) * 0.001));
  };

  // Aerial/player damage multiplier
  const damageMult = (attacker, defender) => {
    const aerial = Math.max(0, 1 + (attacker.extraAerial - defender.reduceAerial) / 100);
    const pvp    = Math.max(0, 1 + (attacker.extraPlayer - defender.reducePlayer) / 100);
    return aerial * pvp;
  };

  const pDodge = dodgeFactor(player.dodge, enemy.hit);
  const eDodge = dodgeFactor(enemy.dodge, player.hit);

  const pDefFactor = defenseFactor(player, enemy);
  const eDefFactor = defenseFactor(enemy, player);

  const pDmgMult = damageMult(player, enemy);
  const eDmgMult = damageMult(enemy, player);

  // Effective power = raw power * defense factor * damage mult * (1 - enemy dodge)
  const pEff = player.power * pDefFactor * pDmgMult * eDodge;
  const eEff = enemy.power  * eDefFactor * eDmgMult * pDodge;

  // Win chance via sigmoid
  const ratio = eEff > 0 ? pEff / eEff : (pEff > 0 ? Infinity : 1);
  const winChance = eEff <= 0 && pEff <= 0 ? 50
    : eEff <= 0 ? 100
    : Math.max(0, Math.min(100, Math.round(100 / (1 + Math.exp(-10 * (ratio - 1))))));

  // Render core results
  const fmt = n => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById("playerEffectivePower").textContent = fmt(pEff);
  document.getElementById("enemyEffectivePower").textContent  = fmt(eEff);
  document.getElementById("winChance").textContent            = `${winChance}%`;

  // Optional weapon stats
  const optEl = document.getElementById("optionalResults");
  optEl.innerHTML = "";
  [
    ["Main Gun",  player.MGAttack  * pDefFactor * pDmgMult * eDodge, enemy.MGAttack  * eDefFactor * eDmgMult * pDodge],
    ["Wing Gun",  player.WGAttack  * pDefFactor * pDmgMult * eDodge, enemy.WGAttack  * eDefFactor * eDmgMult * pDodge],
    ["Missile",   player.MSLAttack * pDefFactor * pDmgMult * eDodge, enemy.MSLAttack * eDefFactor * eDmgMult * pDodge],
  ].forEach(([label, pVal, eVal]) => {
    if (!pVal && !eVal) return;
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span class="rl">${label} Effective</span><span>Player ${fmt(pVal)} vs Enemy ${fmt(eVal)}</span>`;
    optEl.appendChild(row);
  });

  document.getElementById("results").style.display = "block";
});
