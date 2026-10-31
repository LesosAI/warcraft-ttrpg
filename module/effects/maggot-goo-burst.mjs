/** Active-GM death burst. Claim once before any awaited target/effect work. */
import { MAGGOT_GOO, MAGGOT_GOO_FLAG, claimMaggotGoo } from "../rules/maggot-goo.mjs";
import { DREDGE_POISON_FLAG, validDredgePoison } from "../rules/dredge-poison.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { layDredgePoison } from "./dredge-poison.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function resolveMaggotGoo({ actor, token, deathId, observedDeath = false } = {}) {
  const results = [];
  let claimed = false, finished = false, selection;
  const refuse = reason => ({ ok: false, reason, claimed, results });
  if (!gmHere() || !actor?.uuid || !token?.uuid || pending.has(actor.uuid)) return refuse("authorityOrBusy");
  const scene = token.parent;
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;
  const started = clock(), position = { x: token.x, y: token.y, elevation: token.elevation, level: token.level };
  const valid = () => gmHere() && game.scenes?.get(scene?.id) === scene && scene.tokens?.get(token.id) === token
    && token.actor === actor && actor.system?.health?.value === 0 && clock() === started
    && Object.entries(position).every(([key, value]) => token[key] === value)
    && (actor.system?.creatureAbilities ?? []).some(row => row.name === MAGGOT_GOO.name)
    && !realmRefusalFor(actor, "ability");
  if (!valid()) return refuse("source");
  const plan = claimMaggotGoo({ actorUuid: actor.uuid, tokenUuid: token.uuid, sceneUuid: scene.uuid,
    deathId, clock: started, health: actor.system.health.value, observedDeath,
    existing: actor.flags?.["azeroth-rpg"]?.[MAGGOT_GOO_FLAG] ?? null });
  if (!plan.ok) return refuse(plan.reason);
  pending.add(actor.uuid);
  const report = () => results.map(row => `${row.name}: ${row.resisted ? "resisted" : row.immune ? "immune to poison"
    : row.fallen ? "damage resolved; target fell" : row.poisonApplied ? "damage resolved; poison applied" : row.existing ? "damage resolved; existing poison retained"
    : row.damageAttempted ? "damage or poison not fully confirmed" : "not resolved"}.`).join(" ");
  try {
    await actor.setFlag("azeroth-rpg", MAGGOT_GOO_FLAG, plan.state);
    claimed = true;
    const held = () => JSON.stringify(actor.flags?.["azeroth-rpg"]?.[MAGGOT_GOO_FLAG]) === JSON.stringify(plan.state);
    if (!valid() || !held()) return refuse("claimUnconfirmed");
    const { chooseOption, rollResilience } = await import("../dice/workflows.mjs");
    selection = await reviewNearbyEnemies({ actor, scene, sourceToken: token, chooseOption,
      name: MAGGOT_GOO.name, radius: MAGGOT_GOO.feet, automatic: true,
      payment: "This death burst spends no Action or use.", validOrigin: () => valid() && held() });
    if (!selection.ok) {
      if (selection.reason === "empty" && valid() && held()) selection = { ok: true, targets: [], valid: () => valid() && held() };
      else return refuse(selection.reason);
    }
    for (const target of selection.targets) {
      const still = () => valid() && held() && selection.valid()
        && scene.tokens.get(target.token.id) === target.token && target.token.actor === target.actor
        && !realmRefusalFor(target.actor, "ability");
      if (!still()) return refuse("changedArea");
      const victim = target.actor, row = { name: target.token.name, actorUuid: victim.uuid, damageAttempted: false, poisonApplied: false };
      results.push(row);
      if ((victim.system?.conditionImmunities ?? []).includes("poisoned")) { row.immune = true; continue; }
      const card = await rollResilience({ actor: victim, resilience: "body", dc: MAGGOT_GOO.dc, subtitle: MAGGOT_GOO.name });
      row.test = card?.id ?? null; row.resisted = card?.rolls?.[0]?.outcome?.success;
      if (typeof row.resisted !== "boolean") return refuse("unresolved");
      if (!still()) return refuse("changedArea");
      if ((victim.system?.conditionImmunities ?? []).includes("poisoned")) { row.immune = true; continue; }
      if (row.resisted) continue;
      row.damageAttempted = true;
      row.damage = await strikeFromArea({ actor: victim, caster: actor,
        spell: { name: MAGGOT_GOO.name, school: "nature", takesSpellpower: false, feature: true, isSpell: false },
        damage: { rating: MAGGOT_GOO.immediate, school: "nature" } });
      if (!row.damage.length || !still()) return refuse("damageUnconfirmed");
      if (victim.type === "npc" && !(victim.system?.health?.value > 0)) { row.fallen = true; continue; }
      row.existing = [...(victim.effects ?? [])].some(effect => {
        const state = effect.flags?.["azeroth-rpg"]?.[DREDGE_POISON_FLAG];
        return validDredgePoison(state) && state.kind === "goo" && state.targetUuid === victim.uuid;
      });
      if (!row.existing) {
        const landed = await layDredgePoison({ source: actor, target: victim, kind: "goo", valid: still });
        row.poisonApplied = landed?.ok === true && !!landed.effectId;
        row.immune = landed?.immune === true;
        row.effectId = landed?.effectId ?? null;
        if (!landed?.ok) return refuse("poisonUnconfirmed");
      }
    }
    const source = { sceneId: scene.id, tokenId: token.id };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Maggot Goo</strong></p><p>${foundry.utils.escapeHTML(report() || "No enemies affected.")}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: source ?? null,
        featureKey: "ability:maggot-goo",
        casting: false, success: true, maggotGoo: results,
        targets: selection.targets.map(t => ({ sceneId: scene.id, tokenId: t.token.id, actorUuid: t.actorUuid, name: t.token.name })) } } });
    finished = true;
    return { ok: true, claimed, results };
  } catch (error) { console.warn("azeroth-rpg | Maggot Goo", error); return refuse("writeUncertain"); }
  finally {
    pending.delete(actor.uuid);
    if (!finished) {
      try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p>Maggot Goo could not be fully resolved. Check Health and poison before making any manual correction. ${foundry.utils.escapeHTML(report())}</p>`,
        flags: { "azeroth-rpg": { kind: "maggotGooReport", claimed, maggotGoo: results } } });
      } catch (error) { console.warn("azeroth-rpg | Maggot Goo report", error); }
    }
  }
}
