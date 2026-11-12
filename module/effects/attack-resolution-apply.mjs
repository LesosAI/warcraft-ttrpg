import { resolveAttackOperation, reviewChainLightningHit } from "./attack-resolution-state.mjs";
import { prepareAttackTransfer, beginAttackTransfer } from "./attack-transfer.mjs";
import { deliverChosenSignature } from "./signature-delivery.mjs";
import { signatureRecipientKey } from "./chosen-signature-casting.mjs";
import { sparedFor, halvesFor } from "../rules/resisted.mjs";
import { signatureApplyRows } from "../rules/signature-apply.mjs";
import { queueSignatureCard } from "./signature-card-queue.mjs";
import { hasMirrorImage, interceptMirrorImage } from "./mirror-image-hit.mjs";
import { applyRefusalKey, rowStage } from "../rules/applied-rows.mjs";

// These two spells have their own payment/ending delivery coordinators.
// They must join signature delivery there, never bypass those transactions.
const signatureSpell = flags => flags?.kind === "spell" && flags.success === true
  && !["mana-burn", "conflagrate"].includes(flags.identifier)
  && typeof flags.cast === "string" && flags.cast.length > 0
  && flags.chosenSignatureDelivery?.version === 1 && flags.chosenSignatureDelivery.cast === flags.cast
  && Array.isArray(flags.chosenSignatureBonuses) && flags.chosenSignatureBonuses.length > 0
  && JSON.stringify(flags.chosenSignatureDelivery.entries?.map(entry => entry.bonus)) === JSON.stringify(flags.chosenSignatureBonuses);

export const ATTACK_APPLY_QUERY = "azeroth-rpg.resolveAttackDamage";
export const CHAIN_LIGHTNING_HIT_REVIEW_QUERY = "azeroth-rpg.chainLightningHitReview";
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

export function chainLightningHitReviewHandler({ messageUuid, index, expected, acknowledged } = {}, { user } = {}) {
  return reviewChainLightningHit({ message: resolve(messageUuid), index, expected, acknowledged, user });
}

export async function requestChainLightningHitReview(message, index, expected) {
  const gm = game.users?.activeGM;
  if (!gm || !game.user?.isGM) return { ok: false, reason: "permission" };
  const payload = { messageUuid: message.uuid, index, expected, acknowledged: true };
  try { return gm.id === game.user.id ? await chainLightningHitReviewHandler(payload, { user: game.user })
    : await gm.query(CHAIN_LIGHTNING_HIT_REVIEW_QUERY, payload, { timeout: 15000 }); }
  catch { return { ok: false, reason: "pending" }; }
}

export function attackApplyQueryHandler(payload = {}, context = {}) {
  const message = resolve(payload.messageUuid);
  return message?.flags?.["azeroth-rpg"]?.chosenSignatureDelivery
    ? queueSignatureCard(message, () => applyQuery(payload, context)) : applyQuery(payload, context);
}

