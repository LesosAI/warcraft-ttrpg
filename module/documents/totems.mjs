/**
 * Planting a totem (02 §7, D-708).
 *
 * D-643 made a totem a bound world actor and stopped there: the Shaman's
 * Totem feature made an Actor in the *Bound* folder, posted a card, and put
 * nothing on the table. **A totem is a thing that stands somewhere** — 02 §7
 * is explicit, *as a Half-Action, you may place a totem within 5 feet of
 * you* — and every row of the table then measures from it. So the pick
 * places one token beside the shaman and draws the ground it holds.
 *
 * **The aura is a Scene Region, through the grammar the cards already use**
 * (D-616). `rules/totems.mjs#totemAura` reads the radius off 02's own row and
 * writes it in 07 §9's phrasing; `canvas/regions.mjs#regionDataFor` turns
 * that into a v14 Region. The Region is ATTACHED to the totem's token, which
 * is what makes it follow a drag: core rewrites an attached Region's shapes
 * on every move (`client/documents/token.mjs#computeAttachedRegionUpdates`,
 * verified at 14.367) and deletes it with the token
 * (`TokenDocument._onDeleteOperation`). Nothing here has to clean up: the
 * fight's end already deletes an `until: "encounter"` creature and its tokens
 * (D-643), and the Region goes with them through core.
 *
 * **The write goes through `CONFIG.queries`**, as D-643's binding does:
 * `TOKEN_CREATE` is an ASSISTANT permission at 14.367, so a player's totem
 * has to be placed on the active GM's client. The handler checks what the
 * caller may do before it writes anything, and takes NOTHING from the payload
 * it can read off a document instead — the label is the totem actor's own
 * name and the radius is bounded.
 *
 * **What the totem DOES is not automated** (D2 §12). The aura says where the
 * effect reaches. Whether a target inside it takes the Armor Point, the Boon
 * or the Health is the table's call, exactly as the thirty feet an Augment is
 * cast through has always been (D-674).
 */

import { bondOf, worldActorOf } from "./bound.mjs";
import { regionDataFor } from "../canvas/regions.mjs";

export const PLANT_TOTEM_QUERY = "azeroth-rpg.plantTotem";

/**
 * Where a totem is planted, in grid squares out from the shaman. 02 §7 says
 * *within 5 feet of you*, so the first ring is the whole of what the rule
 * allows; the outer rings are the fallback when every adjacent square is
 * occupied, and the GM drags it from there.
 */
const RING = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]);

/** How far out the search gives up and stacks the totem on the shaman's elbow. */
const RINGS = 3;

/** A radius past this is not a totem's, and is refused rather than drawn. */
const MAX_FEET = 1000;

/**
 * The token the owner is standing on, and the scene it is on.
 *
 * **NOT `getActiveTokens`.** That reads `canvas.scene`, and this handler runs
 * on the ACTIVE GM's client for a player's pick — the GM may be looking at a
 * different scene entirely, and the totem belongs where the shaman is. The
 * viewed scene is preferred, then the active one, then any scene holding a
 * token of theirs.
 */
export function ownerToken(owner) {
  if (!owner) return null;
  if (owner.isToken) return owner.token;
  const world = worldActorOf(owner);
  const seen = new Set();
  const scenes = [canvas?.scene ?? null, game.scenes?.active ?? null, ...(game.scenes ?? [])];
  for (const scene of scenes) {
    if (!scene || seen.has(scene.id)) continue;
    seen.add(scene.id);
    const token = scene.tokens.find(t => t.actorId === world.id);
    if (token) return token;
  }
  return null;
}

/** Every token of an actor, anywhere, so a second planting can be refused. */
function tokensOf(actor) {
  const out = [];
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens) if (token.actorId === actor.id) out.push(token);
  }
  return out;
}

/** Do two token footprints overlap, in pixels? */
function overlaps(a, b) {
  return (a.x < b.x + b.width) && (b.x < a.x + a.width)
    && (a.y < b.y + b.height) && (b.y < a.y + a.height);
}

