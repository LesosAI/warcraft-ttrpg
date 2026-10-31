import { walkingBombArea } from "./walking-bomb-targets.mjs";
import { detonateWalkingBomb } from "./walking-bomb-detonation.mjs";
import { deliverWalkingBombDamage } from "./walking-bomb-damage.mjs";
import { destroyWalkingBomb } from "./walking-bomb-destroy.mjs";
import { postWalkingBombResult } from "./walking-bomb-feedback.mjs";
import { WALKING_BOMB_FLAG } from "./walking-bomb.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";

export const WALKING_BOMB_QUERY = "azeroth-rpg.walkingBombHit";
const pending = new Set();
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const flagsOf = message => message?.flags?.["azeroth-rpg"] ?? {};
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const trait = actor => actor?.type === "npc" && actor.system?.creatureAbilities?.some(row =>
  row.name === "Contact Detonation" && row.automation?.kind === "passive");
const tokenAt = ref => ref?.sceneId && ref?.tokenId ? resolve(`Scene.${ref.sceneId}.Token.${ref.tokenId}`) : null;

export async function walkingBombQueryHandler({ messageUuid, index } = {}, { user } = {}) {
  if (!gmHere() || !user?.id || !Number.isInteger(index) || index < 0) return { ok: false, reason: "request" };
  const message = resolve(messageUuid), flags = flagsOf(message);
  const origin = tokenAt(flags.source), victimToken = tokenAt(flags.targets?.[index]);
  const bomb = origin?.actor, victim = victimToken?.actor;
  if (!trait(bomb)) return { ok: false, reason: "absent" };
  if (!victim?.testUserPermission(user, "OWNER")) return { ok: false, reason: "permission" };
  if (origin.getFlag("azeroth-rpg", WALKING_BOMB_FLAG) != null) return { ok: false, reason: "claimed" };
  if (pending.has(origin.uuid)) return { ok: false, reason: "busy" };
  const validHit = () => {
    const current = flagsOf(message), row = current.damageByTarget?.[index];
    return gmHere() && resolve(messageUuid) === message && message?.documentName === "ChatMessage"
      && tokenAt(current.source) === origin && origin.actor === bomb && trait(bomb)
      && tokenAt(current.targets?.[index]) === victimToken && victimToken.actor === victim
      && (!current.source?.actorUuid || current.source.actorUuid === bomb.uuid)
      && (!current.targets?.[index]?.actorUuid || current.targets[index].actorUuid === victim.uuid)
      && bomb !== victim && bomb.testUserPermission(message.author, "OWNER")
      && victim.testUserPermission(user, "OWNER")
      && current.kind === "attack" && current.strike?.rangeKind === "melee"
      && !current.parry && !current.notAttack && !current.retaliation
      && message.rolls?.[0]?.outcome?.success === true && row?.hit === true
      && row.withdrawn !== true && Number.isFinite(row.damage) && row.damage >= 0
      && !projectionRefusal(bomb, "ability") && !realmRefusalFor(bomb, "ability");
  };
  if (!validHit()) return { ok: false, reason: "hit" };
  pending.add(origin.uuid);
  try {
    const area = walkingBombArea({ bomb, source: flags.source });
    if (!area || area.origin !== origin) return { ok: false, reason: "area" };
    const valid = () => validHit() && area.valid();
    const { chooseOption } = await import("../dice/workflows.mjs");
    const targets = [], reviewed = new Set();
    for (const row of area.targets) {
      if (reviewed.has(row.actorUuid)) continue;
      reviewed.add(row.actorUuid);
      if (!valid()) return { ok: false, reason: "changed" };
      const answer = await chooseOption({ id: bomb.id, name: game.i18n.localize("AZEROTH.WalkingBomb.Name") }, [
        { key: "exposed", name: game.i18n.localize("AZEROTH.WalkingBomb.Exposed"), description: game.i18n.localize("AZEROTH.WalkingBomb.ExposedHint") },
        { key: "blocked", name: game.i18n.localize("AZEROTH.WalkingBomb.Blocked"), description: game.i18n.localize("AZEROTH.WalkingBomb.BlockedHint") }
      ], null, { prompt: game.i18n.format("AZEROTH.WalkingBomb.CoverPrompt", { name: row.token.name ?? row.actor.name }) });
      if (!answer || !["exposed", "blocked"].includes(answer.key)) return { ok: false, reason: "cancelled" };
      if (!valid()) return { ok: false, reason: "changed" };
      if (answer.key === "exposed") targets.push({ tokenUuid: row.tokenUuid, actorUuid: row.actorUuid });
    }
    const result = await detonateWalkingBomb({ token: origin, targets, validate: valid,
      attack: { id: message.uuid, sourceUuid: bomb.uuid, targetUuid: victim.uuid,
        kind: "attack", rangeKind: "melee", hit: true },
      deliver: (row, current) => {
        const token = resolve(row.tokenUuid);
        const targetValid = () => current() && token?.actor?.uuid === row.actorUuid && resolve(row.tokenUuid) === token;
        return deliverWalkingBombDamage({ bomb, targetToken: token, valid: targetValid, messageId: message.id });
      },
      destroy: current => destroyWalkingBomb({ token: origin, valid: current }) });
    if (result.ok) await postWalkingBombResult({ message, bomb, origin, targets: area.targets, receipt: result.receipt });
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Walking Bomb query", error);
    return { ok: false, reason: "interrupted" };
  } finally { pending.delete(origin.uuid); }
}

export async function requestWalkingBombHit(message, index) {
  const flags = flagsOf(message);
  if (flags.kind !== "attack" || flags.strike?.rangeKind !== "melee" || !trait(tokenAt(flags.source)?.actor)) return null;
  try {
    const data = { messageUuid: message.uuid, index };
    const result = gmHere() ? await walkingBombQueryHandler(data, { user: game.user })
      : await game.users?.activeGM?.query(WALKING_BOMB_QUERY, data, { timeout: 60000 });
    if (!result?.ok && !["absent", "claimed", "busy", "hit"].includes(result?.reason))
      ui.notifications?.warn(game.i18n.localize("AZEROTH.WalkingBomb.Interrupted"));
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | Walking Bomb request", error);
    ui.notifications?.warn(game.i18n.localize("AZEROTH.WalkingBomb.Interrupted"));
    return null;
  }
}
