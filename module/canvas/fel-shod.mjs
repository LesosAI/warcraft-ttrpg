import { FEL_SHOD_GROUND, felShodExpiry, felShodExpired, felShodMarker } from "../rules/fel-shod.mjs";
import { projectionRefusal } from "../rules/image-projection.mjs";
import { realmRefusalFor } from "../effects/spirit-realm.mjs";

const scope = "azeroth-rpg";
let queue = Promise.resolve();
const flags = document => document?.flags?.[scope] ?? {};
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const tokenAt = row => row?.sceneId && row?.tokenId ? resolve(`Scene.${row.sceneId}.Token.${row.tokenId}`) : null;
const enqueue = fn => { const task = queue.catch(() => {}).then(fn); queue = task; return task; };

function originalHit(message, targetTokenUuid) {
  const f = flags(message), source = tokenAt(f.source), actor = source?.actor;
  if (resolve(message?.uuid) !== message || !message?.author?.id || !actor || actor.type !== "npc"
    || !actor.testUserPermission(message.author, "OWNER") || f.kind !== "attack"
    || f.parry || f.notAttack || f.retaliation || f.strike?.rangeKind !== "melee"
    || message.rolls?.[0]?.outcome?.success !== true || !Array.isArray(f.targets)
    || projectionRefusal(actor, "ability") || realmRefusalFor(actor, "ability")) return null;
  const attack = actor.system?.attacks?.[f.strike?.row?.index];
  if (!attack || attack.name !== f.strike.row.name || !attack.traits?.includes("Fel-shod")
    || !actor.system?.creatureAbilities?.some(a => a.name === "Fel-shod")) return null;
  const index = f.targets.findIndex(row => tokenAt(row)?.uuid === targetTokenUuid), hit = f.damageByTarget?.[index];
  const target = tokenAt(f.targets[index]);
  if (!target?.actor || target.actor.id !== f.targets[index]?.actorId || !hit?.hit || hit.withdrawn === true
    || source.parent !== target.parent || source._source?.level !== target._source?.level) return null;
  return { source, target, actor, scene: source.parent };
}

function clockFor(source) {
  const matches = [...(game.combats ?? [])].filter(c => c.started)
    .flatMap(combat => [...combat.combatants].filter(c => c.token?.uuid === source.uuid).map(c => ({ combat, c })));
  if (matches.length > 1) return null;
  const found = matches[0];
  return felShodExpiry({ time: game.time?.worldTime, combat: found ? {
    id: found.combat.id, combatantId: found.c.id, round: found.combat.round, turn: found.combat.turn,
    sourceTurn: found.combat.turns.findIndex(c => c.id === found.c.id)
  } : null });
}

function expired(marker) {
  const combat = marker.expiry?.combatId ? game.combats.get(marker.expiry.combatId) : null;
  return felShodExpired(marker.expiry, { time: game.time?.worldTime, combat: combat ? {
    id: combat.id, started: combat.started, round: combat.round, turn: combat.turn,
    sourceTurn: combat.turns.findIndex(c => c.id === marker.expiry.combatantId)
  } : null });
}

// After placement the ground stays put even when either creature moves away.
// Only withdrawing the recorded hit (or deleting its card) retracts the mark.
function recordedHit(marker) {
  const message = resolve(marker.messageUuid), f = flags(message);
  const ref = row => row?.sceneId && row?.tokenId ? `Scene.${row.sceneId}.Token.${row.tokenId}` : null;
  if (!message || f.kind !== "attack" || f.parry || f.notAttack || f.retaliation
    || message.rolls?.[0]?.outcome?.success !== true || ref(f.source) !== marker.sourceTokenUuid
    || !Array.isArray(f.targets)) return false;
  const index = f.targets.findIndex(row => ref(row) === marker.targetTokenUuid);
  return f.damageByTarget?.[index]?.hit === true && f.damageByTarget[index].withdrawn !== true;
}

/** Called only for a newly created attack card. A later chat update may clean
 * up a withdrawn hit, but never creates a fresh marker from an old attack. */
