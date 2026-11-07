/**
 * What a creature's ability calls up (D-691, the lead's decision 2).
 *
 * Twenty-seven Boss Actions in 14 put more bodies on the field - *Two
 * **Earth Elemental**s step out of the chamber walls and act on its side from
 * the next round* - and every one of them was a paragraph. The descriptor
 * reads the count and the block off the chapter's own bold run; this places
 * them.
 *
 * **The card carries a button and the GM presses it.** The tool does not know
 * what *out of the chamber walls* means, so the tokens land in a ring around
 * the summoner and the GM drags them where they belong. The Boss Action's
 * points were spent when the action was used, not here, and **the card is
 * claimed once** (D-809, the lead's approval of the audit's F3): a second
 * press placed the bodies again, so a Boss's two Worgen became four for one
 * Boss Action. A placement that went somewhere wrong is dragged, not re-made.
 *
 * **The write goes through `CONFIG.queries`**, as D-643's binding does: a
 * player cannot create a world actor, and `game.socket` is not the answer.
 *
 * **They arrive on the summoner's side**, which is what 14 means by *acts on
 * his side*, and **they act from the next round** (D-809, the lead's approval
 * of the audit's F9): placed into a started fight, each combatant carries the
 * round it arrives in (`ARRIVES_FLAG`), and the tracker passes its turn until
 * then, in words (`effects/boss-doors.mjs#bossTurnSkip`). WHEN a Boss Action
 * is taken stays the table's (D-691).
 */

import { actorFolder, bondOf, worldActorOf } from "./bound.mjs";
import { prototypeTokenFor } from "../rules/bestiary.mjs";
// The ring every placed creature takes (the Legacy branches' door 4), one law for
// this door and the totem's.
import { ringSpots } from "../rules/summon-places.mjs";

export const SUMMON_QUERY = "azeroth-rpg.summon";

/** The flag that says which pack entry a world actor stands in for. */
export const SUMMONED_FLAG = "summonedFrom";

/**
 * The world actor for a bestiary entry, found or imported ONCE into the
 * Summoned folder. Keyed on a flag of our own, never on the name and never on
 * `_stats.compendiumSource`: that field is **managed by the server and ignored
 * in creation data** (verified in `common/data/fields.mjs` at 14.367), so
 * writing it here would have made a second copy on every summon.
 */
export async function summonedActor(entryName) {
  const pack = game.packs.get("azeroth-rpg.bestiary");
  if (!pack) throw new Error(game.i18n.localize("AZEROTH.Summon.NoPack"));
  const index = await pack.getIndex();
  const found = index.find(e => e.name === entryName) ?? null;
  if (!found) throw new Error(game.i18n.format("AZEROTH.Summon.NoEntry", { name: entryName }));
  const uuid = pack.getUuid(found._id);
  const held = game.actors.find(a => a.getFlag("azeroth-rpg", SUMMONED_FLAG) === uuid);
  if (held) return held;
  const entry = await pack.getDocument(found._id);
  const data = entry.toObject();
  delete data._id;
  const folder = await actorFolder("AZEROTH.Summon.Folder");
  return Actor.create({
    ...data,
    folder: folder?.id ?? null,
    // Unlinked, so each body on the field carries its own Health.
    prototypeToken: {
      ...prototypeTokenFor({ name: data.name, img: data.img, size: data.system?.size ?? "medium" }),
      actorLink: false
    },
    flags: {
      ...(data.flags ?? {}),
      "azeroth-rpg": { ...(data.flags?.["azeroth-rpg"] ?? {}), [SUMMONED_FLAG]: uuid }
    }
  });
}

/**
 * The token a summoner stands on, on the scene it is on - **the scene the caller
 * named first** (the B2 review: this handler runs on the GM's client for a player's
 * call, and the GM's viewed scene is not the player's - a linked summoner standing on
 * two scenes rang its bodies round the wrong one, into the wrong fight), then the
 * viewed scene, then the active one, then any (`documents/totems.mjs#ownerToken`'s
 * reading).
 *
 * @param {Actor} summoner
 * @param {string|null} [sceneId]  the scene the summoner's token stood on where the call was made
 */
function summonerToken(summoner, sceneId = null) {
  if (summoner.isToken) return summoner.token;
  const world = worldActorOf(summoner);
  const seen = new Set();
  const named = typeof sceneId === "string" && sceneId ? (game.scenes?.get(sceneId) ?? null) : null;
  for (const scene of [named, canvas?.scene ?? null, game.scenes?.active ?? null, ...(game.scenes ?? [])]) {
    if (!scene || seen.has(scene.id)) continue;
    seen.add(scene.id);
    const token = scene.tokens.find(t => t.actorId === world.id);
    if (token) return token;
  }
  return null;
}

/**
 * The GM-side handler: import the block, place the bodies, and put them in
 * the fight on the summoner's side. Throws with the reason, which travels
 * back to the caller as the refusal.
 *
 * **AND A CREATURE ALREADY BOUND, AT A POINT** (the Legacy branches' door 4): with
 * `actorUuid`, the world actor a bond made (`documents/bound.mjs#bind`) - 04's
 * Pocket Factory's gnomes, Dark Minion's skeleton, The Bench's construct - judged
 * here as bound to THIS summoner, a uuid being no permission; with `at`, the canvas
 * point picked, whose square is the first the ring tries. Both absent is a Boss
 * Action's call, exactly as before: imported once into the Summoned folder and rung
 * round the summoner.
 */
