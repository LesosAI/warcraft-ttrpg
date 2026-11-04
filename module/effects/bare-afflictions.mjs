/**
 * **ONE INTERCEPTION FOR A BARE POISONED OR DISEASED** (D12 R1; the lead: *"the poisoned and
 * diseased conditions should be tracked and able to be cured and automated with the clock."*).
 *
 * Every door that lays a status on an Actor ends in an Active Effect create or update, so the
 * document layer is where none can bypass it (`preCreateActiveEffect` and
 * `preUpdateActiveEffect`, the hooks the ice block already uses). The decisions are
 * `rules/bare-afflictions.mjs`; this file is the Foundry side:
 *
 *  + a bare POISONED from a code door is wrapped IN PLACE as a poison carrier named for its source,
 *    at its value and its shed DC, carried until cured and clocked like any carried poison;
 *  + a bare DISEASED names no disease, so the create is cancelled and the GM is asked to name one
 *    (a player is refused in words); a code door names its disease through `afflictDisease`;
 *  + a HAND action (the Core chip, a drop from the conditions pack) never reaches the hook: its
 *    sheet door calls `handLay`, which opens the Add picker, filtered to the kind.
 *
 * An effect that already carries the affliction flag is left alone, as is one a bespoke state
 * owns (`bareKind`), so `afflict` itself passes through.
 */

import { bareVenom, carrierEffectData, carrierRefresh, makePoison, AFFLICTION_FLAG } from "../rules/afflictions.mjs";
import { addsBareStatus, bareKind, raisedDose, UNTIMED, wrapPoison, wrappedStatuses } from "../rules/bare-afflictions.mjs";
import { afflictionsOf } from "./afflictions.mjs";

const NS = "azeroth-rpg";
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const abilitiesOf = actor => actor._source?.system?.abilities ?? actor.system?.abilities ?? {};

/** The labels a plain Poisoned effect may be named: the condition's, in the world's language. */
function conditionLabels() {
  const raw = [CONFIG.statusEffects?.poisoned?.name, game.i18n.localize("AZEROTH.Condition.Poisoned.Label"), "Poisoned"];
  return raw.map(s => (typeof s === "string" && s.startsWith("AZEROTH.") ? game.i18n.localize(s) : s)).filter(Boolean);
}

/** The name of whatever the effect's `origin` points at, or "". */
function originNameOf(effect) {
  const uuid = effect.origin ?? effect._source?.origin ?? null;
  if (!uuid) return "";
  try { return fromUuidSync(uuid)?.name ?? ""; } catch { return ""; }
}

/**
 * The carrier a bare Poisoned becomes, as a patch for the effect's source.
 * @returns {{aff: object, update: object}}
 */
export function wrapBarePoison(actor, effect) {
  const flags = effect.flags?.[NS] ?? {};
  const plan = wrapPoison({
    effectName: effect.name, conditionLabels: conditionLabels(), originName: originNameOf(effect),
    fallback: t("AZEROTH.Afflictions.Bare.PoisonName"), flags
  });
  const aff = makePoison({
    name: plan.name, dc: plan.dc, resilience: "body", carried: bareVenom(plan.value),
    source: effect.origin ? { uuid: effect.origin, name: "" } : null,
    now: game.time?.worldTime ?? 0, inFight: Boolean(actor.activeFight?.())
  });
  const data = carrierEffectData(aff, { abilities: abilitiesOf(actor), type: actor.type, origin: effect.origin ?? null });
  const mark = data.flags[NS];
  const update = {
    name: plan.name,
    statuses: wrappedStatuses([...(effect.statuses ?? [])], aff),
    ...UNTIMED,
    [`flags.${NS}.${AFFLICTION_FLAG}`]: mark[AFFLICTION_FLAG],
    [`flags.${NS}.harmful`]: true,
    [`flags.${NS}.poison`]: true,
    [`flags.${NS}.value`]: mark.value,
    ...(mark.shedDc ? { [`flags.${NS}.shedDc`]: mark.shedDc } : {})
  };
  return { aff, update };
}

