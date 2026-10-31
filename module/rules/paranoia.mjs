import { aura } from "./auras.mjs";

export const PARANOIA = Object.freeze({ name: "Paranoia", group: "npc:paranoia", feet: 10 });
export const PARANOIA_AURA = aura({ feet: PARANOIA.feet, targets: "allies", excludeOwner: false,
  boon: { kind: "skill", skill: "perception", boons: 1, judged: true, condition: "AZEROTH.Paranoia.Condition" } });

/** The aura engine measures allies and collapses the shared group. The skill
 * purpose is judged at the roll; this descriptor never reveals a token. */
export function paranoiaSource({ uuid, type, health, abilities = [], img = "icons/svg/eye.svg" } = {}) {
  if (type !== "npc" || typeof uuid !== "string" || !uuid.trim() || !Number.isFinite(health) || health <= 0
    || !Array.isArray(abilities) || !abilities.some(row => row?.name === PARANOIA.name)) return null;
  return { key: `${uuid}:${PARANOIA.group}`, group: PARANOIA.group, name: PARANOIA.name, origin: uuid, img,
    text: "The felhunter and allies within 10 feet gain one Boon on Perception Tests to detect hidden creatures. Multiple Paranoia auras do not stack. This does not automatically reveal hidden creatures or defeat invisibility.",
    aura: PARANOIA_AURA };
}
