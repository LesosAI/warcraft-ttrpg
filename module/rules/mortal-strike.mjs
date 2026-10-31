/** NPC Mortal Strike halves healing. This is not the Warrior's healing block.
 * Keep each attack's carrier separate; the derived result is one boolean. */
export const MORTAL_STRIKE_FLAGS = Object.freeze({
  sentinel: "sentinelMortalStrike",
  felguard: "felguardMortalStrike"
});

/** Read the Felguard's actual axe, retaining bonuses but excluding Cleave from
 * this single-target action. A renamed actor remains usable. */
export function felguardStrikeSpec(actor, index) {
  const row = actor?.system?.creatureAbilities?.[index];
  if (actor?.type !== "npc" || actor.system?.creatureType !== "demon" || !Number.isInteger(index)
    || row?.name !== "Mortal Strike" || row.automation?.kind !== "utility"
    || row.automation.action !== "action") return null;
  if (!Array.isArray(actor.system.attacks)) return null;
  const axes = actor.system.attacks.filter(attack => attack?.name === "Felaxe");
  if (axes.length !== 1) return null;
  const axe = axes[0];
  if (!Number.isFinite(axe.bonus) || !Number.isFinite(axe.damage) || axe.damage < 0
    || !Array.isArray(axe.traits) || axe.traits.some(trait => typeof trait !== "string") || axe.range != null) return null;
  return { kind: "felguard", reach: 5, title: row.name,
    attack: { name: axe.name, bonus: axe.bonus, damage: axe.damage,
      traits: axe.traits.filter(trait => trait.trim().toLowerCase() !== "cleave") } };
}

export function mortalStrikeEffect({ kind, sourceUuid, targetUuid, messageUuid, timing, labels } = {}) {
  const flag = Object.hasOwn(MORTAL_STRIKE_FLAGS, kind ?? "") ? MORTAL_STRIKE_FLAGS[kind] : null;
  const id = value => typeof value === "string" && value.length > 0;
  if (!flag || ![sourceUuid, targetUuid, messageUuid, labels?.name, labels?.description].every(id)
    || !timing?.start || !timing?.duration) return null;
  const { start, duration } = timing;
  const world = duration.units === "seconds" && duration.value === 6 && Number.isFinite(start.time);
  const combat = duration.units === "turns" && duration.value === 1 && duration.expiry === "turnEnd"
    && id(start.combat) && id(start.combatant) && Number.isInteger(start.round) && start.round >= 1
    && Number.isInteger(start.turn) && start.turn >= 0 && Number.isFinite(start.time);
  if (!world && !combat) return null;
  return { name: labels.name, img: "icons/svg/blood.svg", origin: sourceUuid,
    disabled: false, description: labels.description,
    start: { ...start }, duration: { ...duration },
    flags: { "azeroth-rpg": { harmful: true, laidBy: [sourceUuid],
      [flag]: { halved: true, sourceUuid, targetUuid, messageUuid } } } };
}

export function mortalStrikeHalvesHealing(effects = []) {
  return [...(effects ?? [])].some(effect => effect?.active !== false
    && effect?.disabled !== true && effect?.isSuppressed !== true && effect?.duration?.expired !== true
    && Object.values(MORTAL_STRIKE_FLAGS).some(flag => effect?.flags?.["azeroth-rpg"]?.[flag]?.halved === true));
}
