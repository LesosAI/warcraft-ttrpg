/** Bounded NPC channel adapted from Classic Mind Flay 26044. */
import { layTick } from "./ticks.mjs";
export const MIND_FLAY_FLAG = "qirajiMindFlay";
export const QIRAJI_MIND_FLAY = Object.freeze({ name: "Qiraji Mind Flay", action: "action",
  mana: 4, upkeep: 2, feet: 30, dc: 20, damage: 3, ticks: 3, speed: 10 });
const id = value => typeof value === "string" && value.trim().length > 0;

export function mindFlayEligible({ health, typeMarker = "" } = {}) {
  return Number.isFinite(health) && health > 0 && String(typeMarker).toLowerCase() !== "mindless";
}

/** Store this same identity on the source's Sustain and the target's carrier.
 * A cast-specific spell key lets Stop remove just this channel's effects.
 */
export function mindFlayLink({ sourceUuid, targetUuid, sceneId, sourceTokenId, targetTokenId, cast } = {}) {
  if (![sourceUuid, targetUuid, sceneId, sourceTokenId, targetTokenId, cast].every(id)
    || sourceUuid === targetUuid || sourceTokenId === targetTokenId) return null;
  return { version: 1, sourceUuid, targetUuid, sceneId, sourceTokenId, targetTokenId, cast,
    spellUuid: `azeroth-rpg.qiraji-mind-flay.${cast}` };
}

export function validMindFlayLink(link) {
  if (!link || link.version !== 1) return false;
  const expected = mindFlayLink(link);
  return expected !== null && expected.spellUuid === link.spellUuid;
}

export function mindFlaySustain(link) {
  if (!validMindFlayLink(link)) return null;
  return { spellId: null, uuid: link.spellUuid, name: QIRAJI_MIND_FLAY.name, itemId: null,
    cast: link.cast, identifier: "qiraji-mind-flay",
    source: { sceneId: link.sceneId, tokenId: link.sourceTokenId },
    targets: [{ sceneId: link.sceneId, tokenId: link.targetTokenId, actorUuid: link.targetUuid }],
    upkeep: { mana: QIRAJI_MIND_FLAY.upkeep, health: 0 }, [MIND_FLAY_FLAG]: { ...link } };
}

/** One removable carrier owns the tick and both debuffs. Fear immunity does
 * not prevent Shadow damage or the separate flat movement reduction.
 * Runtime refuses another held Mind Flay to prevent additive stacking.
 */
export function mindFlayEffect(link, { fearImmune = false } = {}) {
  if (!validMindFlayLink(link) || typeof fearImmune !== "boolean") return null;
  const tick = layTick({ kind: "damage", type: "shadow", amount: String(QIRAJI_MIND_FLAY.damage),
    rounds: QIRAJI_MIND_FLAY.ticks, when: "startOfTurn", spellpower: false }, {
    source: link.sourceUuid, castUuid: link.spellUuid, cast: link.cast, name: QIRAJI_MIND_FLAY.name, via: "feature"
  });
  return { name: QIRAJI_MIND_FLAY.name, img: "icons/svg/terror.svg", origin: link.sourceUuid,
    disabled: false, statuses: fearImmune ? [] : ["frightened"],
    description: "<p>At the start of each of your next three turns, take 3 Shadow damage. While the Mindslayer sustains this channel, your Speed is reduced by 10 feet and you are Frightened unless immune. Ending the channel or removing this effect ends its damage and penalties.</p>",
    system: { changes: [{ key: "system.speed", type: "add", value: -QIRAJI_MIND_FLAY.speed, phase: "final", priority: 5 }] },
    flags: { "azeroth-rpg": { harmful: true, spell: link.spellUuid, tick, [MIND_FLAY_FLAG]: { ...link } } } };
}

/** No channel survives a missing/changed Sustain. The adapter additionally
 * checks both actors, tokens, range, realm and source incapacitation.
 */
export function mindFlayHeld(link, sustaining = []) {
  return validMindFlayLink(link) && Array.isArray(sustaining) && sustaining.some(row => {
    const held = row?.[MIND_FLAY_FLAG];
    return validMindFlayLink(held) && row.cast === link.cast && row.uuid === link.spellUuid
      && Object.keys(link).every(key => held[key] === link[key]);
  });
}
