/** Active-GM configuration; a choice is stored on this specific creature. */
import { ANCIENT_SPECIAL_FLAG, ANCIENT_SPECIALS, ancientSpecialOf, chooseAncientSpecial } from "../rules/ancient-core-hound.mjs";
const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

export async function configureAncientSpecial(actor, { choose, random = Math.random } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || actor?.type !== "npc" || resolve(actor.uuid) !== actor) return refuse("owner");
  if (!(actor.system?.creatureAbilities ?? []).some(row => row.name === "Ancient Special")) return refuse("ability");
  if (busy.has(actor.uuid)) return refuse("busy");
  busy.add(actor.uuid);
  const held = actor.flags?.["azeroth-rpg"]?.[ANCIENT_SPECIAL_FLAG] ?? null;
  const before = JSON.stringify(held);
  const clock = () => game.combat?.started ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : null;
  const started = clock();
  const valid = () => gmHere() && resolve(actor.uuid) === actor && clock() === started
    && JSON.stringify(actor.flags?.["azeroth-rpg"]?.[ANCIENT_SPECIAL_FLAG] ?? null) === before
    && (actor.system?.creatureAbilities ?? []).some(row => row.name === "Ancient Special");
  try {
    const prior = ancientSpecialOf(held);
    if (prior && held.ownerUuid === actor.uuid) {
      ui.notifications?.info(`${actor.name}: ${prior.name} is its Ancient special.`);
      return { ok: true, existing: true, state: { ...held }, special: prior };
    }
    // A copied token may inherit a base actor's flag. Choosing explicitly here
    // gives the copy its own identity, never authorizes the foreign flag for use.
    const chooser = choose ?? (await import("../dice/workflows.mjs")).chooseOption;
    const answer = await chooser({ id: `${actor.id}-ancient-special`, name: "Ancient Special" }, [
      { key: "cancel", name: "Cancel", description: "Leave this creature unconfigured." },
      { key: "random", name: "Roll one special", description: "Choose one of the six specials at random and keep it for this creature." },
      ...ANCIENT_SPECIALS.map(row => ({ key: row.key, name: row.name, description: "Choose this creature's one Ancient special." }))
    ], null, { prompt: "GM: Choose once for this Ancient Core Hound. Using its abilities will not reroll or change this choice." });
    if (!answer || answer.key === "cancel") return refuse("cancelled");
    if (!valid()) return refuse("changed");
    const plan = chooseAncientSpecial({ ownerUuid: actor.uuid, key: answer.key,
      draw: answer.key === "random" ? random() : null });
    if (!plan.ok) return plan;
    await actor.update({ [`flags.azeroth-rpg.${ANCIENT_SPECIAL_FLAG}`]: plan.state });
    const saved = actor.flags?.["azeroth-rpg"]?.[ANCIENT_SPECIAL_FLAG];
    if (resolve(actor.uuid) !== actor || JSON.stringify(saved) !== JSON.stringify(plan.state)) return refuse("unverified");
    ui.notifications?.info(`${actor.name}: ${plan.special.name} chosen.`);
    return plan;
  } catch {
    ui.notifications?.warn("The Ancient special could not be confirmed. Check the saved choice before trying again.");
    return refuse("uncertain");
  } finally { busy.delete(actor.uuid); }
}