/**
 * The first square beside the shaman with nothing standing in it and the whole
 * footprint still on the canvas. Falls back to the first ring position,
 * stacked, rather than refusing to plant at all — a shaman fighting in a
 * doorway still gets a totem, and the GM drags it a square.
 */
export function freeSpot(scene, from, size) {
  const gx = scene.grid.sizeX ?? scene.grid.size;
  const gy = scene.grid.sizeY ?? scene.grid.size;
  const standing = scene.tokens.map(t => ({ x: t.x, y: t.y, ...t.getSize() }));
  // `Scene#dimensions` is computed in `prepareBaseData` for every scene,
  // viewed or not (client/documents/scene.mjs, 14.367), so a totem planted on
  // a scene the GM is not looking at still lands on the board.
  const board = scene.dimensions?.rect ?? null;
  const onBoard = box => !board
    || (box.x >= board.x && box.y >= board.y
      && box.x + box.width <= board.x + board.width
      && box.y + box.height <= board.y + board.height);
  for (let out = 1; out <= RINGS; out++) {
    for (const [dx, dy] of RING) {
      const spot = { x: from.x + dx * gx * out, y: from.y + dy * gy * out };
      const box = { ...spot, width: size.width, height: size.height };
      if (onBoard(box) && !standing.some(t => overlaps(t, box))) return spot;
    }
  }
  return { x: from.x + gx, y: from.y };
}

/**
 * The GM-side handler (`CONFIG.queries`): plant the bound totem beside its
 * owner and draw the ground it holds. Throws with the reason, which travels
 * back to the caller as the refusal.
 */
export async function plantTotemQueryHandler({ ownerUuid, totemUuid, feet = null, color = null } = {}, { user = null } = {}) {
  const owner = worldActorOf(await fromUuid(ownerUuid));
  if (!owner || owner.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Bound.NoOwner"));
  if (user && !owner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));

  // The totem must be a creature bound to THIS owner: the payload names a
  // uuid and a uuid is not a permission.
  const totem = worldActorOf(await fromUuid(totemUuid));
  const bond = totem ? bondOf(totem) : null;
  if (!totem || totem.documentName !== "Actor" || bond?.ownerUuid !== owner.uuid) {
    throw new Error(game.i18n.format("AZEROTH.Totem.NoTotem", { owner: owner.name }));
  }

  const standing = tokensOf(totem);
  if (standing.length) {
    throw new Error(game.i18n.format("AZEROTH.Totem.Standing", { name: totem.name, scene: standing[0].parent?.name ?? "" }));
  }

  const anchor = ownerToken(owner);
  const scene = anchor?.parent ?? null;
  if (!anchor || !scene) throw new Error(game.i18n.format("AZEROTH.Totem.NoGround", { owner: owner.name, name: totem.name }));

  const prototype = totem.prototypeToken.toObject();
  // `PrototypeToken` is a DataModel of its own and carries no `getSize`
  // (14.367); the footprint is its square count times the grid.
  const size = {
    width: Math.max(1, prototype.width ?? 1) * (scene.grid.sizeX ?? scene.grid.size),
    height: Math.max(1, prototype.height ?? 1) * (scene.grid.sizeY ?? scene.grid.size)
  };
  const spot = freeSpot(scene, { x: anchor.x, y: anchor.y }, size);
  const [placed] = await scene.createEmbeddedDocuments("Token", [{
    ...prototype,
    actorId: totem.id,
    // The bond decided whether this creature's tokens are linked (D-643): a
    // totem lasts the encounter, so its token is its own copy.
    actorLink: prototype.actorLink,
    // The shaman's own side, which is what 02 §7 means by *your* totem; a
    // token has no side of its own beyond its disposition (D-658).
    disposition: anchor.disposition,
    elevation: anchor.elevation,
    ...spot
  }]);

  // Into the fight beside the shaman, where there is one. A bound creature
  // acts on its owner's Initiative (D2 §7, D-643), which `derivedInitiative`
  // reads off the bond, so nothing is written here.
  const fight = game.combats?.find(c => c.combatants.some(cb => cb.tokenId === anchor.id)) ?? null;
  if (fight && !fight.combatants.some(cb => cb.tokenId === placed.id)) {
    await fight.createEmbeddedDocuments("Combatant", [{ tokenId: placed.id, sceneId: scene.id, actorId: totem.id }]);
  }

  // The ground it holds. A totem whose row names no distance — none of 02's
  // seven, but a GM may write one — stands and draws nothing.
  const radius = Number(feet);
  let region = null;
  if (Number.isFinite(radius) && radius > 0 && radius <= MAX_FEET) {
    const centre = placed.getCenterPoint();
    const data = regionDataFor({
      areaText: `A ${Math.round(radius)} ft radius centered on you`,
      title: game.i18n.format("AZEROTH.Totem.AuraName", { name: totem.name, feet: Math.round(radius) }),
      color: /^#[0-9a-fA-F]{6}$/.test(String(color ?? "")) ? color : null,
      scene,
      origin: { x: centre.x, y: centre.y },
      token: placed
    });
    if (data) {
      // Which totem this ground belongs to, for a reader and for a repair.
      data.flags["azeroth-rpg"].totemOf = totem.uuid;
      [region] = await scene.createEmbeddedDocuments("Region", [data]);
    }
  }

  return {
    placed: true,
    tokenId: placed.id,
    sceneId: scene.id,
    sceneName: scene.name,
    regionId: region?.id ?? null,
    feet: region ? Math.round(radius) : null,
    name: totem.name,
    inFight: Boolean(fight)
  };
}

