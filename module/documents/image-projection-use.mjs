import { IMAGE_PROJECTION as SPEC, IMAGE_PROJECTION_FLAG, projectionRecord, projectionRefusal } from "../rules/image-projection.mjs";
import { sleepRefusal } from "../rules/dreadlord-sleep.mjs";
import { despairRefusal } from "../rules/ancient-despair.mjs";
import { realmRefusalFor } from "../effects/spirit-realm.mjs";
import { imageProjectionWrite, reconcileImageProjections, PROJECTION_RECEIPT_FLAG } from "../effects/image-projection-lifecycle.mjs";
import { summonedActor } from "./summon.mjs";
import { reviewImageProjectionPlacement } from "./image-projection-placement.mjs";
import { createProjectionTokens } from "./image-projection-creation.mjs";

export const IMAGE_PROJECTION_QUERY = "azeroth-rpg.imageProjection";
export const PROJECTION_CAST_FLAG = "projectionCast";
const SCOPE = "azeroth-rpg";
const busy = new Set();
const writer = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = (doc, key) => doc?.flags?.[SCOPE]?.[key];

export async function requestImageProjection(actor, index) {
  const { sourceOf } = await import("../applications/roll-dialog.mjs");
  try {
    const claim = flag(actor, PROJECTION_CAST_FLAG);
    const unresolved = claim && !["committed", "aborted"].includes(claim.state)
      && flag(actor, PROJECTION_RECEIPT_FLAG)?.cast !== claim.record?.cast;
    const data = { actorUuid: actor.uuid, index, source: sourceOf(actor), operation: "summon" };
    if (unresolved && game.user.isGM) {
      const { chooseOption } = await import("../dice/workflows.mjs");
      const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, [{ key: "recover", name: "Review interrupted projection",
        description: "Keep a committed summon or clean up an interrupted one. This does not charge again or refund uncertain costs." }], null);
      if (!choice) return null;
      data.operation = "recover";
    }
    const result = writer() ? await imageProjectionQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(IMAGE_PROJECTION_QUERY, data, { timeout: 180000 });
    if (!result?.ok) ui.notifications?.warn(game.i18n.localize("AZEROTH.ImageProjection.UseFailed"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Image Projection request", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.ImageProjection.UseFailed"));
    return null;
  }
}

