/**
 * **THE DEATH KNIGHT'S NECROMANCY AND PRESENCES, ON THE BOARD** (the Death Knight plan's Phase 4
 * doors 10 to 12 and *Raising the dead*; run F3). The law is `rules/raise.mjs` (the raises, the
 * corpses) and `rules/death-knight.mjs` (the presences); this module is the doors:
 *
 * - **The raises** - 07 §17's Raise Skeleton, Raise Ghoul, Raise Crypt Fiend, Raise Abomination and
 *   Raise Dracolich, and 02 §7's Army of the Dead. `judgeRaise` asks everything BEFORE anything is
 *   paid (D-768): the knight's token, the Runic Power cap a raise needs, a GM to place the dead
 *   (`rules/gm-writes.mjs#gmAbsentFor`), the block in the bestiary, and the corpses - defeated
 *   tokens, chosen through the one chooser (D-673). `raiseDead` then makes the dead on the GM's
 *   client through `CONFIG.queries` (`TOKEN_CREATE` is the GM's): ONE world actor of the
 *   `raised` bond kind whose tokens are unlinked (the called-set shape), placed where the first
 *   corpse lies, on the knight's side and in the knight's fight - so they act on the knight's
 *   Initiative (D2 §7) - with a CARRIER on the knight whose span is the raise's clock
 *   (`durations.mjs#roundsOrClock`) or, for the Dracolich, none at all. A recast deletes the
 *   earlier raise's carrier; the carrier's deletion, however it comes, collapses the dead it
 *   carries (`documents/bound.mjs#registerBoundHooks`), and the last of them gone takes the carrier.
 * - **The corpses' marks** - Corpse Burst destroys one, Stay the Rot keeps one for its knight for
 *   10 days, Seal the Soul seals one for a day (`markCorpses`), on the corpse's own token.
 * - **Unholy Presence and March of the Damned** - one laid effect on the knight each
 *   (`PRESENCE_FLAG`), whose auras the aura door holds up (`rules/death-knight.mjs
 *   #presenceAuraSources`). A Use while the presence stands ends it, free; 0 Health and a Long
 *   Rest end it too (`AzerothActor`).
 */

import {
  CORPSE_FLAG, CORPSE_MARKS, RAISE_FLAG, corpseMarkRefusal, corpseRefusal, isCorpse, rangeFeetOf, raiseAskRefusal, raiseCapRefusal,
  raiseOf, raiseRoseAnyway, raiseRounds, raiseSetRefusal, raiseUntil, raisedCount, strandedRaises
} from "../rules/raise.mjs";
import { refundedValue } from "../rules/miss.mjs";
import { AZEROTH } from "../config.mjs";
import { MARCH_OF_THE_DAMNED, PRESENCE_FLAG, UNHOLY_PRESENCE, marchShadow, presenceOf } from "../rules/death-knight.mjs";
import { runicPowerCap } from "../rules/runes.mjs";
import { IMMUNE_FLAG } from "../rules/legacy-uses.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { MOUNT_WORKED_FLAG } from "../rules/mount-works.mjs";
import { bondOf, createBoundActor, syncBoundFor, unbindQueryHandler } from "../documents/bound.mjs";
import { summonQueryHandler } from "../documents/summon.mjs";
import { minuteSpan, roundsOrClock } from "./durations.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);

/** The query a raise is made through on the GM's client. */
export const RAISE_QUERY = "azeroth-rpg.raiseDead";
/** The query a corpse's mark is written through on the GM's client. */
export const CORPSE_QUERY = "azeroth-rpg.markCorpse";

/** Run a query on the GM's client, or the handler here where this client is a GM. */
async function askGM(name, handler, payload) {
  if (game.user.isGM) return handler(payload, { user: game.user });
  const gm = game.users.activeGM;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
  return gm.query(name, payload, { timeout: 15000 });
}

/** The knight's token: the one the Use was made from, else the first on the viewed scene. */
function knightToken(actor, source = null) {
  const scene = (source?.sceneId ? game.scenes?.get(source.sceneId) : null) ?? canvas?.scene ?? null;
  const token = (source?.tokenId && scene?.tokens?.get(source.tokenId)) || scene?.tokens?.find?.(tk => tk.actor === actor || tk.actorId === actor?.id) || null;
  return scene && token ? { scene, token } : null;
}

/** Whether a token's creature is a corpse (`rules/raise.mjs#isCorpse`). */
function corpseToken(token) {
  const actor = token?.actor ?? null;
  if (!actor) return false;
  const dead = actor.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") === true || token.combatant?.isDefeated === true;
  return isCorpse({ dead, npc: actor.type === "npc", health: actor.system?.health?.value ?? null, raised: bondOf(actor)?.kind === "raised" });
}

