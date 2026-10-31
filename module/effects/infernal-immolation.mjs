import { INFERNAL, isInfernalImmolation, infernalImmolationPulse } from "../rules/infernal.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";

export const INFERNAL_IMMOLATION_TICKS = "infernalImmolationTicks";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = doc => doc?.uuid && fromUuidSync(doc.uuid) === doc;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const position = token => JSON.stringify([token.x, token.y, token.elevation, token._source?.level]);
const physical = actor => !projectionRefusal(actor, "ability") && !realmRefusalFor(actor, "ability");
const abilityOf = actor => actor?.type === "npc" ? actor.system?.creatureAbilities?.find(isInfernalImmolation) : null;

/** Source-scene turn-start processing, independent of the viewed canvas or
 * selection. Save each claim before damage and never replay an uncertain tick.
 */
export async function advanceInfernalImmolation(combat, combatant) {
  const refuse = reason => ({ ok: false, reason, results: [] });
  const target = combatant?.actor, victim = combatant?.token, scene = victim?.parent;
  const round = combat?.round, turn = combat?.turn;
  const current = () => gmHere() && present(combat) && present(combatant) && present(target)
    && combat.started && combat.combatant === combatant && combatant.parent === combat
    && combat.round === round && combat.turn === turn && combatant.actor === target && combatant.token === victim
    && scene?.tokens?.get(victim?.id) === victim && victim.actor === target;
  if (!current()) return refuse("turn");
  if (!physical(target)) return { ok: true, results: [] };
  if (busy.has(combatant.uuid)) return refuse("busy");
  busy.add(combatant.uuid);
  try {
    let expected = structuredClone(combatant.getFlag("azeroth-rpg", INFERNAL_IMMOLATION_TICKS) ?? []);
    if (!Array.isArray(expected)) return refuse("record");
    const originalPosition = position(victim), sources = [];
    // Capture every source before the first awaited damage write. One dying
    // source or a moved token later cannot silently change the original area.
    for (const token of scene.tokens.values()) {
      const actor = token.actor, ability = abilityOf(actor);
      if (!ability || !present(actor) || !(actor.system?.health?.value > 0) || !physical(actor)) continue;
      const level = token._source?.level;
      if (level !== victim._source?.level) continue;
      if (!scene.levels?.has(level)) return refuse("level");
      const distance = feetApart(token, victim);
      if (!Number.isFinite(distance) || distance < 0) return refuse("distance");
      const pulse = infernalImmolationPulse({ combatUuid: combat.uuid, combatantId: combatant.id, round, turn,
        sourceTokenUuid: token.uuid, targetTokenUuid: victim.uuid, sourceStanding: true, sameLevel: true, distance });
      if (pulse) {
        const prior = expected.find(row => row?.key === pulse.key);
        if (prior && prior.stage !== "applied") return refuse("reconcile");
        if (!prior) sources.push({ token, actor, ability: JSON.stringify(ability), position: position(token), pulse });
      }
    }
    const unchanged = () => current() && position(victim) === originalPosition
      && same(combatant.getFlag("azeroth-rpg", INFERNAL_IMMOLATION_TICKS) ?? [], expected);
    const save = async next => {
      if (!unchanged()) throw Error("Immolation turn changed");
      await combatant.setFlag("azeroth-rpg", INFERNAL_IMMOLATION_TICKS, next);
      if (!current() || !same(combatant.getFlag("azeroth-rpg", INFERNAL_IMMOLATION_TICKS), next)) throw Error("Immolation receipt unconfirmed");
      expected = next;
    };
    const results = [];
    for (const entry of sources) {
      const sourceValid = () => unchanged() && scene.tokens.get(entry.token.id) === entry.token
        && entry.token.actor === entry.actor && present(entry.actor) && entry.actor.system?.health?.value > 0
        && physical(entry.actor) && physical(target) && position(entry.token) === entry.position
        && JSON.stringify(abilityOf(entry.actor)) === entry.ability;
      if (!sourceValid()) return refuse("changed");
      await save([...expected, entry.pulse]);
      if (!sourceValid()) return refuse("changed");
      const lines = await strikeFromArea({ actor: target, caster: entry.actor,
        spell: { name: INFERNAL.immolation.name, school: "fire", feature: true, isSpell: false, takesSpellpower: false },
        damage: { rating: INFERNAL.immolation.damage, school: "fire" } });
      if (!current() || !Array.isArray(lines) || !lines.length) return refuse("damageUnconfirmed");
      await save(expected.map(row => row.key === entry.pulse.key ? { ...row, stage: "applied", lines } : row));
      results.push({ sourceTokenUuid: entry.token.uuid, targetTokenUuid: victim.uuid, lines });
      // Posting failure must not undo or repeat confirmed damage.
      try {
        const source = { sceneId: scene.id, tokenId: entry.token.id };
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: entry.actor }),
          content: `<p><strong>${foundry.utils.escapeHTML(game.i18n.localize("AZEROTH.Infernal.Immolation"))}</strong></p>${lines.map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`).join("")}`,
          flags: { "azeroth-rpg": { kind: "ability",
            featureKey: "ability:infernal-immolation",
            source: source ?? null,
            casting: false, success: true,
            targets: [{ actorUuid: target.uuid, sceneId: scene.id, tokenId: victim.id, name: target.name }],
            infernalImmolation: entry.pulse.key } } });
      } catch { results[results.length - 1].feedbackError = true; }
    }
    return { ok: true, results };
  } catch { return refuse("writeUncertain"); }
  finally { busy.delete(combatant.uuid); }
}