export async function summonQueryHandler({ summonerUuid, entry = null, count = 1, side = "summoner", actorUuid = null, at = null, sceneId = null, from = null } = {}, { user = null } = {}) {
  const summoner = await fromUuid(summonerUuid);
  if (!summoner || summoner.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Summon.NoSummoner"));
  if (user && !summoner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));

  const token = summonerToken(summoner, sceneId);
  const scene = token?.parent ?? null;
  if (!token || !scene) throw new Error(game.i18n.format("AZEROTH.Summon.NoGround", { name: summoner.name }));

  let actor;
  if (actorUuid) {
    actor = worldActorOf(await fromUuid(actorUuid));
    if (actor?.documentName !== "Actor" || bondOf(actor)?.ownerUuid !== worldActorOf(summoner).uuid) {
      throw new Error(game.i18n.format("AZEROTH.Bound.NoEntry", { name: actor?.name ?? actorUuid }));
    }
  } else actor = await summonedActor(entry);
  const cell = { w: scene.grid.sizeX ?? scene.grid.size, h: scene.grid.sizeY ?? scene.grid.size };
  const prototype = actor.prototypeToken.toObject();
  const size = { width: Math.max(1, prototype.width ?? 1) * cell.w, height: Math.max(1, prototype.height ?? 1) * cell.h };
  const many = Math.max(1, Math.trunc(Number(count)) || 1);
  // The summoner's own side, which is what *acts on his side* means; a token
  // has no side of its own beyond its disposition, and the tracker reads that.
  const disposition = side === "opposing"
    ? -(token.disposition || CONST.TOKEN_DISPOSITIONS.HOSTILE)
    : token.disposition;
  // Where the first one stands: the picked point's square, else the summoner's
  // own square rung round (D-691's ring, one law since door 4).
  const point = at && Number.isFinite(Number(at.x)) && Number.isFinite(Number(at.y)) ? { x: Number(at.x), y: Number(at.y) } : null;
  let origin = { x: token.x, y: token.y };
  if (point) {
    const raw = { x: point.x - size.width / 2, y: point.y - size.height / 2 };
    try {
      origin = scene.grid.getSnappedPoint(raw, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
    } catch {
      origin = raw;
    }
  }
  const standing = scene.tokens.map(t => ({ x: t.x, y: t.y, width: (t.width ?? 1) * cell.w, height: (t.height ?? 1) * cell.h }));
  const spots = ringSpots({ origin, count: many, cell, size, standing, board: scene.dimensions?.rect ?? null, includeOrigin: Boolean(point) });

  const rows = spots.map(spot => ({
    ...prototype,
    actorId: actor.id,
    // A bound creature's prototype says whether its tokens are its own (D-643): a
    // construct is held and linked, a called set unlinked so each carries its Health.
    actorLink: actorUuid ? prototype.actorLink === true : false,
    disposition,
    elevation: token.elevation ?? 0,
    x: Math.round(spot.x),
    y: Math.round(spot.y)
  }));
  const placed = await scene.createEmbeddedDocuments("Token", rows);

  // Into the fight beside the summoner, where there is one.
  const fight = game.combats?.find(c => c.combatants.some(cb => cb.tokenId === token.id)) ?? null;
  if (fight) {
    // *From the next round* (D-809): the round each one arrives in, on its combatant.
    const arrives = from === "nextRound" && fight.started ? { flags: { "azeroth-rpg": { arrives: fight.round + 1 } } } : {};
    await fight.createEmbeddedDocuments("Combatant", placed.map(t => ({
      tokenId: t.id, sceneId: scene.id, actorId: actor.id, ...arrives
    })));
  }
  return { count: placed.length, name: actor.name, inFight: Boolean(fight), tokenIds: placed.map(t => t.id), sceneId: scene.id };
}

/**
 * Place what an ability called up. Runs the handler here for a GM and asks
 * the active GM's client otherwise; the refusal is shown rather than thrown.
 *
 * `actor` (a creature a bond made) and `at` (a picked canvas point) are door 4's
 * (`summonQueryHandler`). `sceneId` is the scene the summoner's token stood on where
 * the call was made (the B2 review): the GM's client finds the token there first.
 */
export async function placeSummon({ summoner, entry = null, count = 1, side = "summoner", actor = null, at = null, sceneId = null, from = null }) {
  const payload = {
    summonerUuid: summoner.uuid, entry, count, side, actorUuid: actor?.uuid ?? null, at: at ? { x: at.x, y: at.y } : null,
    sceneId: typeof sceneId === "string" && sceneId ? sceneId : null,
    // `thirdRound` (D-811) is placed when the card lets it be, at the round they arrive in, and
    // acts at once: no `arrives` mark, which only `nextRound` writes.
    from: from === "nextRound" || from === "now" || from === "thirdRound" ? from : null
  };
  try {
    if (game.user.isGM) return await summonQueryHandler(payload, { user: game.user });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
    return await gm.query(SUMMON_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return null;
  }
}
