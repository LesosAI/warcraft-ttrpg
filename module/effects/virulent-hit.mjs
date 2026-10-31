import { VIRULENT } from "../rules/virulent-poison.mjs";
import { layVirulentPoison, withdrawVirulentPoison } from "./virulent-poison.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
const queues = new Map();
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const targetAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor
  : !row?.sceneId && !row?.tokenId && row?.actorUuid ? resolve(row.actorUuid) : null;
const sourceAt = message => {
  const row = flagsOf(message).source;
  return row ? row.sceneId && row.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`)?.actor : null
    : ChatMessage.getSpeakerActor(message?.speaker);
};

/** Read the persisted attack outcome, not a player's claimed hit or weapon. */
export function virulentHitValid(message, index, source, target) {
  const flags = flagsOf(message), row = flags.strike?.row, damage = flags.damageByTarget?.[index];
  return gmHere() && resolve(message?.uuid) === message && source?.documentName === "Actor" && source.type === "npc"
    && resolve(source.uuid) === source && target?.documentName === "Actor" && resolve(target.uuid) === target
    && source !== target && sourceAt(message) === source && targetAt(flags.targets?.[index]) === target
    && source.testUserPermission(message.author, "OWNER")
    && flags.kind === "attack" && !flags.parry && !flags.notAttack && flags.strike?.rangeKind === "melee"
    && Number.isInteger(index) && index >= 0 && index < (flags.targets?.length ?? 0)
    && Number.isInteger(row?.index) && row.name === "Foreclaws" && source.system?.attacks?.[row.index]?.name === "Foreclaws"
    && source.system?.creatureAbilities?.some(a => a.name === VIRULENT.name)
    && message.rolls?.[0]?.outcome?.success === true && damage?.hit === true && damage.withdrawn !== true
    && Number.isFinite(damage.damage) && damage.damage >= 0 && target.system?.health?.value > 0
    && !projectionRefusal(target, "ability") && !realmRefusalFor(target, "ability");
}

/** Persist the claim before rolling resistance. It remains on the attack
 * after curing/removing the effect, so replay cannot create another dose.
 * The caller is responsible for invoking this only for a newly landed hit.
 */
export async function resolveVirulentHit(message, index) {
  const task = (queues.get(message?.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const source = sourceAt(message), target = targetAt(flagsOf(message).targets?.[index]);
    const valid = () => virulentHitValid(message, index, source, target);
    if (!valid()) return { ok: false, reason: "hit" };
    const claims = flagsOf(message).virulentClaims ?? [];
    if (!Array.isArray(claims)) return { ok: false, reason: "record" };
    if (claims.some(c => c.index === index || c.targetUuid === target.uuid)) return { ok: false, reason: "claimed" };
    let receipt = { index, sourceUuid: source.uuid, targetUuid: target.uuid, phase: "claimed" };
    const expected = () => flagsOf(message).virulentClaims?.find(c => c.index === index);
    const confirmed = () => JSON.stringify(expected()) === JSON.stringify(receipt);
    const save = async patch => {
      if (!gmHere() || resolve(message.uuid) !== message || !confirmed()) return false;
      receipt = { ...receipt, ...patch };
      await message.update({ "flags.azeroth-rpg.virulentClaims": flagsOf(message).virulentClaims.map(c => c.index === index ? receipt : c) });
      return confirmed();
    };
    try {
      await message.update({ "flags.azeroth-rpg.virulentClaims": [...claims, receipt] });
      if (!valid() || !confirmed()) return { ok: false, reason: "claimUnconfirmed" };
      if ((target.system?.conditionImmunities ?? []).includes("poisoned")) {
        return { ok: await save({ phase: "immune" }), immune: true };
      }
      const { rollResilience } = await import("../dice/workflows.mjs");
      const card = await rollResilience({ actor: target, resilience: "body", dc: VIRULENT.dc, subtitle: VIRULENT.name });
      const resisted = card?.rolls?.[0]?.outcome?.success;
      if (!valid() || !confirmed()) return { ok: false, reason: "changed" };
      if (typeof resisted !== "boolean") {
        await save({ phase: "unresolved", testId: card?.id ?? null });
        return { ok: false, reason: "unresolved" };
      }
      if (!await save({ phase: resisted ? "resisted" : "applying", testId: card.id, resisted })) return { ok: false, reason: "recordUnconfirmed" };
      if (resisted) return { ok: true, resisted: true };
      const landed = await layVirulentPoison({ source, target, hitId: `${message.uuid}:${target.uuid}`, valid: () => valid() && confirmed() });
      if (!landed.ok || !valid()) {
        await save({ phase: "uncertain", effectId: landed.effectId ?? null });
        return { ok: false, reason: "applicationUnconfirmed", effectId: landed.effectId ?? null };
      }
      const saved = await save({ phase: landed.immune ? "immune" : "applied", effectId: landed.effectId ?? null, value: landed.value ?? null });
      if (saved && valid() && confirmed() && !landed.immune && !landed.duplicate) {
        // The durable claim prevents a replay even if the card response is lost.
        const sourceRef = flagsOf(message).source;
        try {
          await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: source }),
            content: `<p><strong>Virulent Poison</strong></p><p>The failed Body Test applies the poison. Current stacks: ${landed.value}.</p>`,
            flags: { "azeroth-rpg": { kind: "ability",
              source: sourceRef ?? null,
              featureKey: "ability:virulent-poison",
              casting: false, success: true, targets: [flagsOf(message).targets[index]],
              attackUuid: message.uuid, effectId: landed.effectId } } });
        } catch (error) {
          console.warn("azeroth-rpg | Virulent Poison feedback interrupted", error);
          globalThis.ui?.notifications?.warn("Virulent Poison was applied, but its feedback card could not be confirmed. Do not apply another dose.");
        }
      }
      return { ...landed, ok: saved, recorded: saved };
    } catch (error) {
      console.warn("azeroth-rpg | Virulent Poison hit interrupted", error);
      globalThis.ui?.notifications?.warn("Virulent Poison could not be confirmed. Review its attack claim, resistance Test and effect before resolving it manually.");
      return { ok: false, reason: "writeUncertain" };
    }
  });
  queues.set(message?.uuid, task);
  try { return await task; }
  finally { if (queues.get(message?.uuid) === task) queues.delete(message?.uuid); }
}

/** Runs after pending resistance/application on this same card. Deleting the
 * card withdraws all its exposures; a Parry withdraws only the affected hit.
 */
export async function withdrawVirulentHits(message, { deleted = false } = {}) {
  const task = (queues.get(message?.uuid) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const results = [];
    const cardValid = () => gmHere() && (deleted ? resolve(message?.uuid) !== message : resolve(message?.uuid) === message);
    if (!cardValid()) return results;
    const claims = flagsOf(message).virulentClaims;
    if (!Array.isArray(claims)) return results;
    for (const receipt of claims) {
      if (receipt.phase === "withdrawn") continue;
      const gone = () => deleted || flagsOf(message).damageByTarget?.[receipt.index]?.withdrawn === true
        || message.rolls?.[0]?.outcome?.success !== true || !flagsOf(message).damageByTarget?.[receipt.index]?.hit;
      if (!gone()) continue;
      const target = resolve(receipt.targetUuid);
      const result = target ? await withdrawVirulentPoison({ target, hitId: `${message.uuid}:${receipt.targetUuid}`,
        valid: () => cardValid() && gone() }) : { ok: true, absent: true };
      results.push({ index: receipt.index, ...result });
      if (!result.ok || !cardValid() || !gone()) {
        globalThis.ui?.notifications?.warn("A withdrawn attack's Virulent Poison could not be reconciled. Review its remaining stacks and ticks.");
        continue;
      }
      if (!deleted) {
        await message.update({ "flags.azeroth-rpg.virulentClaims": flagsOf(message).virulentClaims.map(c =>
          c.index === receipt.index ? { ...c, phase: "withdrawn" } : c) });
      }
    }
    return results;
  });
  queues.set(message?.uuid, task);
  try { return await task; }
  finally { if (queues.get(message?.uuid) === task) queues.delete(message?.uuid); }
}

export function registerVirulentHitHooks() {
  Hooks.on("createChatMessage", async message => {
    if (!gmHere() || flagsOf(message).kind !== "attack") return;
    for (let index = 0; index < (flagsOf(message).targets?.length ?? 0); index++) {
      try {
        const result = await resolveVirulentHit(message, index);
        if (!result.ok && !["hit", "claimed"].includes(result.reason))
          globalThis.ui?.notifications?.warn("Virulent Poison requires review. Check the attack claim, resistance Test and effect before continuing.");
      } catch (error) { console.warn("azeroth-rpg | Virulent Poison attack hook", error); }
    }
  });
  const withdraw = async (message, options) => {
    try { await withdrawVirulentHits(message, options); }
    catch (error) {
      console.warn("azeroth-rpg | Virulent Poison withdrawal hook", error);
      globalThis.ui?.notifications?.warn("Virulent Poison withdrawal was interrupted. Review the affected stacks before continuing.");
    }
  };
  Hooks.on("updateChatMessage", (message, changed) => {
    if ("rolls" in changed || Object.keys(changed).some(k => k.startsWith("flags.azeroth-rpg.damageByTarget"))
      || changed.flags?.["azeroth-rpg"]?.damageByTarget !== undefined) return withdraw(message);
  });
  Hooks.on("deleteChatMessage", message => withdraw(message, { deleted: true }));
}
