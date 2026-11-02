import { enslaveMinuteDue } from '../rules/enslave-clock.mjs';
import { sustainedSpellLive } from './sustained-spells.mjs';
let running = null;
const warned = new WeakSet();
const writer = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
export async function resolveEnslaveMinutes() {
  if (!writer()) return;
  if (running) return running;
  running = Promise.resolve().then(async () => {
    const actors = new Map([...(game.actors?.values() ?? [])].map(actor => [actor.uuid, actor]));
    for (const scene of game.scenes?.values() ?? []) for (const token of scene.tokens?.values() ?? [])
      if (token.actor) actors.set(token.actor.uuid, token.actor);
    const { dominationOrderSave } = await import('../applications/domination-orders.mjs');
    for (const actor of actors.values()) for (const effect of [...actor.effects.values()]) {
      while (writer() && actor.effects.get(effect.id) === effect && !effect.disabled && effect.active !== false && sustainedSpellLive(effect)) {
        const flags = effect.flags?.['azeroth-rpg'];
        if (flags?.identifier === 'enslave-demon' && !Number.isFinite(flags.enslaveNextSave) && !warned.has(effect)) {
          warned.add(effect);
          ui.notifications?.warn(game.i18n.format('AZEROTH.DominationOrder.MissingClock', { name: actor.name }));
        }
        const dueAt = enslaveMinuteDue(effect.flags?.['azeroth-rpg'], game.time?.worldTime);
        if (dueAt === null) break;
        const result = await dominationOrderSave(actor, effect, { reason: 'minute', dueAt });
        if (!result || effect.flags?.['azeroth-rpg']?.enslaveNextSave === dueAt) break;
      }
    }
  });
  try { return await running; } finally { running = null; }
}
export function registerEnslaveClock() {
  const run = () => { void resolveEnslaveMinutes().catch(error => {
    console.warn('azeroth-rpg | Enslave Demon clock', error);
    ui.notifications?.warn(game.i18n.localize('AZEROTH.DominationOrder.Pending'));
  }); };
  Hooks.on('updateWorldTime', run); Hooks.on('updateUser', run); Hooks.once('ready', run);
}
