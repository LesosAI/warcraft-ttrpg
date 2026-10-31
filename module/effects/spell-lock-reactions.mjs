import { SPELL_LOCK, spellLockEligible } from "../rules/spell-lock.mjs";
import { feetApart } from "../canvas/footprints.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { endLesserInvisibility } from "./lesser-invisibility.mjs";
import { claimSpellLock, SPELL_LOCK_RECEIPTS } from "./spell-lock-state.mjs";
import { postSpellLockReaction } from "./spell-lock-feedback.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const point = token => JSON.stringify([token.x, token.y, token.elevation, token.width, token.height,
  token.rotation, token.disposition, token._source?.level]);
const fightStamp = actor => {
  const fight = actor.activeFight?.();
  return fight?.started ? `${fight.uuid}:${fight.round}:${fight.turn}` : null;
};

/** The active GM decides whether a candidate can see the caster, accounting
 * for walls, blindness and invisibility. A decline (including closing that
 * prompt) spends nothing. Range and scene level are measured, not overridden
 * by the prompt. Returned claims are the payment helper's confirmed receipts.
 * null means the world changed or a payment became uncertain: do not roll. */
export async function collectSpellLockReactions({ actor, source, cast, valid, measure = feetApart,
  chooseOption = null, spendTurnBudget = null, turnBudgetRefusal = null, reveal = endLesserInvisibility,
  post = postSpellLockReaction } = {}) {
  if (!gmHere() || typeof valid !== "function" || !valid() || cast?.phase !== "open"
    || cast.casterUuid !== actor?.uuid || fromUuidSync(actor.uuid) !== actor) return null;
  // An unplaced creature has no measured reaction targets, as with reach.
  if (!source) return [];
  const scene = game.scenes?.get(source.sceneId), casterToken = scene?.tokens?.get(source.tokenId);
  if (!scene || casterToken?.actor !== actor || !scene.levels?.get(casterToken._source?.level)) return null;
  const tokens = values(scene.tokens), tokenStates = new Map(tokens.map(token => [token, { actor: token.actor, point: point(token) }]));
  const walls = () => JSON.stringify(values(scene.walls).map(wall => wall._source));
  const originalWalls = walls(), worldTime = game.time?.worldTime, casterFight = fightStamp(actor);
  const stable = () => gmHere() && valid() && cast.phase === "open" && cast.casterUuid === actor.uuid
    && fromUuidSync(actor.uuid) === actor && game.scenes.get(scene.id) === scene
    && game.time?.worldTime === worldTime && fightStamp(actor) === casterFight && walls() === originalWalls
    && values(scene.tokens).length === tokens.length && tokens.every(token => scene.tokens.get(token.id) === token
      && token.actor === tokenStates.get(token).actor && point(token) === tokenStates.get(token).point);
  if (!Number.isSafeInteger(worldTime) || worldTime < 0 || !stable()) return null;
  if (!chooseOption || !spendTurnBudget || !turnBudgetRefusal) {
    const workflows = await import("../dice/workflows.mjs");
    chooseOption ??= workflows.chooseOption;
    spendTurnBudget ??= workflows.spendTurnBudget;
    turnBudgetRefusal ??= workflows.turnBudgetRefusal;
  }
  const claims = [], reacted = new Set();
  for (const token of tokens) {
    if (!stable()) return null;
    const reactor = token.actor;
    if (!reactor || reactor === actor || reacted.has(reactor.uuid)) continue;
    const abilities = reactor.system?.creatureAbilities ?? [];
    const index = abilities.findIndex(row => row.name === SPELL_LOCK.name);
    if (index < 0 || abilities.filter(row => row.name === SPELL_LOCK.name).length !== 1) continue;
    const originalFight = fightStamp(reactor);
    let reactionPaid = false, usePaid = false, visible = false;
    const eligible = ({ reviewing = false } = {}) => {
      if (!stable() || fromUuidSync(reactor.uuid) !== reactor || fightStamp(reactor) !== originalFight) return false;
      const row = reactor.system?.creatureAbilities?.[index], automation = row?.automation;
      if ((reactor.system?.creatureAbilities ?? []).filter(entry => entry.name === SPELL_LOCK.name).length !== 1
        || row?.name !== SPELL_LOCK.name || automation?.kind !== "utility" || automation.action !== "reaction"
        || automation.dc !== SPELL_LOCK.dc || automation.cost?.amount > 0 || automation.uses?.max !== 1
        || automation.uses.per !== "short" || automation.uses.value !== (usePaid ? 0 : 1)) return false;
      if (reactor.statuses?.has("stunned") || reactor.statuses?.has("silenced")
        || realmRefusalFor(reactor, "reaction") || turnBudgetRefusal(reactor, reactionPaid ? null : "reaction")) return false;
      return spellLockEligible({ reactorUuid: reactor.uuid, casterUuid: actor.uuid, reactorType: reactor.type,
        health: reactor.system?.health?.value, casterHealth: actor.system?.health?.value,
        uses: usePaid ? 1 : automation.uses.value, canReact: true, casting: true, visible: reviewing || visible,
        feet: measure(token, casterToken), sameScene: token.parent === scene && casterToken.parent === scene,
        sameLevel: token._source?.level === casterToken._source?.level && !!scene.levels.get(token._source?.level) });
    };
    if (!eligible({ reviewing: true })) continue;
    const choice = await chooseOption({ id: `${reactor.id}-${cast.id}`, name: SPELL_LOCK.name }, [
      { key: "decline", name: "Do not react", description: "Keep the Reaction and Short Rest use." },
      { key: "react", name: "Use Spell Lock", description: "Confirm this creature can see the caster, including walls, blindness and invisibility. Spend one Reaction and one Short Rest use to impose one Bane on this Casting Test." }
    ], null, { prompt: `GM: Does ${token.name ?? reactor.name} use Spell Lock against ${casterToken.name ?? actor.name}?` });
    if (!stable()) return null;
    if (!choice || choice.key === "decline") continue;
    if (choice.key !== "react") return null;
    visible = true;
    if (!eligible()) return null;
    const result = await claimSpellLock({ actor: reactor, cast, validate: eligible,
      payReaction: async () => {
        if (!eligible()) return false;
        const spent = await spendTurnBudget(reactor, "reaction");
        if (spent !== true) return spent;
        reactionPaid = true;
        return eligible() ? true : undefined;
      },
      payUse: async () => {
        if (!eligible()) return undefined;
        const rows = structuredClone(reactor.system.creatureAbilities);
        rows[index].automation.uses.value = 0;
        await reactor.update({ "system.creatureAbilities": rows });
        usePaid = true;
        if (!eligible()) return undefined;
        await reveal(reactor, { event: "ability" });
        return eligible() ? true : undefined;
      } });
    if (!result.ok) {
      const receipts = reactor.getFlag("azeroth-rpg", SPELL_LOCK_RECEIPTS);
      // An explicitly refused Reaction paid nothing. The current cast may
      // continue without it; an uncertain payment still stops the window.
      if (result.reason === "reaction" && Array.isArray(receipts)
        && receipts.some(row => row.castId === cast.id && row.stage === "cancelled" && row.reactionPaid === false)) {
        reacted.add(reactor.uuid);
        continue;
      }
      return null;
    }
    try {
      const message = await post({ actor: reactor, caster: actor, claim: result.claim,
        source: { sceneId: scene.id, tokenId: token.id }, target: source });
      if (!message) throw new Error("Missing reaction feedback");
    } catch {
      globalThis.ui?.notifications?.warn("Spell Lock was paid, but its chat feedback could not be confirmed. The Bane still applies.");
    }
    claims.push(result.claim); reacted.add(reactor.uuid);
  }
  return stable() ? claims : null;
}
