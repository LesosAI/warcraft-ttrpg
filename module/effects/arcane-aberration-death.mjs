import { ABERRATION_DEATH as SPEC, aberrationDeathClaim } from "../rules/arcane-aberration.mjs";
import { ABERRATION_DEATH_FLAG as FLAG, applyAberrationManaBurn } from "./arcane-aberration-burn.mjs";
import { reviewNearbyEnemies } from "./area-enemies.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
const pending = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

/** Reset only the reviewed token's receipt, outside combat. Health is unchanged;
 * the observer still requires a later living-to-zero transition. */
export async function resetAberrationDeath(actor, { choose } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || actor?.type !== "npc"
    || !actor.system?.creatureAbilities?.some(row => row.name === SPEC.name)) return refuse("authority");
  const inCombat = () => actor.activeFight?.()?.started || [...(game.combats?.values?.() ?? [])].some(fight =>
    fight.started && [...(fight.combatants?.values?.() ?? [])].some(combatant => combatant.actor === actor));
  if (inCombat()) return refuse("combat");
  const tokens = [...(game.scenes?.values?.() ?? [])].flatMap(scene => [...scene.tokens.values()])
    .filter(token => token.actor === actor && token.getFlag("azeroth-rpg", FLAG) != null);
  if (!tokens.length) return refuse("noClaim");
  const chooser = choose ?? (await import("../dice/workflows.mjs")).chooseOption;
  let token = tokens.length === 1 ? tokens[0] : null;
  if (!token) {
    const picked = await chooser({ id: `${actor.id}-death-reset-origin`, name: "Reset Unraveling Mana" },
      tokens.map(candidate => ({ key: candidate.uuid, name: `${candidate.name} — ${candidate.parent.name}`,
        description: "Review this token's recorded death burst." })), null, { prompt: "Which token is starting a new encounter?" });
    token = tokens.find(candidate => candidate.uuid === picked?.key);
  }
  if (!token) return refuse("cancelled");
  if (pending.has(token.uuid)) return refuse("busy");
  if (token.getFlag("azeroth-rpg", FLAG) == null) return refuse("noClaim");
  const before = JSON.stringify(token.getFlag("azeroth-rpg", FLAG));
  const valid = () => gmHere() && !inCombat() && token.actor === actor
    && game.scenes.get(token.parent.id) === token.parent && token.parent.tokens.get(token.id) === token
    && actor.system?.creatureAbilities?.some(row => row.name === SPEC.name)
    && JSON.stringify(token.getFlag("azeroth-rpg", FLAG)) === before;
  if (!valid()) return refuse("changed");
  pending.add(token.uuid);
  try {
    const answer = await chooser({ id: `${actor.id}-death-reset`, name: "Reset Unraveling Mana" }, [
      { key: "cancel", name: "Keep the record", description: "Leave the previous death burst recorded." },
      { key: "reset", name: "Reset for a new encounter", description: "Clear this token's record. Do not restore Health, refund Mana or repeat damage." }
    ], null, { prompt: "GM: Finish reviewing any interrupted Mana loss and damage first. A new burst requires this creature to return to life and die again." });
    if (answer?.key !== "reset") return refuse("cancelled");
    if (!valid()) return refuse("changed");
    await token.unsetFlag("azeroth-rpg", FLAG);
    if (token.getFlag("azeroth-rpg", FLAG) != null) return refuse("unconfirmed");
    ui.notifications?.info("Unraveling Mana is reset for a new encounter. Health has not changed.");
    return { ok: true };
  } catch (error) {
    console.warn("azeroth-rpg | Reset Unraveling Mana", error);
    return refuse("writeUncertain");
  } finally { pending.delete(token.uuid); }
}