/**
 * **THE CORPSES ON A SCENE, AS ONE RAISE READS THEM**: every corpse token, its distance from the
 * knight's token (footprint to footprint, D-732), what it was and its mark, and why it may not
 * rise for this raise - sorted by distance, then name, then id, so the chooser never reorders.
 *
 * **SYNCHRONOUS ON PURPOSE** (the F4a review, S2): `feetApart` is handed in, imported by the
 * caller BEFORE it reads, so a GM's handler reads the corpses and claims them with no await
 * between (a second handler could otherwise take one corpse in the gap).
 *
 * @returns {Array<{token: TokenDocument, id: string, name: string, feet: number|null, refusal: string|null}>}
 */
function corpsesFor(actor, row, { scene, from, reach = null, viewer = game.user, feetApart }) {
  const now = game.time?.worldTime ?? 0;
  const out = [];
  for (const token of scene?.tokens ?? []) {
    if (token.id === from?.id || !corpseToken(token)) continue;
    // A token hidden from a player is not on the player's board: neither it nor its name is
    // offered (the F3 review). The GM's handler asks as the asker, never as itself.
    if (token.hidden && viewer?.isGM !== true) continue;
    const victim = token.actor;
    const feet = feetApart(from, token);
    const facts = {
      kind: victim.type === "npc" ? (victim.system?.creatureType ?? null) : "humanoid",
      size: victim.system?.size ?? null,
      feet: Number.isFinite(feet) ? feet : null,
      mark: token.getFlag?.(SCOPE, CORPSE_FLAG) ?? null
    };
    out.push({ token, id: token.id, name: token.name ?? victim.name, feet: facts.feet, refusal: corpseRefusal(facts, row, { knightUuid: actor.uuid, reach, now }) });
  }
  return out.sort((a, b) => (a.feet ?? Infinity) - (b.feet ?? Infinity) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** The corpses chosen, through the one chooser; null where dismissed. */
async function chooseCorpses(item, row, rows) {
  const { chooseOption } = game.system.azeroth.workflows;
  const max = row.corpses.max;
  let ticked = 0;
  const options = rows.map(r => {
    const open = !r.refusal;
    const checked = open && max > 1 && ticked < max;
    if (checked) ticked += 1;
    return {
      key: r.id, available: open, checked,
      name: t("AZEROTH.Raise.Corpse", { name: r.name, feet: r.feet ?? "-" }),
      description: r.refusal ? `<p>${t(`AZEROTH.Raise.Refuse.${r.refusal}`, { name: r.name, spell: item.name })}</p>` : ""
    };
  });
  const prompt = t(max > 1 ? "AZEROTH.Raise.PromptMany" : "AZEROTH.Raise.Prompt", { name: item.name, entry: row.entry, min: row.corpses.min, max });
  const picked = await chooseOption(item, options, null, { prompt, max });
  if (!picked) return null;
  return (Array.isArray(picked) ? picked : [picked]).map(o => o.key);
}

/**
 * **A RAISE, JUDGED BEFORE ANYTHING IS PAID** (D-768's order): every refusal said in words and
 * null, or the plan `raiseDead` makes.
 *
 * @param {Actor} actor  the knight
 * @param {Item} item    the spell or the feature
 * @param {{key: string, source?: object|null}} o
 * @returns {Promise<{key: string, sceneId: string, tokenId: string, corpses: string[], name: string}|null>}
 */
export async function judgeRaise(actor, item, { key, source = null } = {}) {
  const row = raiseOf(key);
  if (!row) return null;
  const refuse = (k, data = {}) => {
    ui.notifications?.warn(t(`AZEROTH.Raise.Refuse.${k}`, { name: actor.name, spell: item.name, entry: row.entry, ...data }));
    return null;
  };
  const capped = raiseCapRefusal(row, { cap: runicPowerCap(actor.system?.abilities?.cha?.mod ?? 0) });
  if (capped) return refuse(capped, { n: row.capAtLeast });
  const site = knightToken(actor, source);
  if (!site) return refuse("noToken");
  // The dead are tokens: only a GM may place one (`TOKEN_CREATE`), so a knight with no GM online
  // is refused here, before the Runic Power, never after it (`rules/gm-writes.mjs`).
  if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("noGM");
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const index = pack ? await pack.getIndex() : null;
  if (!index?.find(e => e.name === row.entry)) return refuse("noEntry");
  const reach = row.feet ?? rangeFeetOf(item.system?.range ?? "");
  const { feetApart } = await import("../canvas/footprints.mjs");
  const rows = corpsesFor(actor, row, { scene: site.scene, from: site.token, reach, feetApart });
  if (!rows.some(r => !r.refusal)) return refuse("noCorpse");
  const ids = await chooseCorpses(item, row, rows);
  if (!ids) return null;
  const tokenById = id => site.scene.tokens.get(id) ?? null;
  const set = raiseSetRefusal(ids, row, (a, b) => feetApart(tokenById(a), tokenById(b)));
  if (set) return refuse(set, { min: row.corpses.min, max: row.corpses.max, feet: row.together ?? 0 });
  // Asked again: the chooser stood open while the board moved.
  const now = corpsesFor(actor, row, { scene: site.scene, from: site.token, reach, feetApart });
  const moved = ids.map(id => now.find(r => r.id === id)).find(r => !r || r.refusal);
  if (moved !== undefined) return refuse(moved?.refusal ?? "noCorpse", { name: moved?.name ?? "" });
  return { key, sceneId: site.scene.id, tokenId: site.token.id, corpses: [...ids].sort(), name: item.name };
}

/**
 * **THE GM-SIDE RAISE** (`RAISE_QUERY`): the asker must own the knight; the corpses are judged
 * again here off the scene as it stands; the earlier raise of the same spell collapses (its
 * carrier deleted, which collapses its dead); then the world actor, the tokens, the corpses'
 * marks and the carrier. Throws with the reason.
 */
// **THE TRUST MODEL** (the final review's finding 4, D-997; O-386): what this handler judges is
// what the world holds - the knight is the asker's, holds the spell or feature and the cap, and
// the corpses may rise. No record of the PAYMENT exists to judge: the raise is asked before the
// spell's card or the Use's card is posted, and the card is written by its author anyway. That a
// cast or a Use was paid is the asker's word, as a card's author is believed elsewhere (O-379).
export async function raiseQueryHandler({ ownerUuid = null, key = null, sceneId = null, tokenId = null, corpses = [], name = "" } = {}, { user = null } = {}) {
  const owner = ownerUuid ? await fromUuid(ownerUuid) : null;
  if (owner?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Bound.NoOwner"));
  if (user && !owner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  const row = raiseOf(key);
  const scene = sceneId ? game.scenes.get(sceneId) : null;
  const from = scene?.tokens?.get(tokenId) ?? null;
  if (!row || !scene || !from) throw new Error(t("AZEROTH.Raise.Refuse.noToken", { name: owner.name }));
  // **THE ASKER'S WORD IS ASKED AGAIN** (the F3 review): the token named as the reach's centre is
  // the knight's own, the knight holds the spell or feature, and the cap a raise needs holds.
  const asked = raiseAskRefusal({
    row, fromActorId: from.actorId ?? null, ownerId: owner.id, key,
    held: owner.items.map(i => i.system?.identifier).filter(Boolean),
    cap: runicPowerCap(owner.system?.abilities?.cha?.mod ?? 0)
  });
  if (asked) throw new Error(t(`AZEROTH.Raise.Refuse.${asked}`, { name: owner.name, spell: name || row.entry, entry: row.entry, n: row.capAtLeast ?? 0 }));
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const found = (await pack?.getIndex())?.find(e => e.name === row.entry) ?? null;
  const entry = found ? await pack.getDocument(found._id) : null;
  if (!entry) throw new Error(t("AZEROTH.Raise.Refuse.noEntry", { entry: row.entry }));
  // The corpses, judged again on this client (a uuid is no permission), as the asker sees them.
  const reach = row.feet ?? rangeFeetOf(owner.items.find(i => i.type === "spell" && i.system?.identifier === key)?.system?.range ?? "");
  // The distance reader is imported BEFORE the corpses are read (the F4a review, S2): from the
  // read to the claim below there is no await, so no second handler can run in between.
  const { feetApart } = await import("../canvas/footprints.mjs");
  const rows = corpsesFor(owner, row, { scene, from, reach, viewer: user ?? game.user, feetApart });
  const ids = [...new Set((corpses ?? []).filter(id => typeof id === "string"))];
  const bad = ids.map(id => rows.find(r => r.id === id)).find(r => !r || r.refusal);
  if (bad !== undefined) throw new Error(t(`AZEROTH.Raise.Refuse.${bad?.refusal ?? "noCorpse"}`, { name: bad?.name ?? "", spell: name, entry: row.entry }));
  const set = raiseSetRefusal(ids, row, (a, b) => feetApart(scene.tokens.get(a), scene.tokens.get(b)));
  if (set) throw new Error(t(`AZEROTH.Raise.Refuse.${set}`, { spell: name, entry: row.entry, min: row.corpses.min, max: row.corpses.max, feet: row.together ?? 0 }));
  // **THE CORPSES ARE TAKEN FIRST** (the F3 review's must-fix): claimed on this client at once,
  // with no await between the judgement and the claim, and then marked `raised`, so a second
  // handler cannot take one corpse. Every write after this is undone where a later one fails, and
  // the earlier raise of the same spell is collapsed LAST, once the new dead stand.
  const taken = ids.find(id => CLAIMED.has(id));
  if (taken) throw new Error(t("AZEROTH.Raise.Refuse.raised", { name: scene.tokens.get(taken)?.name ?? "", spell: name, entry: row.entry }));
  for (const id of ids) CLAIMED.add(id);
  // (The F4b review's note: the mark is not read again here. Nothing awaits between the read above
  // and this claim, so no other handler on this client can have written a mark in between; a mark
  // written by ANOTHER GM client is not seen by `CLAIMED` either - O-376 records that.)
  const before = ids.map(id => ({ id, mark: scene.tokens.get(id)?.getFlag?.(SCOPE, CORPSE_FLAG) ?? null }));
  let made = null;
  try {
    await scene.updateEmbeddedDocuments("Token", ids.map(id => ({ _id: id, [`flags.${SCOPE}.${CORPSE_FLAG}`]: { state: "raised", by: owner.uuid, until: null } })));
    const raiseId = foundry.utils.randomID();
    const count = raisedCount(row, ids.length);
    made = await createBoundActor({ owner, entry, kind: "raised", until: raiseUntil(row), count, sourceName: name || row.entry, raise: key, raiseId });
    const first = scene.tokens.get(ids[0]);
    const at = first ? first.getCenterPoint?.() ?? { x: first.x, y: first.y } : null;
    const placed = await summonQueryHandler({ summonerUuid: owner.uuid, actorUuid: made.uuid, count, at, sceneId: scene.id }, { user: game.user });
    const rounds = raiseRounds(row);
    // The stale carriers are read BEFORE the new one is made, so the new one is never among them.
    const stale = owner.effects.filter(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === key).map(e => e.id);
    await owner.createEmbeddedDocuments("ActiveEffect", [{
      name: t("AZEROTH.Raise.Carrier", { spell: name || row.entry, entry: row.entry, n: count }),
      img: made.img || "icons/svg/skull.svg",
      origin: owner.uuid,
      description: `<p>${t(rounds ? "AZEROTH.Raise.CarrierText" : "AZEROTH.Raise.CarrierLongRest", { entry: row.entry, n: count, rounds: rounds ?? 0 })}</p>`,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      ...(rounds ? (roundsOrClock(owner, rounds) ?? {}) : {}),
      flags: { [SCOPE]: { [RAISE_FLAG]: { raise: key, raiseId, entry: row.entry, count, actorUuid: made.uuid } } }
    }]);
    // **A RECAST COLLAPSES THE LAST** (07 §17: *Casting a raise spell again collapses the creatures
    // that spell raised before*): its carrier deleted, which collapses its dead
    // (`registerBoundHooks`); the new raise carries a new id, so nothing of it is touched. Last,
    // so a placement that fails leaves the earlier raise standing.
    const gone = stale.filter(id => owner.effects.has(id));
    if (gone.length) await owner.deleteEmbeddedDocuments("ActiveEffect", gone);
    // **THE BOND SYNC IS ITS OWN STEP** (the F4a review, S3): by here the new dead stand and the
    // old raise has collapsed through its hook, so a throw from the sync must not reach the undo
    // below, which would unmake the new raise with the old one already gone. Said, not undone.
    try {
      await syncBoundFor(owner);
    } catch (err) {
      console.warn("azeroth-rpg | raise: bond sync", err);
    }
    // The tokens placed, for the card to record what rose (the animation's `risen`, run F5).
    return { count: placed?.count ?? 0, name: made.name, uuid: made.uuid, raiseId, tokenIds: placed?.tokenIds ?? [], sceneId: placed?.sceneId ?? scene.id };
  } catch (err) {
    // Undo what was written: the made dead with their tokens, and the corpses' marks as they were.
    // **WHAT THIS UNDO DOES NOT DO** (the F4b review's note, run F4c): it never restores the
    // earlier raise. The earlier carrier's delete is the last write inside this `try`, so the undo
    // runs on its failure too - the new raise is unmade and the earlier one stands as far as the
    // refused delete left it. Once that delete has succeeded nothing after it can reach here (the
    // bond sync is its own guarded step), so an earlier raise is never collapsed AND undone. Its
    // corpses keep their `raised` mark whatever happens: a corpse that has risen does not rise again.
    if (made && game.actors.has(made.id)) {
      try { await unbindQueryHandler({ uuid: made.uuid }, { user: game.user }); } catch (e) { console.warn("azeroth-rpg | raise undo", e); }
    }
    try {
      await scene.updateEmbeddedDocuments("Token", before.filter(b => scene.tokens.has(b.id)).map(b => ({
        _id: b.id, flags: { [SCOPE]: { [CORPSE_FLAG]: b.mark ?? foundry.data.operators.ForcedDeletion.create() } }
      })));
    } catch (e) {
      console.warn("azeroth-rpg | raise undo", e);
    }
    throw new Error(t("AZEROTH.Raise.Refuse.failed", { spell: name || row.entry, reason: err?.message ?? "" }));
  } finally {
    for (const id of ids) CLAIMED.delete(id);
  }
}

/** The corpses a raise on this GM's client is taking now, by token id (the claim before the mark). */
const CLAIMED = new Set();

/**
 * **THE DEAD RISE** once the raise is paid for (and, for a spell, cast): through the GM's client.
 * Answers the card's lines.
 *
 * @param {Actor} actor
 * @param {object} plan  `judgeRaise`'s
 * @returns {Promise<string[]>}
 */
export async function raiseDead(actor, plan, { onRisen = null, onRefused = null } = {}) {
  if (!plan) return [];
  // The raise carriers this key holds before the ask, so a failed ask can tell whether the dead
  // rose anyway (a query that timed out after the GM made them; finding 2, D-997).
  const carriersNow = () => [...(actor?.effects ?? [])].filter(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === plan.key).map(e => e.id);
  const before = carriersNow();
  try {
    const done = await askGM(RAISE_QUERY, raiseQueryHandler, { ownerUuid: actor.uuid, ...plan });
    // **WHAT ROSE, FOR THE CARD** (run F5): the caller's collector takes the tokens placed, which
    // the card records as its `risen` and the animation layer plays its `rise` on. A failure to
    // collect never undoes the raise.
    if (typeof onRisen === "function" && done?.tokenIds?.length) {
      try { onRisen({ tokenIds: done.tokenIds, sceneId: done.sceneId ?? null }); } catch (err) { console.warn("azeroth-rpg | raise: risen record", err); }
    }
    return [t(done?.count ? "AZEROTH.Raise.Raised" : "AZEROTH.Raise.RaisedNoToken", { name: actor.name, entry: done?.name ?? "", n: done?.count ?? 0, spell: plan.name })];
  } catch (err) {
    ui.notifications?.warn(err.message);
    // **A RAISE REFUSED ON THE GM'S CLIENT, AFTER THE PRICE** (the final review's finding 2,
    // D-997): the asker judged it before paying (D-768), but a second knight's claim on the same
    // corpse, or a placement that failed, is only seen there. Where nothing rose, the caller gives
    // the price back (`refundRefusedRaise`) and the card says so.
    if (typeof onRefused === "function" && !raiseRoseAnyway(before, carriersNow())) {
      try { await onRefused(err); } catch (e) { console.warn("azeroth-rpg | raise: refund", e); }
    }
    return [err.message];
  }
}

/**
 * **WHAT A REFUSED RAISE GIVES BACK** (finding 2, D-997): the price paid in the pool it was paid
 * from, through the pool door - a Runic Power rise names the `refund` door
 * (`rules/runes.mjs#RUNIC_GAIN_SOURCES`) - never past the pool's top. The card's line, in words.
 *
 * @param {Actor} actor
 * @param {{pool?: {itemId?: string|null, kind: string, name: string}|null, amount?: number, spell?: string, useKept?: boolean}} o
 * @returns {Promise<string[]>}
 */
export async function refundRefusedRaise(actor, { pool = null, amount = 0, spell = "", useKept = false } = {}) {
  const lines = [];
  const now = pool ? ((actor?.poolSnapshot?.() ?? []).find(p => (p.itemId ?? null) === (pool.itemId ?? null) && p.kind === pool.kind && p.name === pool.name) ?? null) : null;
  const value = now ? refundedValue(now, amount) : null;
  const back = now ? Math.max(0, value - (Math.trunc(Number(now.value)) || 0)) : 0;
  if (back > 0) await actor.updatePool({ itemId: now.itemId ?? null, kind: now.kind, value }, {}, { runicGain: "refund" });
  lines.push(back > 0
    ? t("AZEROTH.Raise.Refunded", { spell, name: actor.name, n: back, pool: game.i18n.localize(AZEROTH.poolTypes?.[now.name] ?? now.name) })
    : t("AZEROTH.Raise.RefundedNone", { spell, name: actor.name }));
  if (useKept) lines.push(t("AZEROTH.Raise.UseKept", { spell }));
  return lines;
}

/** The raises in flight on this client, so one carrier's deletion collapses its dead once. */
const COLLAPSING = new Set();

/**
 * **A RAISE COLLAPSES** (07 §17: *The dead it raises collapse when its duration ends*): every
 * world actor whose bond names this raise, deleted with its tokens through the called creature's
 * path (`unbindQueryHandler`). The active GM's alone (`registerBoundHooks`).
 *
 * @param {string} raiseId
 */
export async function collapseRaise(raiseId) {
  if (!raiseId || COLLAPSING.has(raiseId)) return 0;
  COLLAPSING.add(raiseId);
  try {
    let n = 0;
    for (const a of game.actors.filter(x => bondOf(x)?.kind === "raised" && bondOf(x)?.raiseId === raiseId)) {
      if (!game.actors.has(a.id)) continue;
      await unbindQueryHandler({ uuid: a.uuid }, { user: game.user });
      n += 1;
    }
    return n;
  } finally {
    COLLAPSING.delete(raiseId);
  }
}

/**
 * **THE LAST OF A RAISE GONE TAKES ITS CARRIER** (a raised dead deleted by hand, or by the Long
 * Rest's release): once no world actor carries the raise, its carrier on the knight goes too.
 *
 * @param {{ownerUuid: string, raiseId: string}} bond
 */
export async function dropEmptyCarrier(bond) {
  if (!bond?.raiseId || COLLAPSING.has(bond.raiseId)) return;
  if (game.actors.some(a => bondOf(a)?.raiseId === bond.raiseId)) return;
  let owner = null;
  try {
    owner = fromUuidSync(bond.ownerUuid);
  } catch {
    owner = null;
  }
  const ids = (owner?.effects ?? []).filter(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raiseId === bond.raiseId).map(e => e.id);
  if (ids.length && owner?.isOwner) await owner.deleteEmbeddedDocuments("ActiveEffect", ids);
}

/**
 * **A SCENE DELETED TAKES ITS RAISED DEAD WITH IT** (the F3 review): core deletes a scene's tokens
 * with it and leaves their world actor, so a raise whose dead stood only there would stand with no
 * token until its clock. Every raise none of whose dead keeps a token on a remaining scene
 * collapses: its carrier deleted where the knight holds one (the hook collapses the dead), else
 * the dead collapsed here. The active GM's alone (`registerBoundHooks`).
 *
 * Only a raise that had a dead on the deleted scene is asked: a raise whose tokens were never
 * placed (*Place its tokens by hand*) is not stranded by another scene going.
 *
 * @param {Scene} gone  the scene deleted (its object still holds its tokens on the client)
 * @returns {Promise<number>}  how many raises collapsed
 */
export async function collapseStranded(gone) {
  const goneSceneId = gone?.id ?? null;
  const there = new Set((gone?.tokens ?? []).map(tk => tk.actorId).filter(Boolean));
  const raised = game.actors.filter(a => bondOf(a)?.kind === "raised" && bondOf(a)?.raiseId && there.has(a.id));
  const held = raised.map(a => ({
    raiseId: bondOf(a).raiseId,
    scenes: game.scenes.filter(s => s.id !== goneSceneId && s.tokens.some(tk => tk.actorId === a.id)).map(s => s.id)
  }));
  let n = 0;
  for (const raiseId of strandedRaises(held)) {
    const bond = bondOf(raised.find(a => bondOf(a).raiseId === raiseId));
    let owner = null;
    try { owner = bond?.ownerUuid ? fromUuidSync(bond.ownerUuid) : null; } catch { owner = null; }
    const ids = (owner?.effects ?? []).filter(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raiseId === raiseId).map(e => e.id);
    if (ids.length) await owner.deleteEmbeddedDocuments("ActiveEffect", ids);
    else await collapseRaise(raiseId);
    n += 1;
  }
  return n;
}

/* -------------------------------------------- */
/*  The corpses' marks                           */
/* -------------------------------------------- */

/**
 * **A SPELL THAT MARKS A CORPSE, JUDGED BEFORE IT IS PAID**: Corpse Burst, Stay the Rot, Seal the
 * Soul - one corpse within the spell's Range, chosen through the one chooser. Null where the
 * spell marks none (it is not one of them), `false` where it is refused, else the plan.
 *
 * @returns {Promise<{key: string, sceneId: string, corpse: string, name: string}|false|null>}
 */
export async function judgeCorpseMark(actor, item, { source = null } = {}) {
  const key = item?.system?.identifier ?? "";
  const mark = CORPSE_MARKS[key];
  if (!mark) return null;
  const refuse = k => {
    ui.notifications?.warn(t(`AZEROTH.Raise.Refuse.${k}`, { name: actor.name, spell: item.name }));
    return false;
  };
  const site = knightToken(actor, source);
  if (!site) return refuse("noToken");
  if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("noGM");
  const { feetApart } = await import("../canvas/footprints.mjs");
  const rows = markRows(actor, item, mark, { scene: site.scene, from: site.token, feetApart });
  if (!rows.some(r => !r.refusal)) return refuse("noCorpse");
  const ids = await chooseCorpses(item, MARK_ROW(item.name), rows);
  if (!ids?.length) return false;
  return { key, sceneId: site.scene.id, tokenId: site.token.id, corpse: ids[0], name: item.name };
}

/** The one-corpse row a marking spell is judged as. */
const MARK_ROW = name => ({ corpses: { min: 1, max: 1 }, kinds: null, minSize: null, entry: name });

/**
 * The corpses a marking spell may take, with the mark's own refusal mapping
 * (`rules/raise.mjs#corpseMarkRefusal`): the asker's door and the GM's handler read the one list.
 */
function markRows(actor, item, mark, { scene, from, viewer = game.user, feetApart }) {
  return corpsesFor(actor, MARK_ROW(item?.name ?? ""), { scene, from, reach: rangeFeetOf(item?.system?.range ?? ""), viewer, feetApart })
    .map(r => ({ ...r, refusal: corpseMarkRefusal(r.refusal, mark.state) }));
}

/**
 * The GM-side mark (`CORPSE_QUERY`): the asker must own the knight and hold the spell; the corpse
 * is judged again here off the scene as it stands, with the asker's own door's refusals (the F3
 * review: a stale or forged payload cannot write over a `destroyed`, another knight's `kept`, a
 * `sealed` or a live `raised` mark); the mark is the spell's, read here.
 */
// The same trust model as the raise's (O-386): the cast's payment is the asker's word.
export async function corpseQueryHandler({ ownerUuid = null, key = null, sceneId = null, tokenId = null, corpse = null } = {}, { user = null } = {}) {
  const owner = ownerUuid ? await fromUuid(ownerUuid) : null;
  if (owner?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Bound.NoOwner"));
  if (user && !owner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  const mark = CORPSE_MARKS[key];
  const scene = game.scenes.get(sceneId) ?? null;
  const token = scene?.tokens?.get(corpse) ?? null;
  if (!mark || !token || !corpseToken(token)) throw new Error(t("AZEROTH.Raise.Refuse.noCorpse", { name: owner.name }));
  const item = owner.items.find(i => i.type === "spell" && i.system?.identifier === key) ?? null;
  if (!item) throw new Error(t("AZEROTH.Raise.Refuse.notHeld", { name: owner.name, spell: key }));
  const from = scene.tokens.get(tokenId) ?? null;
  if (!from || from.actorId !== owner.id) throw new Error(t("AZEROTH.Raise.Refuse.notKnight", { name: owner.name }));
  const { feetApart } = await import("../canvas/footprints.mjs");
  // From the read to the claim there is no await (the F4a review, S2): a raise taking this corpse
  // on this client holds it in `CLAIMED`, and a mark on it wins over a raise that reads it later.
  const judged = markRows(owner, item, mark, { scene, from, viewer: user ?? game.user, feetApart }).find(r => r.id === corpse) ?? null;
  if (!judged || judged.refusal) throw new Error(t(`AZEROTH.Raise.Refuse.${judged?.refusal ?? "noCorpse"}`, { name: judged?.name ?? token.name ?? owner.name, spell: item.name }));
  if (CLAIMED.has(corpse)) throw new Error(t("AZEROTH.Raise.Refuse.raised", { name: token.name ?? "", spell: item.name, entry: "" }));
  CLAIMED.add(corpse);
  try {
    const now = game.time?.worldTime ?? 0;
    await token.update({ [`flags.${SCOPE}.${CORPSE_FLAG}`]: { state: mark.state, by: owner.uuid, until: mark.seconds ? now + mark.seconds : null } });
  } finally {
    CLAIMED.delete(corpse);
  }
  return { name: token.name, state: mark.state };
}

/** The mark laid once the spell is cast; the card's line. */
export async function markCorpse(actor, plan) {
  if (!plan) return [];
  try {
    const done = await askGM(CORPSE_QUERY, corpseQueryHandler, { ownerUuid: actor.uuid, ...plan });
    return [t(`AZEROTH.Raise.Marked.${done.state}`, { name: done.name, spell: plan.name })];
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [err.message];
  }
}

/* -------------------------------------------- */
/*  Unholy Presence, Army of the Dead, March     */
/* -------------------------------------------- */

/**
 * **WHAT A DEATH KNIGHT'S USE NEEDS BEFORE IT IS PAID** (doors 10 to 12; `useFeature` asks before
 * the budget):
 *
 * - Unholy Presence - *until you end it*: a Use while it stands ENDS it, free, and pays nothing;
 * - Army of the Dead - the raise's own judgement (the corpses within 60 feet, a GM);
 * - March of the Damned - nothing more.
 *
 * @returns {Promise<object|null>}  the plan, or null where the Use stops here
 */
export async function judgeDeathKnightUse(actor, item, { onUse = {}, source = null } = {}) {
  if (onUse.unholyPresence) {
    if (await endStandingPresence(actor)) return null;
    return { kind: "presence" };
  }
  if (onUse.armyOfTheDead) {
    const raise = await judgeRaise(actor, item, { key: "army-of-the-dead", source });
    return raise ? { kind: "army", raise } : null;
  }
  if (onUse.marchOfTheDamned) return { kind: "march" };
  return null;
}

/**
 * **WHAT THE USE DOES ONCE IT IS PAID FOR**: the presence or the march laid on the knight, or the
 * army raised. Answers the card's lines.
 */
export async function landDeathKnightUse(actor, item, plan, { onRisen = null, onRefused = null } = {}) {
  if (!plan) return [];
  if (plan.kind === "army") return raiseDead(actor, plan.raise, { onRisen, onRefused });
  if (plan.kind === "presence") {
    await endPresence(actor, "presence");
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name, img: item.img || "icons/svg/aura.svg", origin: actor.uuid,
      description: item.system?.description ?? "",
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      flags: { [SCOPE]: {
        [PRESENCE_FLAG]: { kind: "presence" },
        // *While your presence lasts, you cannot be Frightened* - the flag both models read.
        [IMMUNE_FLAG]: { conditions: [...UNHOLY_PRESENCE.immune], source: item.name }
      } }
    }]);
    return [t("AZEROTH.DeathKnight.Presence.Laid", { name: actor.name, feet: UNHOLY_PRESENCE.feet, speed: UNHOLY_PRESENCE.speed })];
  }
  if (plan.kind === "march") {
    await endPresence(actor, "march");
    const shadow = marchShadow(actor.system?.abilities?.cha?.mod ?? 0);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: item.name, img: item.img || "icons/svg/aura.svg", origin: actor.uuid,
      description: item.system?.description ?? "",
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      ...(minuteSpan(actor, MARCH_OF_THE_DAMNED.minutes) ?? {}),
      // The Shadow is stamped at the Use (the plan: *half the knight's Charisma modifier, rounded
      // down, stamped at the cast*).
      flags: { [SCOPE]: { [PRESENCE_FLAG]: { kind: "march", shadow } } }
    }]);
    return [t("AZEROTH.DeathKnight.March.Laid", { name: actor.name, feet: MARCH_OF_THE_DAMNED.feet, undead: MARCH_OF_THE_DAMNED.undeadFeet, n: shadow })];
  }
  return [];
}

