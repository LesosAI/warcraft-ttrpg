import { talentEffect } from '../rules/talent-effects.mjs';
import { mindControlCombatLinks } from './mind-control-combat.mjs';

export const KODO_BOND_QUERY = 'azeroth-rpg.kodoBond';
const scope = 'azeroth-rpg', flag = 'kodoBond', busy = new Set();
const words = key => game.i18n.localize(`AZEROTH.KodoBond.${key}`);
export const hasKodoBond = actor => Array.from(actor?.items ?? []).some(item =>
  item.type === 'talent' && item.system?.taken > 0
  && talentEffect(item.system.className, item.system.identifier, item.system.race)?.onUse?.kodoBond);

/** Combine exact existing normal-turn constraints; never make a new turn.
 * A linked actor represented twice is ambiguous, rather than two eligible turns.
 */
export function companionTurnLinks(combat, options = {}) {
  const result = mindControlCombatLinks(combat, options);
  const rows = Array.from(combat?.combatants ?? []);
  for (const actor of new Set(rows.map(row => row.actor).filter(Boolean))) {
    if (!hasKodoBond(actor)) continue;
    const records = actor.getFlag(scope, flag)?.beasts;
    if (!Array.isArray(records)) continue;
    for (const uuid of new Set(records)) {
      const targets = rows.filter(row => row.actor?.uuid === uuid && row.actor.system?.creatureType === 'beast');
      if (!targets.length) continue;
      const handlers = rows.filter(row => row.actor === actor);
      if (handlers.length !== 1 || targets.length !== 1 || handlers[0] === targets[0]) {
        result.issues.push({ actorUuid: actor.uuid, targetUuid: uuid, reason: 'ambiguousKodoBond' });
        continue;
      }
      result.links.push({ casterId: handlers[0].id, targetId: targets[0].id });
    }
  }
  return result;
}

/** Toggle a previously adjudicated month-long relationship, not ownership or
 * Companion capacity. Both actors must already be controlled by the requester.
 */
export async function kodoBondHandler({ actorUuid, itemId, beastUuid, confirmed, remove } = {}, { user } = {}) {
  const originalWriter = game.user;
  const writer = () => game.user === originalWriter && game.user?.isGM && game.users.activeGM === game.user;
  const actor = fromUuidSync(actorUuid), beast = fromUuidSync(beastUuid);
  const item = actor?.items?.get(itemId);
  const talent = actor?.items?.get(item?.getFlag(scope, 'feature')?.talentId);
  const valid = () => writer() && user?.active && game.users.get(user.id) === user
    && fromUuidSync(actorUuid) === actor && fromUuidSync(beastUuid) === beast
    && actor?.type === 'character' && actor !== beast && hasKodoBond(actor)
    && actor.testUserPermission(user, 'OWNER') && beast?.testUserPermission(user, 'OWNER')
    && beast.system?.creatureType === 'beast' && item?.type === 'feature'
    && actor.items.get(itemId) === item
    && talent?.type === 'talent' && talent.system?.taken > 0 && actor.items.get(talent.id) === talent
    && talentEffect(talent.system.className, talent.system.identifier, talent.system.race)?.onUse?.kodoBond;
  if (confirmed !== true || typeof remove !== 'boolean' || !valid() || busy.has(actorUuid)) return { ok: false };
  busy.add(actorUuid);
  try {
    const held = actor.getFlag(scope, flag)?.beasts ?? [];
    if (!Array.isArray(held)) return { ok: false };
    const beasts = remove ? held.filter(uuid => uuid !== beastUuid) : [...new Set([...held, beastUuid])];
    const expectedBeasts = JSON.stringify(beasts);
    const confirmedState = () => valid() && JSON.stringify(actor.getFlag(scope, flag)?.beasts) === expectedBeasts;
    await actor.setFlag(scope, flag, { beasts });
    if (!confirmedState()) return { ok: false, pending: true };
    const { refreshMindControlSchedule } = await import('./mind-control-schedule.mjs');
    for (const combat of game.combats ?? []) {
      if (!confirmedState()) return { ok: false, pending: true };
      if (!combat.started || !Array.from(combat.combatants).some(row => row.actor === actor)) continue;
      if (!(await refreshMindControlSchedule(combat)).ok) return { ok: false, pending: true };
    }
    return confirmedState() ? { ok: true } : { ok: false, pending: true };
  } catch { return { ok: false, pending: true }; }
  finally { busy.delete(actorUuid); }
}

export async function useKodoBond(actor, item) {
  const targets = Array.from(game.user.targets ?? []);
  const beast = targets.length === 1 ? targets[0].actor : null;
  if (!beast || !actor.isOwner || !beast.isOwner || beast.system?.creatureType !== 'beast') {
    ui.notifications?.warn(words('Target')); return null;
  }
  const remove = (actor.getFlag(scope, flag)?.beasts ?? []).includes(beast.uuid);
  const accepted = await foundry.applications.api.DialogV2.confirm({
    window: { title: `${words('Title')} — ${beast.name}` }, content: `<p>${words(remove ? 'Release' : 'Confirm')}</p>`,
    yes: { default: false }, no: { default: true }, rejectClose: false
  });
  if (accepted !== true) return null;
  const data = { actorUuid: actor.uuid, itemId: item.id, beastUuid: beast.uuid, confirmed: true, remove };
  let result;
  try {
    const gm = game.users.activeGM;
    result = gm === game.user ? await kodoBondHandler(data, { user: game.user })
      : await gm?.query(KODO_BOND_QUERY, data, { timeout: 15000 });
  } catch { result = { pending: true }; }
  ui.notifications?.[result?.ok ? 'info' : 'warn'](words(result?.ok ? 'Done' : 'Pending'));
  return result;
}
