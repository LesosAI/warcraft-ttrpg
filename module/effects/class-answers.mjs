/**
 * **THE LEAD'S CLASS ANSWERS, WHERE THEY TOUCH THE WORLD** (D-779; the lead's
 * rulings of 2026-10-03 on O-166 to O-195). `rules/class-answers.mjs` is the law;
 * this writes:
 *
 * - **04's Undying Rage** (O-173, *"Heals cancel the fall."*): the held rounds are
 *   an Active Effect the damage door lays (`AzerothActor#_holdAtOne`) and core's own
 *   clock expires at the warrior's turn start; the expiry is the fall, a heal's
 *   delete (`azerothUndying: "healed"`) and a hand delete are none.
 * - **04's Bracing** (O-174, *"Next move"*): the Armor Points a turn ended without a
 *   move lays (`AzerothCombat#_onEndTurn`), lifted by the warrior's next move -
 *   never by a displacement, which is nobody moving (`rules/movement.mjs
 *   #creatureMoved`).
 */

import { BRACING_FLAG, UNDYING_RAGE, bracingChanges, undyingFalls } from "../rules/class-answers.mjs";
import { creatureMoved } from "../rules/movement.mjs";

/**
 * **THE FALL UNDYING RAGE HELD OFF** (04: *then fall as usual*): Health to 0, and
 * what 0 does to a character (06 §8: Prone and the Critical Injury the creature
 * rolls), said on a card.
 *
 * @param {Actor} actor
 */
export async function undyingFall(actor) {
  const before = actor?.system?.health?.value ?? 0;
  if (!actor || before <= 0) return false;
  await actor.adjustHealth(-before);
  if (actor.type === "character") {
    if (!actor.statuses?.has("prone")) await actor.toggleStatusEffect("prone", { active: true });
    try {
      await game.system.azeroth.workflows.rollCriticalInjury({ actor, location: "body" });
    } catch (err) {
      console.error("azeroth-rpg | Undying Rage's fall", err);
    }
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.UndyingRage.Falls", { name: actor.name })}</p>`,
    flags: { "azeroth-rpg": { kind: "undyingRage" } }
  });
  return true;
}

/**
 * **BRACING'S ARMOR POINTS** (04: *If you do not move by the end of your turn,
 * your Armor Points increase by 1 per rank*): one effect, replaced rather than
 * stacked, in the `final` phase, with no span - the next move lifts it.
 *
 * @param {Actor} actor
 * @param {{amount: number, name: string}} o
 * @returns {Promise<ActiveEffect|null>}
 */
export async function layBracing(actor, { amount = 0, name = "Bracing" } = {}) {
  const changes = bracingChanges(amount);
  if (!actor || !changes.length) return null;
  const stale = (actor.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.[BRACING_FLAG]).map(e => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: "icons/equipment/shield/heater-steel-boss-red.webp", origin: actor.uuid, description: "",
    system: { changes },
    flags: { "azeroth-rpg": { [BRACING_FLAG]: { amount: Math.trunc(Number(amount)) || 0 } } }
  }]);
  return made ?? null;
}

/**
 * Registered at init on every client. Each acts on the client that made the
 * write: the delete (the active GM for core's expiry) and the move.
 */
export function registerClassAnswerHooks() {
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id) return;
    if (!effect?.flags?.["azeroth-rpg"]?.[UNDYING_RAGE.flag]) return;
    const actor = effect.parent;
    if (actor?.documentName !== "Actor") return;
    const remaining = effect.duration?.remaining;
    const expired = typeof remaining === "number" && Number.isFinite(remaining) && remaining <= 0;
    if (!undyingFalls({ expired, cancelled: options?.azerothUndying === "healed", health: actor.system?.health?.value ?? 0 })) return;
    undyingFall(actor).catch(err => console.error("azeroth-rpg | Undying Rage's fall", err));
  });
  Hooks.on("moveToken", (document, movement, operation, user) => {
    if (!user?.isSelf) return;
    const actor = document?.actor ?? null;
    if (!actor?.isOwner || !creatureMoved(movement, operation)) return;
    const braced = (actor.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.[BRACING_FLAG]).map(e => e.id);
    if (!braced.length) return;
    actor.deleteEmbeddedDocuments("ActiveEffect", braced)
      .then(() => ui.notifications?.info(game.i18n.format("AZEROTH.Bracing.Moved", { name: actor.name })))
      .catch(err => console.error("azeroth-rpg | Bracing", err));
  });
}
