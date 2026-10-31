/** Classic Dreadlord 8716's self-healing melee proc, adapted to 2 Health. */
export const VAMPIRIC_AURA_FLAG = "vampiricAuraClaim";

/** A card's stored strike identifies Claws; Physical damage alone does not. */
export function vampiricAuraHeal({ attacker, targetUuid, before, after, flags = {} } = {}) {
  if (attacker?.type !== "npc" || !attacker.uuid || !targetUuid || attacker.uuid === targetUuid) return 0;
  if (!Number.isFinite(attacker.system?.health?.value) || attacker.system.health.value <= 0) return 0;
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= after || after < 0) return 0;
  if (!attacker.system?.creatureAbilities?.some(row => row.name === "Vampiric Aura")) return 0;
  if (flags.kind !== "attack" || flags.parry === true || flags.notAttack === true) return 0;
  const rows = Array.isArray(flags.damageByTarget) && flags.damageByTarget.length ? flags.damageByTarget : [flags.damage];
  const ceiling = Math.max(0, ...rows.map(row => row?.withdrawn !== true && Number.isFinite(row?.damage) ? row.damage : 0));
  if (before - after > ceiling) return 0;
  const strike = flags.strike;
  if (strike?.rangeKind !== "melee" || strike.form !== "claw" || strike.weapon !== null) return 0;
  const index = strike.row?.index;
  if (!Number.isInteger(index) || index < 0 || strike.row.name !== "Claws") return 0;
  if (attacker.system?.attacks?.[index]?.name !== "Claws") return 0;
  return 2;
}
