import { CARRION_SCARAB as SPEC, validScarabClaim, recoverScarab, scarabCleanup } from "../rules/carrion-scarab.mjs";
import { scarabClaims, scarabTokens, scarabSnapshot, scarabWriter, scarabWrite } from "./carrion-scarab-creation.mjs";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sourceOf = claim => game.scenes.get(claim.sceneId)?.tokens.get(claim.sourceTokenId);

/** Idempotent combat membership. Summons get ordinary turns, never immediate
 * bonus attacks. A summon created outside combat can join when its source does.
 */
export async function joinScarabCombat(token, claim) {
  if (!scarabWriter() || !validScarabClaim(claim) || token?.uuid !== claim.tokenUuid) return false;
  const fights = [...(game.combats ?? [])].filter(c => c.started && [...c.combatants].some(cb =>
    cb.tokenId === claim.sourceTokenId && (cb.sceneId ?? c.scene?.id) === claim.sceneId));
  if (!fights.length) return true;
  if (fights.length !== 1) return false;
  const fight = fights[0];
  const held = () => [...fight.combatants].some(cb => cb.tokenId === token.id && (cb.sceneId ?? fight.scene?.id) === claim.sceneId);
  if (held()) return true;
  const source = [...fight.combatants].find(cb => cb.tokenId === claim.sourceTokenId && (cb.sceneId ?? fight.scene?.id) === claim.sceneId);
  await fight.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: claim.sceneId, actorId: token.actorId,
    ...(Number.isFinite(source.initiative) ? { initiative: source.initiative - 0.01 } : {}) }]);
  return held();
}

/** Never calls a payment or placement function. clearMissingCast is an explicit
 * GM repair after reviewing payment; automatic sweeps leave uncertain claims.
 */
export function reconcileCarrionScarabs(owner, { clearMissingCast = null } = {}) {
  return scarabWrite(owner?.uuid, async () => {
    const results = [];
    if (!scarabWriter() || !owner?.uuid || fromUuidSync(owner.uuid) !== owner || !Number.isFinite(game.time?.worldTime))
      return { ok: false, reason: "authority", results };
    let expected = structuredClone(scarabClaims(owner));
    if (!Array.isArray(expected) || expected.some(c => !validScarabClaim(c) || c.ownerUuid !== owner.uuid))
      return { ok: false, reason: "record", results };
    if (new Set(expected.map(c => c.cast)).size !== expected.length || new Set(expected.map(c => c.tokenUuid)).size !== expected.length)
      return { ok: false, reason: "conflict", results };
    const current = () => scarabWriter() && fromUuidSync(owner.uuid) === owner && same(scarabClaims(owner), expected);
    const write = async next => {
      if (!current()) return false;
      await owner.setFlag("azeroth-rpg", SPEC.flag, next);
      expected = next;
      return current();
    };
    try {
      for (let claim of [...expected]) {
        if (!current()) return { ok: false, reason: "changed", results };
        if (claim.phase !== "active") {
          const recovered = recoverScarab({ claim, tokens: scarabTokens().map(scarabSnapshot), inventoryComplete: true,
            clearMissing: clearMissingCast === claim.cast });
          if (!recovered.ok) { results.push({ cast: claim.cast, ...recovered }); continue; }
          if (!recovered.claim) {
            if (!await write(expected.filter(c => c.cast !== claim.cast))) return { ok: false, reason: "writeUnconfirmed", results };
            results.push({ cast: claim.cast, action: "clear", ok: true }); continue;
          }
          if (!await write(expected.map(c => c.cast === claim.cast ? recovered.claim : c))) return { ok: false, reason: "writeUnconfirmed", results };
          claim = recovered.claim;
        }
        const source = sourceOf(claim);
        const alive = owner.system?.health?.value > 0 && source?.actor === owner;
        const cleanup = scarabCleanup({ claim, tokens: scarabTokens().map(scarabSnapshot), now: game.time.worldTime,
          ownerAlive: alive, inventoryComplete: true });
        if (!cleanup.ok) { results.push({ cast: claim.cast, ...cleanup }); continue; }
        const token = scarabTokens().find(t => t.uuid === claim.tokenUuid);
        if (cleanup.action === "retain") {
          if (!await joinScarabCombat(token, claim)) return { ok: false, reason: "combatUnconfirmed", results };
        } else {
          if (cleanup.action === "delete") {
            if (!current()) return { ok: false, reason: "changed", results };
            await token.delete();
            if (scarabTokens().some(t => t.uuid === token.uuid)) return { ok: false, reason: "deleteUnconfirmed", results };
          }
          if (!await write(expected.filter(c => c.cast !== claim.cast))) return { ok: false, reason: "writeUnconfirmed", results };
        }
        results.push({ cast: claim.cast, ...cleanup });
      }
      return { ok: results.every(r => r.ok), results };
    } catch (error) {
      console.warn("azeroth-rpg | Carrion Scarab recovery", error);
      return { ok: false, reason: "writeUncertain", results };
    }
  });
}

/** World and synthetic owners, across every scene, not just the viewed scene. */
export async function sweepCarrionScarabs() {
  if (!scarabWriter() || !Number.isFinite(game.time?.worldTime)) return [];
  const all = scarabTokens();
  const owners = new Map([...game.actors, ...all.map(t => t.actor)].filter(a => a?.uuid && scarabClaims(a)?.length)
    .map(a => [a.uuid, a]));
  const results = [];
  for (const owner of owners.values()) results.push({ ownerUuid: owner.uuid, ...await reconcileCarrionScarabs(owner) });
  for (const token of scarabTokens()) {
    const mark = token.getFlag("azeroth-rpg", SPEC.tokenFlag);
    if (!mark?.ownerUuid || !mark.cast || !Number.isFinite(mark.expiresAt)) continue;
    await scarabWrite(mark.ownerUuid, async () => {
      if (!scarabWriter() || !scarabTokens().includes(token)) return;
      const owner = fromUuidSync(mark.ownerUuid);
      const records = scarabClaims(owner);
      // Known receipts are reconciled above. Leave uncertain creation records
      // intact for explicit repair, but never keep their tokens past expiry.
      const expired = game.time.worldTime >= mark.expiresAt;
      const dead = !owner || !(owner.system?.health?.value > 0);
      const destroyed = Number.isFinite(token.actor?.system?.health?.value) && token.actor.system.health.value <= 0;
      if (!expired && !dead && !destroyed) return;
      if (Array.isArray(records) && records.some(c => c.phase === "active" && c.tokenUuid === token.uuid)) return;
      try {
        await token.delete();
        results.push({ tokenUuid: token.uuid, ok: !scarabTokens().includes(token), action: "orphanCleanup" });
      } catch (error) { console.warn("azeroth-rpg | Orphaned Carrion Scarab cleanup", error); }
    });
  }
  return results;
}

export function registerCarrionScarabHooks() {
  let pending = false;
  const run = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(async () => {
      pending = false;
      try { await sweepCarrionScarabs(); }
      catch (error) { console.warn("azeroth-rpg | Carrion Scarab lifecycle", error); }
    });
  };
  for (const hook of ["ready", "updateWorldTime", "updateActor", "deleteActor", "updateToken", "deleteToken", "deleteScene",
    "createCombatant", "updateCombat", "deleteCombat", "updateUser"]) Hooks.on(hook, run);
}
