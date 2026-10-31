import { SENTINEL_POWERS } from "../rules/anubisath-pack.mjs";
import { assignSentinelPack, resetSentinelPack, activeSentinelPowers } from "./anubisath-pack.mjs";

const scope = "azeroth-rpg";
const stateOf = actor => actor?.flags?.[scope]?.sentinelPack;
const names = {
  "mana-burn": "Mana Burn", mending: "Mending", "shadow-storm": "Shadow Storm",
  thunderclap: "Thunderclap", "mortal-strike": "Mortal Strike",
  "fire-arcane-reflect": "Fire and Arcane Reflection",
  "shadow-frost-reflect": "Shadow and Frost Reflection",
  "knock-away": "Knock Away", thorns: "Thorns"
};
const values = collection => collection?.values?.() ?? collection ?? [];
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const sentinel = actor => actor?.type === "npc"
  && actor.system?.creatureAbilities?.some(row => row.name === "Sentinel Pack");
const present = actor => actor?.uuid && fromUuidSync(actor.uuid) === actor;
const fighting = actor => (game.combats?.contents ?? []).some(combat => combat.started
  && combat.getCombatantsByActor(actor)?.length);

/** A GM chooses concrete world/synthetic actors, never compendium entries.
 * Nothing is written until all members and powers have been reviewed. */
export async function manageSentinelPack(actor, { choose, makeId } = {}) {
  const refused = reason => ({ ok: false, reason });
  if (!gmHere() || !present(actor) || !sentinel(actor)) return refused("actorOrGM");
  const picker = choose ?? (await import("../dice/workflows.mjs")).chooseOption;
  const identity = { id: `${actor.id}-sentinel-pack`, name: "Sentinel Pack" };
  const before = JSON.stringify(stateOf(actor));
  const stable = () => gmHere() && present(actor) && sentinel(actor)
    && before === JSON.stringify(stateOf(actor));
  if (stateOf(actor) != null) {
    const powers = activeSentinelPowers(actor).map(key => names[key]).join(", ") || "No active powers";
    const answer = await picker(identity, [
      { key: "keep", name: "Keep this pack", description: powers },
      { key: "reset", name: "Clear this pack", description: "Clear all four members' assignments and transfer records. Health stays unchanged. Resolve unfinished transfers first." }
    ], null, { prompt: "Reset is available only when every member is out of combat." });
    if (answer?.key !== "reset") return refused("cancelled");
    if (!stable()) return refused("changed");
    return resetSentinelPack(actor, { valid: () => gmHere() && present(actor) });
  }
  if (actor.system.health.value <= 0 || fighting(actor)) return refused("deadOrCombat");
  const candidates = new Map();
  const add = (candidate, location) => {
    if (present(candidate) && sentinel(candidate) && candidate.system.health.value > 0
      && stateOf(candidate) == null && !fighting(candidate)) {
      candidates.set(candidate.uuid, { actor: candidate, location });
    }
  };
  for (const candidate of values(game.actors)) add(candidate, "World actor");
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) add(token.actor, scene.name);
  candidates.delete(actor.uuid);
  if (candidates.size < 3) return refused("fourMembersRequired");
  const members = [actor];
  const valid = () => gmHere() && members.every(member => present(member) && sentinel(member)
    && member.system.health.value > 0 && !fighting(member));
  for (let index = 1; index < 4; index++) {
    const options = [...candidates.values()].filter(row => !members.includes(row.actor)).map(row => ({
      key: row.actor.uuid, name: `${row.actor.name} — ${row.location}`,
      description: `Choose as pack member ${index + 1}.`
    }));
    const selected = await picker(identity, options, null, { prompt: `Choose member ${index + 1} of 4.` });
    const picked = candidates.get(selected?.key)?.actor;
    if (!picked || members.includes(picked)) return refused("cancelled");
    members.push(picked);
    if (!stable() || !valid() || members.some(member => stateOf(member) != null)) return refused("changed");
  }
  const powers = [];
  for (const member of members) {
    const options = SENTINEL_POWERS.filter(key => !powers.includes(key)).map(key => ({
      key, name: names[key], description: `Assign ${names[key]} as ${member.name}'s original power.`
    }));
    const selected = await picker(identity, options, null, { prompt: `Choose ${member.name}'s original power.` });
    if (!options.some(option => option.key === selected?.key)) return refused("cancelled");
    powers.push(selected.key);
    if (!stable() || !valid() || members.some(member => stateOf(member) != null)) return refused("changed");
  }
  const answer = await picker(identity, [
    { key: "cancel", name: "Cancel", description: "Leave all four Sentinels unchanged." },
    { key: "assign", name: "Assign this pack", description: members.map((member, index) =>
      `${member.name}: ${names[powers[index]]}`).join("; ") }
  ], null, { prompt: "Review this four-member pack. Each fallen member passes its original power to the survivors." });
  if (answer?.key !== "assign") return refused("cancelled");
  if (!stable() || !valid()) return refused("changed");
  return assignSentinelPack({ actors: members, powers,
    packId: (makeId ?? (() => foundry.utils.randomID()))(), valid });
}