export async function imageProjectionQueryHandler({ actorUuid, index, source, operation = "summon" } = {}, { user } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!writer() || !user?.id) return refuse("gm");
  const actor = await fromUuid(actorUuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.testUserPermission(user, "OWNER")) return refuse("owner");
  if (busy.has(actor.uuid)) return refuse("busy");
  if (!["summon", "recover"].includes(operation) || (operation === "recover" && !user.isGM)) return refuse("operation");
  busy.add(actor.uuid);
  try {
    if (operation === "recover") {
      await reconcileImageProjections();
      return await imageProjectionWrite(async () => {
        if (!writer() || fromUuidSync(actor.uuid) !== actor) return refuse("changed");
        const claim = flag(actor, PROJECTION_CAST_FLAG);
        if (!claim) return { ok: true, state: "none" };
        const phase = [...actor.effects].find(e => flag(e, IMAGE_PROJECTION_FLAG)?.record?.cast === claim.record?.cast);
        if (phase) return { ok: true, state: "active" };
        await actor.setFlag(SCOPE, PROJECTION_CAST_FLAG, { ...claim, state: "aborted" });
        return flag(actor, PROJECTION_CAST_FLAG)?.state === "aborted" ? { ok: true, state: "aborted" } : refuse("unconfirmed");
      });
    }
    const scene = game.scenes?.get(source?.sceneId), sourceToken = scene?.tokens.get(source?.tokenId);
    const combat = [...game.combats.values()].find(c => c.started && [...c.combatants.values()].some(row => row.tokenId === sourceToken?.id && row.sceneId === scene?.id));
    const combatant = combat && [...combat.combatants.values()].find(row => row.tokenId === sourceToken?.id && row.sceneId === scene?.id);
    if (!scene || !sourceToken || sourceToken.actor !== actor || !combatant || !Number.isInteger(index)) return refuse("combat");
    const clock = `${combat.round}:${combat.turn}`, mana = actor.system.power?.value;
    let consumed = false, record = null;
    const valid = () => {
      const row = actor.system.creatureAbilities?.[index];
      const phase = [...actor.effects].find(e => flag(e, IMAGE_PROJECTION_FLAG));
      return writer() && fromUuidSync(actor.uuid) === actor && actor.testUserPermission(user, "OWNER")
        && game.scenes.get(scene.id) === scene && scene.tokens.get(sourceToken.id) === sourceToken && sourceToken.actor === actor
        && game.combats.get(combat.id) === combat && combat.started && `${combat.round}:${combat.turn}` === clock
        && combat.combatants.get(combatant.id) === combatant && !combatant.defeated && Number.isFinite(combatant.initiative)
        && actor.system.health?.value > 0 && row?.name === SPEC.name && row.automation?.kind === "utility"
        && row.automation.action === SPEC.action && row.automation.cost?.pool === "power" && row.automation.cost.amount === SPEC.mana
        && row.automation.uses?.max === SPEC.uses && row.automation.uses.per === SPEC.per && row.automation.uses.value === (consumed ? 0 : 1)
        && Number.isFinite(mana) && mana >= SPEC.mana && actor.system.power.value === mana - (consumed ? SPEC.mana : 0)
        && (actor.system.power.name ?? "mana") === "mana" && !actor.statuses?.has("stunned") && !actor.statuses?.has("silenced")
        && !realmRefusalFor(actor, "ability") && !sleepRefusal(actor, "ability") && !despairRefusal(actor, "ability")
        && (!phase ? !projectionRefusal(actor, "ability") : consumed && flag(phase, IMAGE_PROJECTION_FLAG)?.record?.cast === record?.cast);
    };
    if (!valid()) return refuse("invalid");
    const prior = flag(actor, PROJECTION_CAST_FLAG);
    if (prior && !["committed", "aborted"].includes(prior.state) && flag(actor, PROJECTION_RECEIPT_FLAG)?.cast !== prior.record?.cast) return refuse("recover");
    const projection = await summonedActor("Spectral Projection");
    if (!valid()) return refuse("changed");
    const { chooseOption, spendTurnBudget } = await import("../dice/workflows.mjs");
    const selection = await reviewImageProjectionPlacement({ actor, scene, sourceToken, prototype: projection.prototypeToken.toObject(), chooseOption });
    if (!selection || !valid() || !selection.valid()) return refuse("cancelled");
    return await imageProjectionWrite(async () => {
      if (!valid() || !selection.valid()) return refuse("changed");
      record = projectionRecord({ cast: foundry.utils.randomID(), sourceUuid: actor.uuid, sourceTokenUuid: sourceToken.uuid,
        sceneId: scene.id, combatId: combat.id, combatantId: combatant.id, round: combat.round,
        tokens: Array.from({ length: SPEC.count }, () => `${scene.uuid}.Token.${foundry.utils.randomID()}`) });
      if (!record) return refuse("record");
      const claim = { state: "claimed", record };
      await actor.setFlag(SCOPE, PROJECTION_CAST_FLAG, claim);
      if (flag(actor, PROJECTION_CAST_FLAG)?.record?.cast !== record.cast || !valid() || !selection.valid()) return refuse("unconfirmed");
      if (!await spendTurnBudget(actor, SPEC.action)) {
        await actor.setFlag(SCOPE, PROJECTION_CAST_FLAG, { ...claim, state: "aborted" });
        return refuse("action");
      }
      if (!valid() || !selection.valid()) return refuse("changedAfterAction");
      const rows = foundry.utils.deepClone(actor.system.creatureAbilities);
      rows[index].automation.uses.value = 0;
      await actor.update({ "system.creatureAbilities": rows, "system.power.value": mana - SPEC.mana,
        [`flags.${SCOPE}.${PROJECTION_CAST_FLAG}`]: { ...claim, state: "paid" } });
      consumed = true;
      if (!valid() || !selection.valid() || flag(actor, PROJECTION_CAST_FLAG)?.state !== "paid") return refuse("unconfirmed");
      const made = await createProjectionTokens({ actor, sourceToken, scene, combat, record, projection,
        positions: selection.positions, valid });
      if (!made.ok) return made;
      await actor.setFlag(SCOPE, PROJECTION_CAST_FLAG, { ...claim, state: "committed" });
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p><strong>Image Projection</strong></p><p>Five projections appear. Until the start of its next turn, the Tutor is invisible, protected and unable to act. Each surviving projection then restores 4 Health before the copies disappear.</p>",
        flags: { [SCOPE]: { kind: "ability",
          source: source ?? null,
          featureKey: "ability:image-projection",
          casting: false, success: true,
          projectionCast: record.cast, targets: record.tokens.map(uuid => {
            const tokenId = uuid.split(".").at(-1), copy = scene.tokens.get(tokenId);
            return { sceneId: scene.id, tokenId, actorUuid: copy?.actor?.uuid ?? null, name: copy?.name ?? "Spectral Projection" };
          }) } } });
      return made;
    });
  } catch (error) {
    console.warn("azeroth-rpg | Image Projection use", error);
    return refuse("writeUncertain");
  } finally { busy.delete(actor.uuid); }
}
