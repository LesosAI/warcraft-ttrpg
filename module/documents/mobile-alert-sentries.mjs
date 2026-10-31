import { MOBILE_ALERT, MOBILE_ALERT_FLAG, mobileAlertStep, confirmMobileSentries } from "../rules/mobile-alert.mjs";
import { mobileSentrySpots } from "../rules/mobile-alert-places.mjs";
import { summonedActor } from "./summon.mjs";
import { mobileAlertBusy as busy, releaseMobileAlert } from "../effects/mobile-alert-lock.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const flag = token => token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG) ?? null;
const point = token => ({ x: token.x, y: token.y, elevation: token.elevation, level: token._source?.level });

/** Claim before the single two-token write. Partial delivery remains placing,
 * with cast-stamped tokens available for reconciliation; never auto-retry. */
export async function placeMobileSentries({ token, valid, review } = {}) {
  const refuse = reason => ({ ok: false, reason });
  if (!gmHere() || !token?.uuid || typeof valid !== "function" || typeof review !== "function" || busy.has(token.uuid)) return refuse("authorityOrBusy");
  busy.add(token.uuid);
  try {
    const actor = token.actor, scene = token.parent, origin = point(token), time = game.time.worldTime;
    let receipt = structuredClone(flag(token));
    const fight = () => values(game.combats).find(combat => combat.started
      && values(combat.combatants).some(row => row.actor?.uuid === actor?.uuid)) ?? null;
    const clock = () => { const combat = fight(); return combat ? { id: combat.id, round: combat.round,
      actorUuid: combat.combatant?.actor?.uuid, turn: combat.turn } : null; };
    const combat = clock();
    const allowed = () => gmHere() && valid() && token.actor === actor && actor?.type === "npc"
      && game.scenes?.get(scene?.id) === scene && scene.tokens.get(token.id) === token
      && scene.levels?.has(origin.level) && same(point(token), origin)
      && game.time.worldTime === time && same(clock(), combat) && same(flag(token), receipt)
      && actor.system?.health?.value > 0 && !actor.statuses?.has("stunned")
      && actor.system.creatureAbilities?.some(row => row.name === MOBILE_ALERT.name);
    if (!allowed()) return refuse("source");
    const plan = mobileAlertStep({ record: receipt, tokenUuid: token.uuid, actorUuid: actor.uuid,
      point: origin, time, combat, alive: true });
    if (!plan.ok || plan.action !== "summon") return refuse("notDue");
    const owned = () => values(game.scenes).flatMap(s => values(s.tokens)).filter(t => {
      const state = flag(t); return state?.ownerUuid === token.uuid && state.cast === receipt.cast;
    });
    if (owned().length) return refuse("existingSentries");
    const guardian = await summonedActor(MOBILE_ALERT.entry);
    if (!allowed() || guardian?.name !== MOBILE_ALERT.entry || guardian.type !== "npc") return refuse("entry");
    const prototype = guardian.prototypeToken.toObject(); delete prototype._id;
    const cell = { w: scene.grid.sizeX ?? scene.grid.size, h: scene.grid.sizeY ?? scene.grid.size };
    const size = { width: (prototype.width ?? 1) * cell.w, height: (prototype.height ?? 1) * cell.h };
    const spotsNow = () => mobileSentrySpots({ origin, cell, size, board: scene.dimensions?.rect,
      standing: values(scene.tokens).filter(t => t._source?.level === origin.level).map(t => ({
        x: t.x, y: t.y, width: (t.width ?? 1) * cell.w, height: (t.height ?? 1) * cell.h })) });
    const spots = spotsNow();
    if (!spots) return refuse("space");
    if (!await review({ token, spots: structuredClone(spots), size: { ...size }, entry: MOBILE_ALERT.entry })) return refuse("cancelled");
    if (!allowed() || owned().length || !same(spotsNow(), spots)) return refuse("changed");
    receipt = { ...plan.record, spots: structuredClone(spots) };
    await token.setFlag("azeroth-rpg", MOBILE_ALERT_FLAG, receipt);
    if (!allowed() || owned().length || !same(spotsNow(), spots)) return refuse("claimUncertain");
    const placed = await scene.createEmbeddedDocuments("Token", spots.map(spot => ({ ...structuredClone(prototype),
      actorId: guardian.id, actorLink: false, level: origin.level, elevation: origin.elevation,
      disposition: token.disposition, hidden: token.hidden === true, x: spot.x, y: spot.y,
      flags: { ...prototype.flags, "azeroth-rpg": { ...prototype.flags?.["azeroth-rpg"],
        [MOBILE_ALERT_FLAG]: { ownerUuid: token.uuid, cast: receipt.cast, entry: MOBILE_ALERT.entry } } }
    })));
    if (!allowed() || placed?.length !== MOBILE_ALERT.count || owned().length !== MOBILE_ALERT.count
      || placed.some((t, i) => scene.tokens.get(t.id) !== t || t.actorId !== guardian.id || t.actorLink !== false
        || t._source?.level !== origin.level || t.elevation !== origin.elevation
        || t.disposition !== token.disposition || t.hidden !== (token.hidden === true)
        || t.x !== spots[i].x || t.y !== spots[i].y)) return refuse("placementUncertain");
    const confirmed = confirmMobileSentries(receipt, placed.map(t => ({ ...flag(t), uuid: t.uuid })));
    if (!confirmed) return refuse("identity");
    receipt = confirmed;
    await token.setFlag("azeroth-rpg", MOBILE_ALERT_FLAG, receipt);
    return allowed() ? { ok: true, record: receipt, tokens: placed } : refuse("recordUncertain");
  } catch (error) {
    console.warn("azeroth-rpg | Mobile Alert sentry placement uncertain; inspect its claimed tokens before retrying", error);
    return refuse("writeUncertain");
  } finally { releaseMobileAlert(token); }
}