export function placeFelShodGround(message) {
  // Capture positions before the queued writes, while the hit is announced.
  if (!gmHere() || flags(message).kind !== "attack") return Promise.resolve({ ok: true, count: 0 });
  if (!Array.isArray(flags(message).targets)) return Promise.resolve({ ok: false, reason: "targets" });
  const captures = [];
  for (const row of flags(message).targets ?? []) {
    const target = tokenAt(row), hit = originalHit(message, target?.uuid);
    if (!hit) continue;
    const { scene, source } = hit, levelId = target._source?.level;
    if (!scene.levels?.has(levelId)) return Promise.resolve({ ok: false, reason: "level" });
    const gridSize = scene.grid?.size;
    const marker = felShodMarker({ messageUuid: message.uuid, sourceTokenUuid: source.uuid,
      targetTokenUuid: target.uuid, sceneId: scene.id, levelId,
      x: target.x + target.width * gridSize / 2, y: target.y + target.height * gridSize / 2,
      elevation: target.elevation, gridSize, expiry: clockFor(source) });
    if (!marker) return Promise.resolve({ ok: false, reason: "geometry" });
    captures.push({ marker, scene, hidden: Boolean(source.hidden || target.hidden || message.blind || message.whisper?.length) });
  }
  return enqueue(async () => {
    if (!gmHere()) return { ok: false, reason: "gm" };
    let count = 0;
    try {
      for (const { marker, scene, hidden } of captures) {
        if (!originalHit(message, marker.targetTokenUuid)) return { ok: false, reason: "changed", count };
        if (expired(marker)) return { ok: false, reason: "expired", count };
        const records = message.getFlag(scope, FEL_SHOD_GROUND) ?? [];
        if (!Array.isArray(records)) return { ok: false, reason: "record", count };
        if (records.some(row => row.key === marker.key)) continue;
        if ([...scene.regions].some(region => flags(region)[FEL_SHOD_GROUND]?.key === marker.key)) continue;
        const next = [...records, { key: marker.key, stage: "creating" }];
        await message.setFlag(scope, FEL_SHOD_GROUND, next);
        if (!gmHere() || JSON.stringify(message.getFlag(scope, FEL_SHOD_GROUND)) !== JSON.stringify(next)
          || !originalHit(message, marker.targetTokenUuid)) return { ok: false, reason: "changed", count };
        const created = await scene.createEmbeddedDocuments("Region", [{
          name: game.i18n.localize("AZEROTH.FelShod.Ground"), color: "#70c52b",
          shapes: [{ type: "circle", x: marker.x, y: marker.y, radius: marker.radius, gridBased: false }],
          elevation: { bottom: marker.elevation, top: marker.elevation, topInclusive: true }, levels: [marker.levelId],
          restriction: { enabled: false, type: "move", priority: 0 }, attachment: { token: null }, behaviors: [],
          visibility: CONST.REGION_VISIBILITY.ALWAYS, highlightMode: "shapes", displayMeasurements: false,
          hidden, locked: true,
          flags: { [scope]: { featureKey: "ability:fel-shod-ground", [FEL_SHOD_GROUND]: marker,
            source: { sceneId: scene.id, tokenId: marker.sourceTokenUuid.split(".").at(-1) } } }
        }]);
        const region = created?.[0];
        if (!gmHere() || !region || scene.regions.get(region.id) !== region
          || flags(region)[FEL_SHOD_GROUND]?.key !== marker.key) return { ok: false, reason: "unconfirmed", count };
        await message.setFlag(scope, FEL_SHOD_GROUND, next.map(row => row.key === marker.key
          ? { ...row, stage: "created", regionUuid: region.uuid } : row));
        count++;
      }
      return { ok: true, count };
    } catch { return { ok: false, reason: "writeUncertain", count }; }
  });
}

export function sweepFelShodGround() {
  return enqueue(async () => {
    if (!gmHere()) return;
    for (const scene of game.scenes ?? []) {
      const stale = [];
      for (const region of scene.regions ?? []) {
        const marker = flags(region)[FEL_SHOD_GROUND];
        if (!marker) continue;
        if (!recordedHit(marker) || expired(marker)) stale.push(region.id);
      }
      if (stale.length && gmHere()) await scene.deleteEmbeddedDocuments("Region", stale);
    }
  });
}

export function registerFelShodHooks() {
  const report = promise => promise.then(result => {
    if (result?.ok === false) ui.notifications?.warn(game.i18n.localize("AZEROTH.FelShod.Unconfirmed"));
  }).catch(error => console.warn("azeroth-rpg | Fel-shod ground", error));
  Hooks.on("createChatMessage", message => report(placeFelShodGround(message)));
  for (const event of ["updateChatMessage", "deleteChatMessage", "updateCombat", "deleteCombat", "deleteCombatant", "deleteToken", "deleteActor", "updateWorldTime", "updateUser", "ready"]) {
    Hooks.on(event, () => report(sweepFelShodGround()));
  }
}