async function applyQuery({ messageUuid, index, operation = "apply" } = {}, { user } = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id || !user?.id
    || !["apply", "reveal"].includes(operation) || !Number.isInteger(index) || index < 0) return { ok: false, reason: "unavailable" };
  const message = resolve(messageUuid);
  const flags = message?.flags?.["azeroth-rpg"];
  const chain = flags?.kind === "spell" && flags.identifier === "chain-lightning";
  const imageSpell = flags?.kind === "spell" && flags.mirrorImageDefense === true
    && !["mana-burn", "conflagrate"].includes(flags.identifier);
  const spellIdentifier = flags?.identifier;
  const signature = signatureSpell(flags);
  const target = flags?.targets?.[index];
  const actor = target?.sceneId && target?.tokenId
    ? resolve(`Scene.${target.sceneId}.Token.${target.tokenId}`)?.actor
    : !target?.sceneId && !target?.tokenId && target?.actorId ? game.actors.get(target.actorId) : null;
  const permitted = () => operation === "reveal" ? Boolean(user.isGM || message?.author?.id === user.id)
    : actor?.testUserPermission(user, "OWNER") === true;
  if (message?.documentName !== "ChatMessage" || (!chain && !signature && !imageSpell && flags?.kind !== "attack") || flags.parry || flags.notAttack
    || ((chain || signature || imageSpell) && (operation !== "apply" || flags.success !== true))
    || !actor || !permitted()) return { ok: false, reason: "permission" };
  if (chain && flags.attackResolution?.targets?.slice(0, index).some(row => row.stage !== "applied")) {
    return { ok: false, reason: "arcOrder" };
  }
  const damageRow = structuredClone(flags.damageByTarget?.[index]);
  const targetRow = structuredClone(target);
  const signaturePlan = signature ? JSON.stringify({cast:flags.cast, bonuses:flags.chosenSignatureBonuses}) : null;
  const recipient = signatureRecipientKey(target);
  const effective = signatureApplyRows(flags,index);
  if (!effective) return {ok:false,reason:"signatureChanged"};
  const chosen = signature && !effective.consumed && flags.targets.findIndex(row => signatureRecipientKey(row) === recipient) === index
    && flags.chosenSignatureBonuses.some(bonus => bonus.recipient === recipient);
  const spared = (signature || imageSpell) && sparedFor(flags, target);
  const resistance = JSON.stringify({spared:sparedFor(flags,target), half:halvesFor(flags,target), passed:flags.passedByTarget?.[index]});
  const valid = () => permitted()
    && (!effective.consumed || JSON.stringify(signatureApplyRows(message.flags?.["azeroth-rpg"],index)) === JSON.stringify(effective))
    && resolve(actor.uuid) === actor && resolve(messageUuid) === message
    && (!targetRow.sceneId || resolve(`Scene.${targetRow.sceneId}.Token.${targetRow.tokenId}`)?.actor === actor)
    && (!targetRow.actorId || actor.id === targetRow.actorId)
    && (signature ? signatureSpell(message.flags?.["azeroth-rpg"])
      && JSON.stringify({cast:message.flags["azeroth-rpg"].cast, bonuses:message.flags["azeroth-rpg"].chosenSignatureBonuses}) === signaturePlan
      && sparedFor(message.flags["azeroth-rpg"], targetRow) === spared
      : chain || imageSpell ? message.flags?.["azeroth-rpg"]?.kind === "spell"
      && message.flags?.["azeroth-rpg"]?.identifier === spellIdentifier
      && (!imageSpell || message.flags?.["azeroth-rpg"]?.mirrorImageDefense === true)
      && message.flags?.["azeroth-rpg"]?.success === true : message.flags?.["azeroth-rpg"]?.kind === "attack")
    && JSON.stringify(message.flags?.["azeroth-rpg"]?.targets?.[index]) === JSON.stringify(targetRow)
    && JSON.stringify(message.flags?.["azeroth-rpg"]?.damageByTarget?.[index]) === JSON.stringify(damageRow)
    && JSON.stringify({spared:sparedFor(message.flags?.["azeroth-rpg"],targetRow),
      half:halvesFor(message.flags?.["azeroth-rpg"],targetRow), passed:message.flags?.["azeroth-rpg"]?.passedByTarget?.[index]}) === resistance
    && damageRow?.withdrawn !== true && (chain || signature || imageSpell ? damageRow?.hit !== false : damageRow?.hit === true)
    && Number.isFinite(damageRow.damage) && damageRow.damage >= 0;
  return resolveAttackOperation({ message, index, targetUuid: actor.uuid, operation, validate: valid,
    prepare: operation === "apply" && !spared ? ({ valid: stillValid }) => hasMirrorImage(actor)
      ? {ok:true, mirrorImage:true}
      : prepareAttackTransfer({ target: actor, message, index,
        by: ChatMessage.getSpeakerActor(message.speaker) }, { valid: stillValid }) : null,
    execute: async ({ valid: stillValid, prepared }) => {
      if (operation === "reveal") return { ok: stillValid() };
      if (!spared && await interceptMirrorImage(actor, {valid:stillValid})) {
        return {ok:true, dealtDamage:false, mirrorImage:true};
      }
      // An image vanished while this hit was being claimed. No transfer was
      // selected, so do not silently deliver an unprepared ordinary hit.
      if (prepared?.mirrorImage) return {ok:false};
      const { applyRecordedAttackDamage } = await import("../dice/chat.mjs");
      if (!stillValid()) return { ok: false };
      const land = async ({valid = stillValid} = {}) => {
        if (!valid()) return {ok:false};
        if (spared) return {ok:true, dealtDamage:false};
        const transfer = await beginAttackTransfer(prepared, { valid });
        try { return await transfer.finish(await applyRecordedAttackDamage(message, index, transfer.token)); }
        finally { transfer.cancel(); }
      };
      return chosen ? deliverChosenSignature({message, cast:flags.cast, recipient,
        event:`initial:${index}`, validate:stillValid, execute:land}) : land();
    } });
}

export async function requestAttackApply(message, index, operation = "apply") {
  const notifyRefusal = result => {
    const flags = message.flags?.["azeroth-rpg"];
    const chain = flags?.kind === "spell" && flags.identifier === "chain-lightning";
    const key = chain ? ({ arcOrder: "ArcOrder", resolved: "Applied" }[result?.reason] ?? "ResolutionRefused") : null;
    if (key) return ui.notifications?.warn(game.i18n.localize(`AZEROTH.ChainLightning.${key}`));
    // **A PRESS ON A ROW ALREADY APPLIED SAYS SO** (D-888; the lead's play-test): it was
    // answered *not confirmed*, which reads as the damage never landing.
    const said = applyRefusalKey(result, rowStage(message.flags?.["azeroth-rpg"], index));
    ui.notifications?.warn(game.i18n.format(said, { name: flags?.targets?.[index]?.name ?? "" }));
  };
  try {
    const data = { messageUuid: message.uuid, index, operation };
    const result = game.user?.isGM && game.users?.activeGM?.id === game.user.id
      ? await attackApplyQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(ATTACK_APPLY_QUERY, data, { timeout: 120000 });
    if (!result?.ok) notifyRefusal(result);
    return result;
  } catch {
    notifyRefusal(null);
    return { ok: false, reason: "writeUncertain" };
  }
}
