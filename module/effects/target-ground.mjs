/**
 * **THE GROUND AT A SINGLE TARGET, PLACED** (07's Lightning Strike, Earthen Spike and
 * Shattering Bolt; the Chromatic Champion plan, stage 3B). `rules/area-ground.mjs
 * #targetGroundOf` reads where the ground is - the creature's own footprint, widened by the
 * feet the sentence names - and how long it lasts; this places a Region there for each
 * creature the card records, carrying the record every other placed area carries
 * (`dice/chat.mjs#regionFlagsFromCard`'s shape: the cast, the caster, the ground, the span,
 * where it went down), so the one reconciler lays its Difficult ground behavior
 * (`canvas/sustained-areas.mjs#reconcileGround`) and the one sweep takes it away when its
 * span is over. A creature with no token on a scene has no ground to place, said in words.
 */

import { placeArea } from "../canvas/regions.mjs";
import { pinnedProne, pinsProne } from "../rules/area-ground.mjs";

/**
 * The feet from a token's centre to the edge of its footprint, the larger side's half: the
 * radius a circle covering the creature's own space takes.
 *
 * @param {TokenDocument} doc
 */
function halfFootprintFeet(doc) {
  const scene = doc?.parent ?? null;
  const per = Number(scene?.grid?.distance) || 5;
  const squares = Math.max(Number(doc?.width) || 1, Number(doc?.height) || 1);
  return (squares * per) / 2;
}

/**
 * Place the ground at each creature the card records.
 *
 * @param {{actor: Actor, spell: Item, cast: string, targets: Array, ground: {feet: number, rounds: number|null},
 *   areaGround?: object|null, source?: object|null}} o
 * @returns {Promise<string[]>}  the card's lines
 */
export async function placeTargetGround({ actor, spell, cast, targets = [], ground, areaGround = null, source = null }) {
  const lines = [];
  if (!ground || !spell) return lines;
  const fight = actor?.activeFight?.() ?? null;
  const record = {
    difficult: true, lasts: { rounds: ground.rounds ?? null }, from: "target", ignores: false, reason: ""
  };
  for (const t of targets ?? []) {
    const scene = (t?.sceneId && game.scenes?.get(t.sceneId)) || null;
    const doc = t?.tokenId ? scene?.tokens?.get(t.tokenId) ?? null : null;
    const name = t?.name ?? doc?.name ?? "";
    if (!doc || !scene) {
      lines.push(game.i18n.format("AZEROTH.TargetGround.NoToken", { name, spell: spell.name }));
      continue;
    }
    const radius = halfFootprintFeet(doc) + Math.max(0, Number(ground.feet) || 0);
    const size = doc.getSize?.() ?? { width: (doc.width ?? 1) * (scene.grid?.size ?? 100), height: (doc.height ?? 1) * (scene.grid?.size ?? 100) };
    const origin = { x: doc.x + size.width / 2, y: doc.y + size.height / 2 };
    // One Region refused is one line, never the whole card (the 3B review, should-fix 12).
    let region = null;
    try {
      region = await placeArea({
        spell, areaText: `A ${radius} ft radius`, name: spell.name, scene, origin, token: doc, attach: false,
        title: game.i18n.format("AZEROTH.TargetGround.Title", { spell: spell.name, name }),
        flags: {
          cast, caster: actor?.uuid ?? null, source, sustained: false, areaTick: null,
          areaGround: areaGround?.difficult ? { ...areaGround, from: "target" } : record, ground: null, widen: 0,
          spell: { name: spell.name, school: spell.system?.school ?? null, tier: spell.system?.tier ?? null, takesSpellpower: false, img: spell.img ?? null },
          lasts: { rounds: ground.rounds ?? null },
          placedAt: { combatId: fight?.id ?? null, round: fight ? (fight.round ?? null) : null, turn: fight ? (fight.turn ?? null) : null, time: game.time?.worldTime ?? 0 },
          // 07's Earthen Spike: *a creature it knocked Prone cannot stand up* while it stands.
          ...(pinsProne(spell.system?.effect ?? "") ? { pinsProne: true } : {})
        }
      });
    } catch (err) {
      console.warn("azeroth-rpg | the ground at a single target", err);
      region = null;
    }
    lines.push(game.i18n.format(region ? "AZEROTH.TargetGround.Placed" : "AZEROTH.TargetGround.NotPlaced", { name, spell: spell.name, feet: ground.feet }));
  }
  return lines;
}

/**
 * **WHETHER A PRONE CREATURE IS PINNED** (07's Earthen Spike: *a creature it knocked Prone
 * cannot stand up* while the spike stands; the 3B review, should-fix 15): the spike's Region
 * on the scene of each of the creature's tokens that holds the token, read through
 * `rules/area-ground.mjs#pinnedProne` against the Prone's own `laidBy`. The Stand door
 * (`AzerothActor#toggleStatusEffect`) asks this and refuses in words. The Region goes with
 * the sweep at the end of the caster's next turn, and the creature may Stand then.
 *
 * @param {Actor} actor
 * @returns {{id: string, spell: string}|null}
 */
export function pinnedHere(actor) {
  const prone = (actor?.effects ?? []).find(e => e.active !== false && e.statuses?.has?.("prone")) ?? null;
  const laidBy = prone?.flags?.["azeroth-rpg"]?.laidBy ?? [];
  if (!prone || !Array.isArray(laidBy) || !laidBy.length) return null;
  const regions = [];
  for (const token of actor.getDependentTokens?.() ?? (actor.isToken && actor.token ? [actor.token] : [])) {
    const scene = token?.parent ?? null;
    for (const r of scene?.regions ?? []) {
      const f = r.flags?.["azeroth-rpg"] ?? {};
      if (f.pinsProne !== true) continue;
      let inside = false;
      try {
        inside = token.testInsideRegion(r) === true;
      } catch {
        inside = false;
      }
      regions.push({ id: r.id, pins: true, caster: f.caster ?? null, inside, spell: f.spell?.name ?? r.name ?? "" });
    }
  }
  return pinnedProne({ laidBy, regions });
}
