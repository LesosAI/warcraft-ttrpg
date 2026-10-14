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
 * points were spent when the action was used, not here: pressing Place twice
 * is the GM's own mistake to make, and refusing it would strand a summon
 * whose first placement went somewhere wrong.
 *
 * **The write goes through `CONFIG.queries`**, as D-643's binding does: a
 * player cannot create a world actor, and `game.socket` is not the answer.
 *
 * **They arrive on the summoner's side**, which is what 14 means by *acts on
 * his side*. WHEN they act is the table's: 14 says *from the next round* and
 * the chat line says so, but nothing here moves the tracker's turn - D2 SS12
 * forbids automating the table's call, and the same discipline holds the
 * timing of a Boss Action itself.
 */

import { actorFolder } from "./bound.mjs";
import { prototypeTokenFor } from "../rules/bestiary.mjs";

export const SUMMON_QUERY = "azeroth-rpg.summon";

/** Where a summoned body stands, in grid squares out from the summoner. */
const RING = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]);

/** The flag that says which pack entry a world actor stands in for. */
export const SUMMONED_FLAG = "summonedFrom";

/**
 * The world actor for a bestiary entry, found or imported ONCE into the
 * Summoned folder. Keyed on a flag of our own, never on the name and never on
 * `_stats.compendiumSource`: that field is **managed by the server and ignored
 * in creation data** (verified in `common/data/fields.mjs` at 14.367), so
 * writing it here would have made a second copy on every summon.
 */
async function summonedActor(entryName) {
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
 * The GM-side handler: import the block, place the bodies, and put them in
 * the fight on the summoner's side. Throws with the reason, which travels
 * back to the caller as the refusal.
 */
export async function summonQueryHandler({ summonerUuid, entry, count = 1, side = "summoner" } = {}, { user = null } = {}) {
  const summoner = await fromUuid(summonerUuid);
  if (!summoner || summoner.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Summon.NoSummoner"));
  if (user && !summoner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));

  const token = summoner.isToken ? summoner.token : (summoner.getActiveTokens()[0]?.document ?? null);
  const scene = token?.parent ?? canvas?.scene ?? null;
  if (!token || !scene) throw new Error(game.i18n.format("AZEROTH.Summon.NoGround", { name: summoner.name }));

  const actor = await summonedActor(entry);
  const size = scene.grid.size;
  const width = Math.max(1, actor.prototypeToken?.width ?? 1);
  const many = Math.max(1, Math.trunc(Number(count)) || 1);
  // The summoner's own side, which is what *acts on his side* means; a token
  // has no side of its own beyond its disposition, and the tracker reads that.
  const disposition = side === "opposing"
    ? -(token.disposition || CONST.TOKEN_DISPOSITIONS.HOSTILE)
    : token.disposition;

  const rows = [];
  for (let i = 0; i < many; i++) {
    const [dx, dy] = RING[i % RING.length];
    const out = (1 + Math.floor(i / RING.length)) * width;
    rows.push({
      ...actor.prototypeToken.toObject(),
      actorId: actor.id,
      actorLink: false,
      disposition,
      x: token.x + dx * size * out,
      y: token.y + dy * size * out
    });
  }
  const placed = await scene.createEmbeddedDocuments("Token", rows);

  // Into the fight beside the summoner, where there is one.
  const fight = game.combats?.find(c => c.combatants.some(cb => cb.tokenId === token.id)) ?? null;
  if (fight) {
    await fight.createEmbeddedDocuments("Combatant", placed.map(t => ({
      tokenId: t.id, sceneId: scene.id, actorId: actor.id
    })));
  }
  return { count: placed.length, name: actor.name, inFight: Boolean(fight) };
}

/**
 * Place what an ability called up. Runs the handler here for a GM and asks
 * the active GM's client otherwise; the refusal is shown rather than thrown.
 */
export async function placeSummon({ summoner, entry, count = 1, side = "summoner" }) {
  const payload = { summonerUuid: summoner.uuid, entry, count, side };
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
