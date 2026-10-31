/** Actor-carried Sustains follow their caster across scenes, on the active GM. */
import { sustainTransferPending } from "../rules/sustain-transfer-suspension.mjs";
const SCOPE = "azeroth-rpg";
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;

export function sustainedSpellLive(effect) {
  const flags = effect?.flags?.[SCOPE];
  if (flags?.sustained !== true) return true;
  if (sustainTransferPending(effect)) return false;
  if (!flags.cast || !effect.origin) return false;
  if (flags.identifier === "mind-flay" && String(effect.parent?.system?.typeMarker ?? "").trim().toLowerCase() === "mindless") return false;
  let caster;
  try { caster = fromUuidSync(effect.origin); } catch { return false; }
  if (!caster || !(caster.system?.health?.value > 0)) return false;
  return (caster.getFlag(SCOPE, "sustaining") ?? []).some(entry => entry?.cast === flags.cast);
}

let pending = Promise.resolve();
export function reconcileSustainedSpells() {
  const run = async () => {
    if (!writer()) return 0;
    const actors = new Map();
    for (const actor of values(game.actors)) actors.set(actor.uuid, actor);
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
      if (token.actor) actors.set(token.actor.uuid, token.actor);
    }
    let removed = 0;
    for (const actor of actors.values()) for (const effect of values(actor.effects)) {
      if (!writer()) return removed;
      if (fromUuidSync(actor.uuid) !== actor || !values(actor.effects).includes(effect)) continue;
      // Inert transfer carriers are recovery evidence, not orphan spells. The
      // same marker stops tick consumers through sustainedSpellLive above.
      if (sustainTransferPending(effect)) continue;
      if (effect.flags?.[SCOPE]?.sustained !== true || sustainedSpellLive(effect)) continue;
      await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      removed++;
    }
    return removed;
  };
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
}

export function registerSustainedSpellHooks() {
  const sweep = () => {
    if (writer()) void reconcileSustainedSpells().catch(error => {
      console.warn("azeroth-rpg | Sustained spell cleanup", error);
      ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.SustainCleanupFailed"));
    });
  };
  for (const hook of ["updateActor", "deleteActor", "deleteToken", "createActiveEffect", "updateUser"]) Hooks.on(hook, sweep);
  Hooks.once("ready", sweep);
}
