import { seductionTimedCommands } from "../rules/seduction.mjs";
import { postPrompt } from "./prompts.mjs";
const pending = new Set();

export async function postTimedSeductionPrompt(actor, effect, message) {
  const valid = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id
    && fromUuidSync(actor.uuid) === actor && fromUuidSync(message.uuid) === message
    && seductionTimedCommands(actor.effects, actor.uuid, game.time?.worldTime).includes(effect);
  if (!valid()) return null;
  const key = `${actor.uuid}:${effect.id}`;
  if (pending.has(key) || effect.flags?.["azeroth-rpg"]?.seductionPrompt) return null;
  pending.add(key);
  try {
    await effect.update({ "flags.azeroth-rpg.seductionPrompt": "posting" });
    if (!valid() || effect.flags?.["azeroth-rpg"]?.seductionPrompt !== "posting") return false;
    const card = await postPrompt(actor, { purpose: "seduction", noTest: true, ownerSees: true, seduction: true,
      effectId: effect.id, title: game.i18n.localize("AZEROTH.Seduction.TimedTitle"),
      text: game.i18n.localize("AZEROTH.Seduction.TimedInstruction"), whisper: message.whisper ?? [], blind: message.blind });
    if (!card?.id) return false;
    if ([...(actor.effects ?? [])].includes(effect))
      await effect.update({ "flags.azeroth-rpg.seductionPrompt": card.id });
    return true;
  } catch { return false; }
  finally { pending.delete(key); }
}