/**
 * **UNHOLY PRESENCE, *UNTIL YOU END IT*** (door 10): where a presence stands, a Use ends it for
 * nothing and says so; `useFeature` asks this before the price is judged. Whether it ended one.
 */
export async function endStandingPresence(actor) {
  if (!presenceOf([...(actor?.effects ?? [])], "presence")) return false;
  await endPresence(actor, "presence");
  ui.notifications?.info(t("AZEROTH.DeathKnight.Presence.Ended", { name: actor.name }));
  return true;
}

/** End the knight's laid presence or march, where it stands; quiet where nothing does. */
export async function endPresence(actor, kind = "presence") {
  const ids = (actor?.effects ?? []).filter(e => e.flags?.[SCOPE]?.[PRESENCE_FLAG]?.kind === kind).map(e => e.id);
  if (ids.length && actor.isOwner) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return ids.length;
}

/**
 * What a Long Rest ends: the Unholy Presence (*or you finish a Long Rest*), March of the Damned's
 * minute where it still stands, and the rest's one
 * mount working is given back (02's Deathcharger, Charger's Blessing and Ritual of the Steed:
 * *Over a Long Rest*; `rules/mount-works.mjs#MOUNT_WORKED_FLAG`).
 */
export async function endAtLongRest(actor) {
  if (actor?.getFlag?.(SCOPE, MOUNT_WORKED_FLAG) !== undefined && actor.isOwner) await actor.unsetFlag(SCOPE, MOUNT_WORKED_FLAG);
  // **AND THE MARCH** (the F3 review): 02's *for 1 minute* cannot outlast a Long Rest, so a
  // march whose minute the world's clock never counted out ends here too, with its aura.
  const marched = await endPresence(actor, "march");
  return (await endPresence(actor, "presence")) + marched;
}
