/** GM configuration from an NPC's Pack Rekindling Use button. */
import { CORE_HOUND_PACK_FLAG, seedCoreHoundPack } from "../rules/core-hound-pack.mjs";
import { coreHoundPackAdapter } from "./core-hound-pack-foundry.mjs";

const busy = new Set();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export async function configureCoreHoundPack(actor, { choose } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere()) return refuse("gm");
  const combat = game.combat, scene = canvas.scene;
  const tokens = (canvas.tokens?.controlled ?? []).map(token => token.document);
  if (!combat?.started || combat.scene !== scene || tokens.length < 2
    || !tokens.some(token => token.actor === actor)) {
    ui.notifications?.warn("Start combat, then select this hound and at least one packmate before using Pack Rekindling.");
    return refuse("selection");
  }
  if (busy.has(combat.uuid)) return refuse("busy");
  busy.add(combat.uuid);
  const round = combat.round, turn = combat.turn;
  const identities = tokens.map(token => ({ token, actor: token.actor }));
  const packIds = () => combat.flags?.["azeroth-rpg"]?.[CORE_HOUND_PACK_FLAG] ?? {};
  const previous = JSON.stringify(packIds());
  const validate = () => {
    if (!gmHere() || game.combat !== combat || !combat.started || combat.scene !== scene
      || canvas.scene !== scene || combat.round !== round || combat.turn !== turn
      || JSON.stringify(packIds()) !== previous) return false;
    const actors = new Set();
    for (const entry of identities) {
      const { token, actor: member } = entry;
      if (token?.actor !== member || scene.tokens.get(token.id) !== token || token.parent !== scene
        || token.actorLink !== false || member?.type !== "npc" || actors.has(member)
        || !(member.system?.health?.value > 0)
        || !(member.system?.creatureAbilities ?? []).some(row => row.name === "Pack Rekindling")
        || !(combat.combatants?.contents ?? []).some(row => row.tokenId === token.id && row.sceneId === scene.id)) return false;
      actors.add(member);
    }
    return true;
  };
  try {
    if (!validate()) {
      ui.notifications?.warn("Every selected pack member must be a living, unlinked Core Hound token in this combat.");
      return refuse("members");
    }
    const tokenUuids = tokens.map(token => token.uuid).sort();
    const overlapping = Object.entries(packIds()).filter(([, state]) =>
      state?.tokenUuids?.some(uuid => tokenUuids.includes(uuid)));
    // Exact membership may be deliberately reset, but partial overlaps would
    // silently merge or split packs and are refused.
    if (overlapping.length > 1 || (overlapping.length === 1
      && JSON.stringify([...overlapping[0][1].tokenUuids].sort()) !== JSON.stringify(tokenUuids))) {
      ui.notifications?.warn("These hounds already belong to different pack memberships. Select the complete existing pack or use a new combat.");
      return refuse("overlap");
    }
    const id = overlapping[0]?.[0] ?? foundry.utils.randomID();
    const seed = seedCoreHoundPack({ sceneUuid: scene.uuid, combatUuid: combat.uuid, tokenUuids, round });
    if (!seed) return refuse("state");
    const chooser = choose ?? (await import("../dice/workflows.mjs")).chooseOption;
    const answer = await chooser({ id: `${actor.id}-core-pack`, name: "Pack Rekindling" }, [
      { key: "cancel", name: "Cancel", description: "Leave pack membership unchanged." },
      { key: "configure", name: overlapping.length ? "Reset this pack" : "Create this pack",
        description: tokens.map(token => token.name ?? token.actor.name).join(", ") }
    ], null, { prompt: "GM: Confirm these packmates. A fallen hound revives at the end of the following round if a packmate survives. Defeat the entire pack to stop revival. Configuration spends no actions." });
    if (answer?.key !== "configure") return refuse("cancelled");
    if (!validate()) return refuse("changed");
    await combat.update({ [`flags.azeroth-rpg.${CORE_HOUND_PACK_FLAG}.${id}`]: seed });
    const checked = coreHoundPackAdapter(combat, id)?.read();
    if (!checked || JSON.stringify(checked.state) !== JSON.stringify(seed)) return refuse("unverified");
    ui.notifications?.info(`Pack configured with ${tokens.length} Core Hounds.`);
    return { ok: true, packId: id };
  } catch {
    ui.notifications?.warn("Pack configuration could not be confirmed. Check the combat's pack state before trying again.");
    return refuse("uncertain");
  } finally {
    busy.delete(combat.uuid);
  }
}
