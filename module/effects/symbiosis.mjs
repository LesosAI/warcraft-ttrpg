/**
 * **SYMBIOSIS, WHERE IT TOUCHES THE WORLD** (04-TALENTS; D-771).
 * `rules/symbiosis.mjs` is the law; this reads the bonds standing, writes the
 * one a druid names, ends it at the druid's Long Rest, and passes a heal's share
 * on - on this client where it may write the partner, and on the active GM's
 * through `CONFIG.queries` where it may not (never `game.socket`, D-643).
 *
 * The bond is the DRUID's flag: `{partner, name}`. It counts only while the
 * druid still holds a talent whose row `shares` healing, read off the table by
 * identifier, so a point taken back between fights leaves the flag inert until
 * the Long Rest clears it.
 */

import { SYMBIOSIS_FLAG, bondPartners, sharedHeal } from "../rules/symbiosis.mjs";
import { talentEffect } from "../rules/talent-effects.mjs";

/** The query a share for a creature this client does not own goes through. */
export const SHARE_HEAL_QUERY = "azeroth-rpg.shareHeal";

/** The `shares` row a character holds through a taken talent, or null. */
function sharesOf(actor) {
  for (const t of actor?.takenTalents?.() ?? []) {
    const row = talentEffect(t.className, t.identifier, t.race ?? null);
    if (row?.shares?.heal) return row.shares;
  }
  return null;
}

/**
 * Every bond standing: each world character's own flag, where it still holds
 * the talent. Sorted by holder, so the reading is never a coin toss.
 *
 * @returns {Array<{holder: string, partner: string, share: string}>}
 */
export function symbiosisBonds() {
  const out = [];
  for (const actor of globalThis.game?.actors ?? []) {
    if (actor?.type !== "character") continue;
    const flag = actor.getFlag?.("azeroth-rpg", SYMBIOSIS_FLAG) ?? null;
    if (!flag?.partner) continue;
    const shares = sharesOf(actor);
    if (!shares) continue;
    out.push({ holder: actor.uuid, partner: String(flag.partner), share: shares.heal });
  }
  return out.sort((a, b) => a.holder.localeCompare(b.holder));
}

/** Resolve an actor by uuid, quietly. */
function actorAt(uuid) {
  if (!uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  } catch {
    return null;
  }
}

/**
 * **PASS A HEAL'S SHARE ON** (04: *Whenever either of you restores Health, the
 * other restores half as much, rounded down*): `restored` is what LANDED on
 * `actor`. Nothing where it is in no bond or the share comes to nothing.
 *
 * @param {Actor} actor
 * @param {number} restored
 * @returns {Promise<number>}  what the other restored, as far as this client knows
 */
export async function shareHealing(actor, restored) {
  if (!actor || !(Number(restored) > 0)) return 0;
  const bonds = symbiosisBonds();
  if (!bonds.length) return 0;
  let total = 0;
  for (const { uuid, share: kind } of bondPartners(actor.uuid, bonds)) {
    const share = sharedHeal(restored, kind);
    if (share <= 0) continue;
    const other = actorAt(uuid);
    if (!other) continue;
    if (other.isOwner) {
      await other.applyHealing(share, { shared: true });
      total += share;
      continue;
    }
    const gm = game.users?.activeGM ?? null;
    if (!gm) {
      ui.notifications?.warn(game.i18n.format("AZEROTH.Symbiosis.NoGM", { name: other.name }));
      continue;
    }
    try {
      await gm.query(SHARE_HEAL_QUERY, { partnerUuid: other.uuid, healedUuid: actor.uuid, amount: share }, { timeout: 15000 });
      total += share;
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }
  return total;
}

/**
 * The GM-side handler. The asker must own the creature that restored Health -
 * it was their client that wrote it - and the share goes to its bond's other
 * half alone, worked out again here rather than trusted off the request.
 */
export async function shareHealQueryHandler({ partnerUuid = null, healedUuid = null, amount = 0 } = {}, { user = null } = {}) {
  const from = healedUuid ? await fromUuid(healedUuid) : null;
  if (!from || from.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !from.testUserPermission(user, "OWNER")) {
    throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: from.name }));
  }
  const bonded = bondPartners(from.uuid, symbiosisBonds()).find(p => p.uuid === partnerUuid) ?? null;
  if (!bonded) throw new Error(game.i18n.format("AZEROTH.Symbiosis.NoBond", { name: from.name }));
  const partner = await fromUuid(bonded.uuid);
  if (!partner || partner.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const n = Math.max(0, Math.trunc(Number(amount)) || 0);
  if (n > 0) await partner.applyHealing(n, { shared: true });
  return { name: partner.name, amount: n };
}

/**
 * **NAME THE PARTNER** (04: *name a friendly target*): the druid's flag, one
 * bond, replacing any before it. Said in words.
 *
 * @param {Actor} druid
 * @param {Actor} partner
 */
export async function nameSymbiosisPartner(druid, partner) {
  if (!druid || !partner) return null;
  await druid.setFlag("azeroth-rpg", SYMBIOSIS_FLAG, { partner: partner.uuid, name: partner.name });
  ui.notifications?.info(game.i18n.format("AZEROTH.Symbiosis.Named", { name: druid.name, partner: partner.name }));
  return partner;
}

/**
 * **THE BOND ENDS AT THE DRUID'S LONG REST** (04: *The bond lasts until your
 * next Long Rest*). Quiet where there is none.
 *
 * @param {Actor} druid
 */
export async function endSymbiosis(druid) {
  const flag = druid?.getFlag?.("azeroth-rpg", SYMBIOSIS_FLAG) ?? null;
  if (!flag) return false;
  await druid.unsetFlag("azeroth-rpg", SYMBIOSIS_FLAG);
  ui.notifications?.info(game.i18n.format("AZEROTH.Symbiosis.Ended", { name: druid.name, partner: flag.name ?? "" }));
  return true;
}