/**
 * HAND ACTION: name the affliction through the Add picker, filtered to `kind`, and lay it.
 * A player is refused in words; cancelling the picker applies nothing.
 * @param {Actor} actor
 * @param {"poison"|"disease"} kind
 */
export async function handLay(actor, kind) {
  if (!actor) return null;
  if (!game.user?.isGM) {
    ui.notifications?.warn(t("AZEROTH.Afflictions.Bare.PlayerRefused", { name: actor.name }));
    return null;
  }
  // One picker for a creature: a second bare lay while one is open (an automation that lays
  // Diseased twice, a test) must not stack windows nobody will answer.
  if (foundry.applications.instances.has(`azeroth-choose-${actor.id}`)) return null;
  const workflows = game.system.azeroth.workflows;
  const pick = await workflows.chooseAffliction({
    actor, kind, prompt: kind === "disease" ? "AZEROTH.Afflictions.Bare.PickDisease" : "AZEROTH.Afflictions.Bare.PickPoison"
  });
  if (!pick) return null;
  return workflows.addAffliction({ actor, ...pick });
}

/** A second bare Poisoned from a source the creature already carries lays the held one's stacks again. */
async function relayHeld(row) {
  try { await row.effect.update(carrierRefresh(row.aff, { abilities: abilitiesOf(row.effect.parent), type: row.effect.parent.type })); }
  catch (err) { console.warn("azeroth-rpg | affliction relay", err); }
}

function onPreCreate(effect, data, options, userId) {
  const actor = effect.parent;
  if (actor?.documentName !== "Actor") return;
  if (userId && userId !== game.user?.id) return;
  const kind = bareKind(effect.statuses ?? [], effect.flags?.[NS] ?? {});
  if (!kind) return;
  if (kind === "disease") {
    // A Diseased names its disease (the lead: "Name one"): a GM is asked, a player refused.
    void handLay(actor, "disease");
    return false;
  }
  const { aff, update } = wrapBarePoison(actor, effect);
  const held = afflictionsOf(actor).find(r => r.aff.kind === "poison" && r.aff.key === aff.key);
  if (held) {
    void relayHeld(held);
    return false;
  }
  effect.updateSource(update);
}

function onPreUpdate(effect, changes, options, userId) {
  const actor = effect.parent;
  if (actor?.documentName !== "Actor") return;
  if (userId && userId !== game.user?.id) return;
  // A code door's raise of a carrier's Poisoned is its new dose, or the next beat lays the
  // old one back. The Core stepper's write is stacks only and says so (`azerothStacks`).
  const held = options?.azerothStacks ? null : effect.flags?.[NS]?.[AFFLICTION_FLAG];
  const dose = held ? raisedDose(held, foundry.utils.getProperty(changes, `flags.${NS}.value`)) : null;
  if (dose) foundry.utils.setProperty(changes, `flags.${NS}.${AFFLICTION_FLAG}.repeat.value`, dose);
  if (!Array.isArray(changes?.statuses) && !(changes?.statuses instanceof Set)) return;
  const next = [...changes.statuses];
  const kind = addsBareStatus([...(effect.statuses ?? [])], next);
  if (!kind || !bareKind(next, effect.flags?.[NS] ?? {})) return;
  if (kind === "disease") {
    changes.statuses = next.filter(s => s !== "diseased");
    void handLay(actor, "disease");
    return;
  }
  const { update } = wrapBarePoison(actor, effect);
  const { statuses, ...rest } = update;
  // `changes` is the expanded diff, so the dotted keys are expanded before they are merged in.
  foundry.utils.mergeObject(changes, foundry.utils.expandObject(rest), { performDeletions: false });
  changes.statuses = [...new Set([...next, ...statuses])];
}

export function registerBareAfflictionHooks() {
  Hooks.on("preCreateActiveEffect", onPreCreate);
  Hooks.on("preUpdateActiveEffect", onPreUpdate);
}
