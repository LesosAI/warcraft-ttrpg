import { SPELL_LOCK_RECEIPTS } from "./spell-lock-state.mjs";
import { SPELL_LOCK_WINDOWS } from "./spell-lock-window.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const busy = new Set();
const escape = text => foundry.utils.escapeHTML(String(text ?? ""));

/** The paid reaction's cue, before the interrupted Casting Test. It announces
 * the Bane, not successful Silence. This function never spends or applies. */
export async function postSpellLockReaction({ actor, caster, claim, source, target } = {}) {
  if (!gmHere() || !actor?.uuid || !caster?.uuid || fromUuidSync(actor.uuid) !== actor
    || fromUuidSync(caster.uuid) !== caster || claim?.reactorUuid !== actor.uuid
    || claim.casterUuid !== caster.uuid || claim.stage !== "paid" || claim.reactionPaid !== true || claim.usePaid !== true) return null;
  const receipts = actor.getFlag("azeroth-rpg", SPELL_LOCK_RECEIPTS);
  if (!Array.isArray(receipts) || !receipts.some(row => same(row, claim))) return null;
  const scene = game.scenes?.get(source?.sceneId);
  if (!scene || target?.sceneId !== scene.id || scene.tokens?.get(source.tokenId)?.actor !== actor
    || scene.tokens?.get(target.tokenId)?.actor !== caster) return null;
  const existing = values(game.messages).find(message => {
    const mark = message.flags?.["azeroth-rpg"]?.spellLockReaction;
    return mark?.castId === claim.castId && mark.reactorUuid === actor.uuid && mark.casterUuid === caster.uuid;
  });
  if (existing) return existing;
  const key = `reaction:${actor.uuid}:${claim.castId}`;
  if (busy.has(key)) return null;
  busy.add(key);
  try {
    return await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Spell Lock</strong></p><p>${escape(actor.name)} spent one Reaction and one Short Rest use. ${escape(caster.name)} takes one Bane on this Casting Test. After the cast resolves, it makes a Spirit Resilience Test at DC 14 to resist Silence.</p>`,
      flags: { "azeroth-rpg": { kind: "ability",
        featureKey: "ability:spell-lock",
        casting: false, success: true,
        source: source ?? null,
        targets: [target], spellLockReaction: { castId: claim.castId, reactorUuid: actor.uuid, casterUuid: caster.uuid } } }
    });
  } finally { busy.delete(key); }
}

/** Report the durable outcome, including immunity, without replaying the
 * activation cue. Missing or uncertain outcomes are never described as done. */
export async function postSpellLockResult({ actor, castId } = {}) {
  if (!gmHere() || !actor?.uuid || fromUuidSync(actor.uuid) !== actor) return null;
  const windows = actor.getFlag("azeroth-rpg", SPELL_LOCK_WINDOWS);
  const record = Array.isArray(windows) ? windows.find(row => row.castId === castId && row.casterUuid === actor.uuid) : null;
  if (record?.stage !== "complete" || !record.aftermath?.length
    || record.aftermath.some(row => row.stage !== "complete" || typeof row.resistancePassed !== "boolean" || typeof row.silenceImmune !== "boolean")) return null;
  const existing = values(game.messages).find(message => {
    const mark = message.flags?.["azeroth-rpg"]?.spellLockResult;
    return mark?.castId === castId && mark.casterUuid === actor.uuid;
  });
  if (existing) return existing;
  const key = `result:${actor.uuid}:${castId}`;
  if (busy.has(key)) return null;
  busy.add(key);
  try {
    const lines = record.aftermath.map(row => {
      const from = escape(fromUuidSync(row.reactorUuid)?.name ?? "Felhunter");
      const result = row.resistancePassed ? "resisted Spell Lock; no Silence was applied."
        : row.silenceImmune ? "is immune to Silence. The Bane already applied to the cast is unchanged."
          : "was Silenced until the end of its next turn (6 seconds outside combat).";
      return `<p>${from}: ${escape(actor.name)} ${result}</p>`;
    });
    return await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>Spell Lock — Result</strong></p>${lines.join("")}`,
      flags: { "azeroth-rpg": { kind: "spellLockResult", spellLockResult: { castId, casterUuid: actor.uuid } } }
    });
  } finally { busy.delete(key); }
}