/**
 * Plant a bound totem beside its owner: here for a GM, on the active GM's
 * client for a player. The refusal is SHOWN rather than thrown — a totem that
 * could not be planted is still bound, and the caller carries on.
 *
 * **THE REASON TRAVELS BACK.** A refusal that came home as a bare `null` left
 * the card printing *no token on a scene* whatever had actually happened —
 * no GM online, a totem already standing — which is a wrong sentence rather
 * than a missing one.
 *
 * @param {object} options
 * @param {Actor} options.owner   The shaman.
 * @param {Actor} options.totem   The bound world actor.
 * @param {object|null} [options.aura]  From `rules/totems.mjs#totemAura`.
 * @returns {Promise<{placed: boolean, reason?: string}>}
 */
export async function plantTotem({ owner, totem, aura = null, quiet = false } = {}) {
  if (!owner || !totem) return { placed: false, reason: game.i18n.localize("AZEROTH.Bound.NoOwner") };
  const payload = {
    ownerUuid: worldActorOf(owner).uuid,
    totemUuid: worldActorOf(totem).uuid,
    feet: aura?.feet ?? null,
    color: aura?.color ?? null
  };
  try {
    if (game.user.isGM) return await plantTotemQueryHandler(payload, { user: game.user });
    const gm = game.users.activeGM;
    if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
    return await gm.query(PLANT_TOTEM_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    if (!quiet) ui.notifications?.warn(err.message);
    return { placed: false, reason: err.message };
  }
}

/**
 * The line the feature's card prints for a totem that was planted, or the one
 * it prints for a shaman with no token on any scene. Never a button: the
 * totem is already standing, and a control that does nothing is worse than
 * no control at all (D-681).
 */
export function plantedLine({ owner, totem, placed }) {
  const name = totem?.uuid ? `@UUID[${totem.uuid}]{${totem.name}}` : (totem?.name ?? "");
  if (!placed?.placed) {
    return placed?.reason ?? game.i18n.format("AZEROTH.Totem.NoGround", { owner: owner.name, name: totem?.name ?? "" });
  }
  if (placed.feet) return game.i18n.format("AZEROTH.Totem.PlantedAura", { owner: owner.name, name, feet: placed.feet });
  return game.i18n.format("AZEROTH.Totem.Planted", { owner: owner.name, name });
}
