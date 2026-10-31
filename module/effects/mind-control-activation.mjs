import {createMindControl} from './mind-control-creation.mjs';

/** Consume the actual initial resistance card on the active GM. Admission and
 * replay protection remain in the coordinator; no client supplies an outcome. */
export function registerMindControlActivation({hooks=globalThis.Hooks,game=globalThis.game,
  create=createMindControl,warn=()=>globalThis.ui?.notifications?.warn(
    game.i18n.localize('AZEROTH.MindControl.ActivationUnresolved'))}={}) {
  hooks.on('createChatMessage',async result=>{
    if (!game?.user?.isGM || game.users?.activeGM!==game.user) return;
    const flags=result?.flags?.['azeroth-rpg'],link=flags?.resistOf;
    if (flags?.kind!=='resilience' || flags.resilience!=='spirit' || link?.index!==0
      || result.rolls?.[0]?.outcome?.success!==false) return;
    const message=game.messages.get(link.messageId);
    if (!message?.flags?.['azeroth-rpg']?.mindControlCast) return;
    try {
      const outcome=await create({message,result,user:result.author});
      if (!outcome?.ok && outcome?.reason!=='resolved') warn(outcome);
    } catch(error) {warn(error);}
  });
}
