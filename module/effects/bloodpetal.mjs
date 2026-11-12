/** Active-GM root lifecycle. One removable effect owns both the movement
 * restriction and pulses; removing it can never leave an independent DoT. */
import { BLOODPETAL, BLOODPETAL_FLAG, validBloodpetal, seedBloodpetal, bloodpetalClock, bloodpetalPulse, rootDifficulty } from "../rules/bloodpetal.mjs";
import { ESCAPE_FLAG, cleanEscape } from "../rules/escapes.mjs";
import { strikeFromArea } from "./area-strikes.mjs";

const pending = new Set();
const gmHere = () => game.user?.isGM === true && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const present = actor => actor?.documentName === "Actor" && resolve(actor.uuid) === actor;
const stateOf = effect => effect?.flags?.["azeroth-rpg"]?.[BLOODPETAL_FLAG];
const clockOf = combat => ({ round: combat.round, turn: combat.turn });
const rooted = effect => [...(effect.statuses ?? [])].includes("entangled");
const text = key => game.i18n.localize(`AZEROTH.Bloodpetal.${key}`);
const held = (actor, effect) => present(actor) && actor.effects.get(effect.id) === effect;
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;
const clockArgs = combat => combat ? { combatUuid: combat.uuid, clock: clockOf(combat) } : { time: game.time?.worldTime };

export async function layBloodpetalRoots({ source, target, combat = null, dc = BLOODPETAL.dc } = {}) {
  if (!gmHere()) throw new Error("Bloodpetal roots require the active GM.");
  if (rootDifficulty({ dc }) !== dc) return { ok: false, reason: "invalidDC" };
  if (!present(source) || !present(target) || pending.has(target.uuid)) return { ok: false, reason: "unavailable" };
  if ((target.system?.conditionImmunities ?? []).includes("entangled")) return { ok: false, reason: "immune" };
  if (combat && (!combat.started || !combat.getCombatantsByActor(source)?.length || !combat.getCombatantsByActor(target)?.length)) return { ok: false, reason: "encounter" };
  pending.add(target.uuid);
  try {
    const state = seedBloodpetal({ sourceUuid: source.uuid, targetUuid: target.uuid,
      ...clockArgs(combat), existing: [...target.effects].map(stateOf).filter(Boolean) });
    if (!state) return { ok: false, reason: "alreadyAffectedOrInvalidClock" };
    const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
      name: text("Name"), description: game.i18n.format("AZEROTH.Bloodpetal.Description", { dc }), img: "icons/svg/net.svg", origin: source.uuid,
      statuses: ["entangled"], system: { changes: [{ key: "system.speed", type: "override", value: 0, phase: "final" }] },
      flags: { "azeroth-rpg": { [BLOODPETAL_FLAG]: state, harmful: true, magic: true,
        [ESCAPE_FLAG]: cleanEscape({ condition: "entangled", on: "action", resilience: "reflex", dc,
          by: source.uuid, source: BLOODPETAL.name, banes: 0 }) } }
    }]);
    if (!effect) return { ok: false, reason: "notCreated" };
    if (!present(source) || !held(target, effect) || !rooted(effect) || (target.system?.conditionImmunities ?? []).includes("entangled")) {
      if (held(target, effect)) await effect.delete();
      return { ok: false, reason: "changedTarget" };
    }
    // A combat can end during document creation. Preserve the three pulses
    // while moving to the clock now governing the target.
    const next = bloodpetalClock(state, clockArgs(fightOf(target)));
    if (next && next !== state && held(target, effect)) await effect.update({ [`flags.azeroth-rpg.${BLOODPETAL_FLAG}`]: next });
    return { ok: true, effectId: effect.id };
  } finally { pending.delete(target.uuid); }
}

function carriers() {
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

/** A supplemental visual record, never a second damage card. */
export async function postBloodpetalPulse(actor, combat = null) {
  let ref = null;
  if (combat?.combatant?.actor?.uuid === actor.uuid) {
    // The scene the combatant's token stands on (O-294): core makes a fight unlinked.
    const sceneId = combat.combatant.token?.parent?.id ?? combat.combatant.sceneId ?? combat.scene?.id ?? combat.sceneId;
    const token = game.scenes?.get(sceneId)?.tokens.get(combat.combatant.tokenId);
    if (token?.actor?.uuid === actor.uuid) ref = { sceneId, tokenId: token.id };
  } else if (!combat) {
    const refs = [];
    for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor?.uuid === actor.uuid) refs.push({ sceneId: scene.id, tokenId: token.id });
    if (refs.length === 1) ref = refs[0];
  }
  if (!ref) return false;
  try {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${text("Pulse")}</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        source: ref ?? null,
        featureKey: "ability:bloodpetal-root-pulse",
        casting: false, success: true, targets: [ref] } } });
    return true;
  } catch { ui.notifications?.warn(text("CueFailed")); return false; }
}

