/**
 * **A MOUNT MADE OVER A LONG REST, ON THE BOARD** (02 §7's Deathcharger, Charger's Blessing and
 * Ritual of the Steed; the Death Knight plan's Phase 4 door 9). `rules/mount-works.mjs` is the
 * law; this is the one door, reached from `useFeature` by the row's `onUse.mountWork`:
 *
 * 1. every refusal asked first, in words (a fight, the rest's one working spent, no mount);
 * 2. the mount and - for the Deathcharger - undead or spectral, through the one chooser (D-673),
 *    one row a mount and a choice, sorted by name;
 * 3. the writes in ONE update of the mounts: the new mount's traits and flag, the old one's
 *    taken back, and a card that says what changed.
 *
 * And 08 §5's Spectral dismiss and call (`spectralMove`), which the Gear tab's Stable and mount
 * place ask before they move a Spectral mount in a started fight.
 */

import { MOUNT_WORKED_FLAG, MOUNT_WORK_FLAG, mountWorkOf, mountWorkRefusal, mountWorkWrites, spectralMoveCost } from "../rules/mount-works.mjs";
import { isMount } from "../rules/slots.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);

/** The mounts an actor owns, as the law reads them, sorted by name then id. */
function mountsOf(actor) {
  return [...(actor?.items ?? [])].filter(i => i.type === "gear" && isMount(i))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(i => ({ id: i.id, name: i.name, traits: [...(i.system?.traits ?? [])], work: i.getFlag(SCOPE, MOUNT_WORK_FLAG) ?? null }));
}

/**
 * **THE USE** (`onUse.mountWork`): refused in words, or the chooser, then the writes and a card.
 *
 * @param {Actor} actor
 * @param {Item} item  the feature
 * @returns {Promise<ChatMessage|null>}
 */
export async function useMountWork(actor, item) {
  if (!actor?.isOwner) return null;
  const work = mountWorkOf(item?.name);
  if (!work) return null;
  const mounts = mountsOf(actor);
  const gen = actor.getFlag?.(SCOPE, "restGeneration") ?? 0;
  const worked = () => actor.getFlag?.(SCOPE, MOUNT_WORKED_FLAG) ?? [];
  const refusal = mountWorkRefusal({ inFight: Boolean(actor.activeFight?.()?.started), worked: worked(), mounts, feature: item.name });
  if (refusal) {
    ui.notifications?.warn(t(`AZEROTH.MountWork.Refuse.${refusal}`, { name: actor.name, feature: item.name }));
    return null;
  }
  const options = [];
  for (const m of mounts) {
    for (const [key, row] of Object.entries(work.options)) {
      options.push({
        key: `${m.id}:${key}`, description: "",
        name: t("AZEROTH.MountWork.Choice", { mount: m.name, option: game.i18n.localize(row.label), traits: row.traits.join(", ") })
      });
    }
  }
  const { chooseOption } = game.system.azeroth.workflows;
  const pick = await chooseOption(item, options, null, { prompt: t("AZEROTH.MountWork.Prompt", { feature: item.name }) });
  if (!pick) return null;
  const [mountId, option] = String(pick.key).split(":");
  // Asked again: the chooser stood open while the world moved.
  const now = mountsOf(actor);
  const again = mountWorkRefusal({ inFight: Boolean(actor.activeFight?.()?.started), worked: worked(), mounts: now, feature: item.name });
  if (again || !now.some(m => m.id === mountId)) {
    ui.notifications?.warn(t(`AZEROTH.MountWork.Refuse.${again ?? "noMount"}`, { name: actor.name, feature: item.name }));
    return null;
  }
  const writes = mountWorkWrites({ mounts: now, mountId, option, feature: item.name, gen });
  if (!writes.length) return null;
  // **ONE WRITE** (the F3 review): the mounts' traits and flags and the Long Rest's one working,
  // spent, in one update of the actor, so a working is never half made (the rest clears the
  // working: `effects/death-knight-necromancy.mjs#endAtLongRest`). The rune door writes its
  // weapons the same way (`documents/runes.mjs`).
  await actor.update({
    items: writes.map(w => ({
      _id: w._id, "system.traits": w["system.traits"],
      [`flags.${SCOPE}.${MOUNT_WORK_FLAG}`]: w.flag
    })),
    [`flags.${SCOPE}.${MOUNT_WORKED_FLAG}`]: [...new Set([...worked(), item.name])].sort()
  });
  const made = now.find(m => m.id === mountId);
  const lost = writes.filter(w => w._id !== mountId).map(w => now.find(m => m.id === w._id)?.name).filter(Boolean);
  const row = work.options[option];
  const lines = [t("AZEROTH.MountWork.Done", { name: actor.name, mount: made?.name ?? "", option: game.i18n.localize(row.label), traits: row.traits.join(", ") })];
  for (const name of lost) lines.push(t("AZEROTH.MountWork.Lost", { mount: name, feature: item.name }));
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="azeroth azeroth-card"><p>${lines.join("</p><p>")}</p></div>`,
    flags: { [SCOPE]: { kind: "mountWork", feature: item.name, mountId, option } }
  });
}

/**
 * **08 §5's SPECTRAL DISMISS AND CALL**: moving a Spectral mount between the Stable and the mount
 * place in a started fight spends a Half-Action of the rider's turn, judged and spent before the
 * mount moves; out of a fight, or any other mount, nothing is spent. Resolves whether the move
 * may go ahead.
 *
 * @param {Actor} actor
 * @param {Item} mount
 * @returns {Promise<boolean>}
 */
export async function spectralMove(actor, mount) {
  const cost = spectralMoveCost({ traits: mount?.system?.traits ?? [], inFight: Boolean(actor?.activeFight?.()?.started) });
  if (!cost) return true;
  return game.system.azeroth.workflows.spendTurnBudget(actor, cost);
}