/** The hook supplies an observed death, never a corpse discovered on load. */
export async function resolveAberrationDeath({ actor, token, observedDeath = false } = {}) {
  const results = [];
  let claimed = false, finished = false;
  const refuse = reason => ({ ok: false, reason, claimed, results });
  if (!gmHere() || !actor?.uuid || actor.type !== "npc" || !token?.uuid || pending.has(token.uuid)) return refuse("authorityOrBusy");
  const scene = token.parent, level = token._source?.level;
  const position = JSON.stringify([token.x, token.y, token.elevation, level]);
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : game.time?.worldTime;
  const started = clock();
  const sourceValid = () => gmHere() && started != null && clock() === started
    && game.scenes?.get(scene?.id) === scene && scene.tokens.get(token.id) === token && token.actor === actor
    && actor.system?.health?.value === 0 && scene.levels?.get(level)
    && JSON.stringify([token.x, token.y, token.elevation, token._source?.level]) === position
    && actor.system?.creatureAbilities?.some(row => row.name === SPEC.name) && !realmRefusalFor(actor, "ability");
  if (!sourceValid()) return refuse("source");
  const claim = aberrationDeathClaim({ tokenUuid: token.uuid, actorUuid: actor.uuid, health: actor.system.health,
    existing: token.getFlag("azeroth-rpg", FLAG) ?? null, observedDeath });
  if (!claim) return refuse("claim");
  const valid = () => {
    const held = token.getFlag("azeroth-rpg", FLAG);
    return sourceValid() && held?.state === "claimed" && held.tokenUuid === token.uuid && held.actorUuid === actor.uuid;
  };
  pending.add(token.uuid);
  try {
    await token.setFlag("azeroth-rpg", FLAG, claim); claimed = true;
    if (!valid() || JSON.stringify(token.getFlag("azeroth-rpg", FLAG)) !== JSON.stringify(claim)) return refuse("claimUnconfirmed");
    const { chooseOption, rollResilience } = await import("../dice/workflows.mjs");
    const selection = await reviewNearbyEnemies({ actor, scene, sourceToken: token, chooseOption,
      name: SPEC.name, radius: SPEC.radius, automatic: true, allowEmpty: true, validOrigin: valid,
      includeToken: candidate => candidate._source?.level === level,
      payment: "No Action or Mana is spent. Spirit DC 17 halves the Mana drained; Shadow damage is half the actual Mana loss." });
    if (!selection.ok) return refuse(selection.reason);
    const targetPosition = target => JSON.stringify([
      target.token.x, target.token.y, target.token.elevation, target.token._source?.level
    ]);
    const positions = selection.targets.map(targetPosition);
    const targetsValid = () => selection.valid()
      && selection.targets.every((target, index) => targetPosition(target) === positions[index]);
    for (const target of selection.targets) {
      const victim = target.actor;
      const current = () => valid() && targetsValid() && target.token.actor === victim
        && scene.tokens.get(target.token.id) === target.token && !realmRefusalFor(victim, "ability");
      if (!current()) return refuse("changedArea");
      if (!(victim.system?.health?.value > 0)) continue;
      const cover = await chooseOption({ id: `${token.id}-cover`, name: SPEC.name }, [
        { key: "blocked", name: "Protected by solid cover", description: "The burst cannot reach this creature." },
        { key: "exposed", name: "Exposed", description: "Resolve this creature's Mana loss and resistance." }
      ], null, { prompt: `GM: Can the burst reach ${target.token.name}?` });
      if (!current() || !["blocked", "exposed"].includes(cover?.key)) return refuse("cover");
      if (cover.key === "blocked") continue;
      const snapshot = victim.poolSnapshot();
      const pools = snapshot.filter(pool => pool.kind === "power" && (pool.name === "mana" || (victim.type === "npc" && pool.name == null)));
      if (!pools.length) { results.push({ name: target.token.name, drained: 0, damage: 0 }); continue; }
      let itemId = pools[0].itemId;
      if (pools.length > 1) {
        const choice = await chooseOption({ id: `${token.id}-pool`, name: SPEC.name }, pools.map((pool, index) => ({
          key: String(index), name: victim.items?.get(pool.itemId)?.name ?? "Mana", description: `${pool.value} Mana remaining.`
        })), null, { prompt: `Choose one Mana pool for ${target.token.name}.` });
        const selected = pools.find((pool, index) => String(index) === choice?.key);
        if (!selected || !current()) return refuse("poolChoice");
        itemId = selected.itemId;
      }
      if (!current() || JSON.stringify(victim.poolSnapshot()) !== JSON.stringify(snapshot)) return refuse("changedPool");
      const test = await rollResilience({ actor: victim, resilience: SPEC.resilience, dc: SPEC.dc, subtitle: SPEC.name });
      const resisted = test?.rolls?.[0]?.outcome?.success;
      if (!current() || typeof resisted !== "boolean") return refuse("test");
      const result = await applyAberrationManaBurn({ token, victim, itemId, resisted, valid: current });
      results.push({ name: target.token.name, actorUuid: victim.uuid, testId: test.uuid ?? test.id, ...result.result, reason: result.reason });
      if (!result.ok) return refuse(result.reason);
    }
    if (!valid() || !targetsValid()) return refuse("changedArea");
    const done = { ...token.getFlag("azeroth-rpg", FLAG), state: "finished" };
    await token.setFlag("azeroth-rpg", FLAG, done);
    if (!sourceValid() || JSON.stringify(token.getFlag("azeroth-rpg", FLAG)) !== JSON.stringify(done)) return refuse("record");
    finished = true;
    try {
      const source = { sceneId: scene.id, tokenId: token.id };
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        whisper: game.users.filter(user => user.isGM).map(user => user.id),
        content: `<p>${SPEC.name}: death burst resolved. See the death report for Mana loss and damage.</p>`,
        flags: { "azeroth-rpg": { kind: "ability",
          source: source ?? null,
          featureKey: "ability:unraveling-mana",
          casting: false, success: true, targets: [], tokenUuid: token.uuid } } });
    } catch (error) { console.warn("azeroth-rpg | Arcane Aberration death feedback", error); }
    return { ok: true, claimed, results };
  } catch (error) {
    console.warn("azeroth-rpg | Arcane Aberration death", error);
    return refuse("interrupted");
  } finally {
    pending.delete(token.uuid);
    if (claimed) {
      try {
        const escape = foundry.utils.escapeHTML;
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
          whisper: game.users.filter(user => user.isGM).map(user => user.id),
          content: `<p><strong>${SPEC.name}</strong></p><p>${finished ? "Death burst resolved." : "Death burst interrupted. Review the token's death record before correcting any Mana loss or damage."}</p>`
            + results.map(row => `<p>${escape(row.name)}: ${row.drained ?? "unconfirmed"} Mana lost; ${row.damage ?? "unconfirmed"} Shadow damage before Ward and other defenses.</p>`).join(""),
          flags: { "azeroth-rpg": { kind: "aberrationDeathReport", finished, tokenUuid: token.uuid, results } } });
      } catch (error) { console.warn("azeroth-rpg | Arcane Aberration death report", error); }
    }
  }
}
