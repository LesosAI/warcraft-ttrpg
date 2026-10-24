/**
 * **THE NEXT MELEE HIT ASKS ITS STRIKER A TEST** (07's Nature's Grasp; the B9a pass, the
 * lead: *"Build the triggers"*). `rules/struck-tests.mjs` is the law; this is the door,
 * on the active GM's client alone - the one client that may write every creature - as
 * an area's entering is (`effects/area-strikes.mjs#enterAreas`).
 *
 * - **A blow lands** (`createChatMessage`): an attack card that hit a creature carrying
 *   the trigger, in melee. The FIRST such card ends the spell - *The spell then ends
 *   whether the Test passed or failed* - by deleting the laid effect, and posts the
 *   striker's own Test card, recording the hit it answers and the effect as it stood. One
 *   blow, one Test; a second blow finds nothing to answer.
 * - **The Test** is the area Test's card and door (`postAreaTest`'s template, purpose
 *   `area`, `areaTestOutcome`): made once by the striker's owner or the GM, recorded on
 *   the card; a failure lands the condition marked so its bearer makes no Opportunity
 *   Attack while it holds (`NO_OPPORTUNITY_FLAG`).
 * - **The hit is withdrawn** (`updateChatMessage`; 06 §6's Parry, 04's Afterimage): the
 *   attack card's row turned into a miss, so the blow hit nobody. The spell is laid again
 *   as it stood, what the Test's failure laid on the striker is taken off, and the Test
 *   card is marked so its press is refused in words (`dice/chat.mjs#areaTestRefusal`).
 *
 * Every pass joins one queue: two cards arriving together are judged one after the other,
 * so two blows cannot both be the next.
 */

import { AZEROTH } from "../config.mjs";
import { STRUCK_OF_FLAG, STRUCK_TEST_FLAG, cleanStruckTest, meleeHitsOf, struckCheck } from "../rules/struck-tests.mjs";
import { checkOutcome, emptyCheck } from "../rules/area-ticks.mjs";
import { isWriter } from "../canvas/sustained-areas.mjs";
import { actorInWorld } from "../canvas/in-world.mjs";

const SCOPE = "azeroth-rpg";

/** The hook fired on the GM's client once a blow's struck Tests are posted, with the card and the count: what a live test waits on. */
export const STRUCK_POSTED_HOOK = "azerothStruckTests";

let QUEUE = Promise.resolve();
/** One pass at a time; a failed pass is said once and lets the next run. */
function serial(task) {
  const run = () => task().catch(err => {
    console.warn("azeroth-rpg | a struck Test did not finish", err);
    return 0;
  });
  QUEUE = QUEUE.then(run, run);
  return QUEUE;
}

/** The creature a card's target row names: its token's actor on the row's scene, else the world actor. */
function actorOfRow(row) {
  const scene = row?.sceneId ? game.scenes?.get(row.sceneId) : null;
  const token = row?.tokenId ? scene?.tokens?.get(row.tokenId) : null;
  return token?.actor ?? (row?.actorId ? game.actors?.get(row.actorId) : null) ?? null;
}

/** The striker's token the card recorded (D-724), on its scene, or null. */
function tokenOfSource(source) {
  if (!source?.tokenId) return null;
  const scene = source.sceneId ? game.scenes?.get(source.sceneId) : (canvas?.scene ?? null);
  return scene?.tokens?.get(source.tokenId) ?? null;
}

/** A condition list in words. */
function conditionWords(ids) {
  return game.i18n.getListFormatter().format(ids.map(id => game.i18n.localize(AZEROTH.conditions?.[id] ?? id)));
}

/**
 * **POST THE STRIKER'S TEST** for one struck creature: the area Test card's template and
 * flags, `trigger: "struck"`, naming the blow it answers and the effect it ended.
 */
async function postStruckTest({ striker, strikerToken, holder, effect, struck, message, index }) {
  const check = struckCheck(struck, emptyCheck());
  if (!check) return null;
  const resilience = game.i18n.localize(AZEROTH.resiliences[check.resilience] ?? check.resilience);
  const failed = checkOutcome(check, { success: false });
  const fail = failed.statuses.length
    ? game.i18n.format(struck.noOpportunity ? "AZEROTH.Struck.FailNoOpportunity" : "AZEROTH.Struck.Fail", { conditions: conditionWords(failed.statuses.map(s => s.id)) })
    : null;
  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate("systems/azeroth-rpg/templates/chat/area-card.hbs", {
    title: struck.spell || effect.name,
    name: striker.name,
    text: game.i18n.format("AZEROTH.AreaTest.Struck", { name: striker.name, holder: holder.name, spell: struck.spell || effect.name, resilience, dc: struck.dc ?? "—" }),
    fail: fail ? game.i18n.format("AZEROTH.AreaTest.OnFail", { outcome: fail }) : null,
    pass: game.i18n.localize("AZEROTH.Struck.Pass"),
    testLabel: game.i18n.format("AZEROTH.Card.ResistTest", { resilience, dc: struck.dc ?? "—" }),
    actorUuid: striker.uuid,
    resilience: check.resilience,
    dc: struck.dc,
    against: failed.statuses.map(s => s.id).join(",")
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: striker, token: strikerToken ?? undefined }),
    content,
    flags: { [SCOPE]: {
      kind: "areaTest",
      area: {
        sceneId: strikerToken?.parent?.id ?? null, regionId: null, cast: struck.cast ?? null,
        caster: struck.caster ?? null, source: null,
        spell: { name: struck.spell || effect.name, school: null, tier: null, takesSpellpower: false, img: effect.img ?? null },
        dc: struck.dc, trigger: "struck",
        check, actorUuid: striker.uuid, tokenId: strikerToken?.id ?? null,
        escape: null, slowing: null,
        // **THE BLOW IT ANSWERS AND THE SPELL IT ENDED** (the B9a pass): a hit turned into
        // a miss lays the spell again as it stood and refuses this card's press.
        struck: {
          messageId: message.id, index, holder: holder.uuid,
          noOpportunity: struck.noOpportunity === true,
          effect: effect.toObject()
        }
      }
    } }
  });
}

