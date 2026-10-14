/**
 * The system's user queries (D-643): a write a player needs the GM's client
 * to make goes through v14's `User#query`, registered on `CONFIG.queries`
 * under the system's prefix. Nothing here uses `game.socket` directly.
 */

import { ADOPT_QUERY, BIND_QUERY, UNBIND_QUERY, adoptQueryHandler, bindQueryHandler, unbindQueryHandler } from "./documents/bound.mjs";
import { SUMMON_QUERY, summonQueryHandler } from "./documents/summon.mjs";
import { PLANT_TOTEM_QUERY, plantTotemQueryHandler } from "./documents/totems.mjs";
import { LAY_BANE_QUERY, LAY_BOON_QUERY, layBaneQueryHandler, layBoonQueryHandler } from "./effects/banes.mjs";
import { NO_HEALING_QUERY, noHealingQueryHandler } from "./effects/no-healing.mjs";
import { BEACON_HEAL_QUERY, beaconHealQueryHandler } from "./effects/beacon.mjs";
import { VENGEANCE_QUERY, vengeanceQueryHandler } from "./effects/after-blow.mjs";
import { INFLICT_QUERY, inflictQueryHandler } from "./effects/inflict.mjs";
import { ANNOTATE_QUERY, annotateQueryHandler } from "./dice/annotate.mjs";
import { CLAIM_LOOT_QUERY, claimLootQueryHandler } from "./documents/loot-offer.mjs";
import { END_TICK_QUERY, LAY_POISON_QUERY, endTickQueryHandler, layPoisonQueryHandler } from "./effects/ticks.mjs";
import { LOSE_REACTION_QUERY, loseReactionQueryHandler } from "./effects/reaction-loss.mjs";
import { SPEED_DROP_QUERY, speedDropQueryHandler } from "./effects/speed-drop.mjs";
import { SHARE_HEAL_QUERY, shareHealQueryHandler } from "./effects/symbiosis.mjs";
import { WARD_QUERY, wardQueryHandler } from "./effects/wards.mjs";
import { GIFT_QUERY, giftQueryHandler } from "./effects/gifts.mjs";
import { CARD_PRESS_QUERY, cardPressQueryHandler } from "./effects/card-presses.mjs";
import { STEAL_SUSTAIN_QUERY, stealSustainQueryHandler } from "./effects/sustain-steal.mjs";
import { SOUL_SWAP_QUERY, soulSwapQueryHandler } from "./effects/soul-swap.mjs";
import { HAUNT_QUERY, hauntQueryHandler } from "./effects/haunt.mjs";
import { TEMP_HEALTH_QUERY, temporaryHealthQueryHandler } from "./effects/temporary-health.mjs";
import { BLOW_ASK_QUERY, BLOW_SHARE_QUERY, blowAskHandler, blowShareQueryHandler } from "./effects/blow-doors.mjs";
import { DISPEL_QUERY, dispelQueryHandler } from "./effects/dispel.mjs";
import { FORCED_QUERY, forcedMoveQueryHandler } from "./effects/forced-movement.mjs";