async function advance(actor, combat = null) {
  if (!gmHere() || !present(actor) || pending.has(actor.uuid)) return [];
  if (combat && (!combat.started || combat.combatant?.actor?.uuid !== actor.uuid)) return [];
  pending.add(actor.uuid);
  const lines = [];
  try {
    for (const effect of [...actor.effects].filter(stateOf)) {
      // At most three world pulses; combat invocation is exactly one turn.
      for (let i = 0; i < (combat ? 1 : BLOODPETAL.ticks) && held(actor, effect); i++) {
        const state = stateOf(effect), source = resolve(state?.sourceUuid);
        if (!validBloodpetal(state) || !present(source) || !rooted(effect)
          || state.targetUuid !== actor.uuid || (actor.system?.conditionImmunities ?? []).includes("entangled")) { await effect.delete(); break; }
        const governing = combat ?? fightOf(actor);
        const nextClock = bloodpetalClock(state, clockArgs(governing));
        if (nextClock && nextClock !== state) {
          await effect.update({ [`flags.azeroth-rpg.${BLOODPETAL_FLAG}`]: nextClock });
          break;
        }
        // World-time notifications never advance a combat-held root.
        if (!combat && governing) break;
        const plan = bloodpetalPulse(state, { targetUuid: actor.uuid, entangled: rooted(effect), sourceExists: present(source),
          disabled: effect.disabled === true || effect.active === false, ...clockArgs(combat) });
        if (plan.action === "end") { await effect.delete(); break; }
        if (plan.next !== state) await effect.update({ [`flags.azeroth-rpg.${BLOODPETAL_FLAG}`]: plan.next });
        if (plan.action === "none") break;
        // The pulse is already claimed. Any interrupted write or failed
        // damage attempt must not be replayed by another hook or GM.
        try {
          if (held(actor, effect) && present(source) && rooted(effect) && effect.disabled !== true && effect.active !== false
            && !(actor.system?.conditionImmunities ?? []).includes("entangled") && (actor.type !== "npc" || actor.system?.health?.value > 0)) {
            lines.push(...await strikeFromArea({ actor, caster: source,
              spell: { name: BLOODPETAL.name, school: "nature", takesSpellpower: false, feature: true, isSpell: false }, damage: plan.damage }));
            await postBloodpetalPulse(actor, combat);
          }
        } catch { ui.notifications?.warn(text("DamageFailed")); }
        finally {
          if (held(actor, effect) && (plan.endsAfterDamage || !present(source) || !rooted(effect))) await effect.delete();
          else if (held(actor, effect)) {
            // Combat transitions can occur while damage is awaited, when the
            // cleanup hook must skip this actor's lock. Transfer now rather
            // than delaying the next pulse until a later world-time event.
            const next = bloodpetalClock(stateOf(effect), clockArgs(fightOf(actor)));
            if (next && next !== stateOf(effect)) await effect.update({ [`flags.azeroth-rpg.${BLOODPETAL_FLAG}`]: next });
          }
        }
      }
    }
  } finally { pending.delete(actor.uuid); }
  return lines;
}

export async function advanceBloodpetal(actor, combat) { return advance(actor, combat); }
export async function advanceBloodpetalWorld() {
  const lines = [];
  if (!gmHere() || !Number.isFinite(game.time?.worldTime)) return lines;
  for (const actor of carriers()) lines.push(...await advance(actor));
  return lines;
}

export async function cleanBloodpetalEffects() {
  if (!gmHere()) return;
  for (const actor of carriers()) {
    if (!present(actor) || pending.has(actor.uuid)) continue;
    pending.add(actor.uuid);
    try {
      for (const effect of [...actor.effects].filter(stateOf)) {
        const state = stateOf(effect);
        if (!validBloodpetal(state) || state.targetUuid !== actor.uuid || !present(resolve(state.sourceUuid)) || !rooted(effect)
          || (actor.system?.conditionImmunities ?? []).includes("entangled")) { if (held(actor, effect)) await effect.delete(); continue; }
        const next = bloodpetalClock(state, clockArgs(fightOf(actor)));
        if (next && next !== state && held(actor, effect)) await effect.update({ [`flags.azeroth-rpg.${BLOODPETAL_FLAG}`]: next });
      }
    } finally { pending.delete(actor.uuid); }
  }
}

export function registerBloodpetalHooks() {
  const clean = () => { void cleanBloodpetalEffects().catch(() => ui.notifications?.warn(text("TimingFailed"))); };
  for (const hook of ["ready", "deleteActor", "deleteToken", "deleteScene", "deleteCombat", "createCombatant", "deleteCombatant"]) Hooks.on(hook, clean);
  Hooks.on("updateCombat", (_, changed) => { if ("round" in changed || "started" in changed) clean(); });
  Hooks.on("updateActiveEffect", (effect, changed) => { if (stateOf(effect) && "statuses" in changed) clean(); });
  Hooks.on("updateWorldTime", () => { void cleanBloodpetalEffects().then(advanceBloodpetalWorld).catch(() => ui.notifications?.warn(text("TimingFailed"))); });
}