/**
 * **A BLOW LANDS**: every row of an attack card hit in melee whose creature carries a
 * struck Test, each the first - the trigger is gone the moment it is answered.
 *
 * @param {ChatMessage} message
 * @returns {Promise<number>} how many Tests were posted
 */
export function struckOnBlow(message) {
  return serial(async () => {
    if (!isWriter()) return 0;
    const flags = message?.flags?.[SCOPE] ?? null;
    const hits = meleeHitsOf(flags);
    if (!hits.length) return 0;
    const striker = ChatMessage.getSpeakerActor(message.speaker);
    if (!striker || !actorInWorld(striker)) return 0;
    const strikerToken = tokenOfSource(flags.source ?? null);
    let posted = 0;
    for (const index of hits) {
      const holder = actorOfRow(flags.targets?.[index] ?? null);
      if (!holder || holder.uuid === striker.uuid || !actorInWorld(holder)) continue;
      const effect = (holder.effects?.contents ?? []).find(e => e.active !== false && cleanStruckTest(e.flags?.[SCOPE]?.[STRUCK_TEST_FLAG] ?? null));
      if (!effect) continue;
      const struck = cleanStruckTest(effect.flags[SCOPE][STRUCK_TEST_FLAG]);
      // *The spell then ends whether the Test passed or failed*: the blow that asks it ends it.
      const card = await postStruckTest({ striker, strikerToken, holder, effect, struck, message, index });
      if (!card) continue;
      if (holder.effects.has(effect.id)) await holder.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      posted++;
    }
    Hooks.callAll(STRUCK_POSTED_HOOK, message, posted);
    return posted;
  });
}

/**
 * **A HIT TURNED INTO A MISS** (door 13): every struck Test card a withdrawn row of this
 * attack card posted, settled once - the spell laid again on its holder as it stood
 * (unless the holder has cast it again since), what the Test's failure laid on the
 * striker taken off, and the card marked so its press is refused in words.
 *
 * @param {ChatMessage} message  the attack card
 * @returns {Promise<number>} how many were settled
 */
export function struckWithdrawn(message) {
  return serial(async () => {
    if (!isWriter()) return 0;
    const rows = message?.flags?.[SCOPE]?.damageByTarget ?? [];
    if (!Array.isArray(rows) || !rows.some(r => r?.withdrawn === true)) return 0;
    let settled = 0;
    for (const card of game.messages ?? []) {
      const area = card.flags?.[SCOPE]?.area ?? null;
      const struck = area?.trigger === "struck" ? area.struck ?? null : null;
      if (!struck || struck.messageId !== message.id || struck.undone === true) continue;
      if (rows[struck.index]?.withdrawn !== true) continue;
      const holder = struck.holder ? fromUuidSync(struck.holder) : null;
      const again = holder?.effects?.some?.(e => cleanStruckTest(e.flags?.[SCOPE]?.[STRUCK_TEST_FLAG] ?? null)) === true;
      if (holder && actorInWorld(holder) && !again && struck.effect) {
        const data = foundry.utils.deepClone(struck.effect);
        delete data._id;
        await holder.createEmbeddedDocuments("ActiveEffect", [data]);
      }
      const striker = area.actorUuid ? fromUuidSync(area.actorUuid) : null;
      const laid = (striker?.effects?.contents ?? []).filter(e => e.flags?.[SCOPE]?.[STRUCK_OF_FLAG] === card.id).map(e => e.id);
      if (laid.length && actorInWorld(striker)) await striker.deleteEmbeddedDocuments("ActiveEffect", laid);
      await card.update({ [`flags.${SCOPE}.area.struck.undone`]: true });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: holder ?? undefined }),
        content: `<p class="azeroth-drain">${game.i18n.format("AZEROTH.Struck.Undone", { name: striker?.name ?? "", holder: holder?.name ?? "", spell: area.spell?.name ?? "" })}</p>`,
        flags: { [SCOPE]: { kind: "tick" } }
      });
      settled++;
    }
    return settled;
  });
}

/** The hooks, registered at `init`; each acts on the active GM's client alone. */
export function registerStruckTestHooks() {
  Hooks.on("createChatMessage", message => {
    if (!isWriter() || message?.flags?.[SCOPE]?.kind !== "attack") return;
    struckOnBlow(message).catch(() => 0);
  });
  Hooks.on("updateChatMessage", (message, changed) => {
    if (!isWriter() || message?.flags?.[SCOPE]?.kind !== "attack") return;
    if (!foundry.utils.hasProperty(changed ?? {}, `flags.${SCOPE}.damageByTarget`)) return;
    struckWithdrawn(message).catch(() => 0);
  });
}