/** Register at init. */
export function registerQueries() {
  CONFIG.queries[BIND_QUERY] = bindQueryHandler;
  CONFIG.queries[UNBIND_QUERY] = unbindQueryHandler;
  // What a creature's ability calls up (D-691): the tokens are the GM's to
  // create, whoever pressed the card's button.
  CONFIG.queries[SUMMON_QUERY] = summonQueryHandler;
  // A totem planted beside its shaman, with the ground it holds (02 §7,
  // D-708): `TOKEN_CREATE` is an ASSISTANT permission, so a player's totem
  // is placed here.
  CONFIG.queries[PLANT_TOTEM_QUERY] = plantTotemQueryHandler;
  // A Bane laid on somebody else's creature (06 §6's Pummel, D-693): a player
  // cannot write an effect on the GM's caster, and this is the door.
  CONFIG.queries[LAY_BANE_QUERY] = layBaneQueryHandler;
  // A rider's condition landing with the blow (04's Mangle, Rip and Feral
  // Charge, D-770): the card's own Inflict door, run where the target is owned.
  CONFIG.queries[INFLICT_QUERY] = inflictQueryHandler;
  // What a Parry or a Block writes back onto the attacker's card (06 §6,
  // D-720): a player does not own the message and the number on the Apply
  // button has to move.
  CONFIG.queries[ANNOTATE_QUERY] = annotateQueryHandler;
  // A player taking, putting back or passing on a find (D-721): the offer is
  // a WORLD setting, and `SETTINGS_MODIFY` is a GAMEMASTER permission the
  // server enforces, so every claim is written on the designated GM's client.
  CONFIG.queries[CLAIM_LOOT_QUERY] = claimLootQueryHandler;
  // Swiftmend ending a heal over time the druid laid on somebody else's
  // creature, and the heal it gives at once (04, D-771): the creature is the
  // GM's or another player's, so both writes are made on the GM's client.
  CONFIG.queries[END_TICK_QUERY] = endTickQueryHandler;
  // Symbiosis's share of a heal, landing on a partner this client does not own
  // (04, D-771).
  CONFIG.queries[SHARE_HEAL_QUERY] = shareHealQueryHandler;
  // The Warrior's and the Paladin's (D-772): Blessing's Boon on somebody else's
  // creature, Mortal Strike's mark on the creature struck, and Beacon's share of
  // a heal landing on a chosen creature this client does not own.
  CONFIG.queries[LAY_BOON_QUERY] = layBoonQueryHandler;
  CONFIG.queries[NO_HEALING_QUERY] = noHealingQueryHandler;
  CONFIG.queries[BEACON_HEAL_QUERY] = beaconHealQueryHandler;
  // A Vengeance holder another user owns (the architect's review of D-772).
  CONFIG.queries[VENGEANCE_QUERY] = vengeanceQueryHandler;
  // The Ranger's and the Rogue's (D-773): a Reaction taken from a creature the
  // striker does not own (Concussive Shot, Waylay, Paralytic) through the
  // combatant's own queued door, a Speed dropped on one (Wing Clip), and a
  // poison landing with no Test (Coated Blades at rank 2).
  CONFIG.queries[LOSE_REACTION_QUERY] = loseReactionQueryHandler;
  CONFIG.queries[SPEED_DROP_QUERY] = speedDropQueryHandler;
  CONFIG.queries[LAY_POISON_QUERY] = layPoisonQueryHandler;
  // The Priest's and the Shaman's (D-774): 02's Ward laid on a creature the priest
  // does not own and Absorption's Mana back to a priest the striker's client does
  // not own; Hymn of Hope's Mana and Undying Spirit's friend stood up at 1 Health.
  CONFIG.queries[WARD_QUERY] = wardQueryHandler;
  CONFIG.queries[GIFT_QUERY] = giftQueryHandler;
  // A card's talent button pressed by an owner of the speaker who did not post
  // the card (the architect's review of D-774): the press recorded on the GM's client.
  CONFIG.queries[CARD_PRESS_QUERY] = cardPressQueryHandler;
  // The Mage's and the Warlock's (D-775): Spellsteal ending a Sustain somebody
  // else's creature holds, Soul Swap and Haunt moving and raising what the warlock
  // laid on a creature this client does not own, and Command Demon binding the
  // GM's demon until the warlock's next Long Rest.
  CONFIG.queries[STEAL_SUSTAIN_QUERY] = stealSustainQueryHandler;
  CONFIG.queries[SOUL_SWAP_QUERY] = soulSwapQueryHandler;
  CONFIG.queries[HAUNT_QUERY] = hauntQueryHandler;
  CONFIG.queries[ADOPT_QUERY] = adoptQueryHandler;
  // The damage door's rulings (D-777): 02's Rallying Cry's temporary Health on an
  // ally this client does not own; a holder ASKED in the blow - Guardian and
  // Shield of the Righteous taking it, Intervention, Spirit Shell and Guardian
  // Spirit holding a creature at 1 - on whichever client answers for the holder;
  // and a share of a blow Spirit Link Totem divides, on the GM's client.
  CONFIG.queries[TEMP_HEALTH_QUERY] = temporaryHealthQueryHandler;
  CONFIG.queries[BLOW_ASK_QUERY] = blowAskHandler;
  CONFIG.queries[BLOW_SHARE_QUERY] = blowShareQueryHandler;
  // The cross-class rulings (D-778): 02's Dispel ending the effects selected on a
  // creature this client does not own, every id judged again here; and a creature's
  // token pushed or pulled where this client may not write it.
  CONFIG.queries[DISPEL_QUERY] = dispelQueryHandler;
  CONFIG.queries[FORCED_QUERY] = forcedMoveQueryHandler;
}
