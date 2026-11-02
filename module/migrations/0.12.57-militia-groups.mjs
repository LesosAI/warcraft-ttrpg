import { militiaDrillGroups, MILITIA_DRILL_FLAG } from '../rules/militia-drill.mjs';
import { walkWorld } from './walk.mjs';

export function militiaGroupsUpdate(value) {
  if (!value?.id || value.version === 1) return null;
  const groups = militiaDrillGroups(value);
  return groups ? { [`flags.azeroth-rpg.${MILITIA_DRILL_FLAG}`]: { version: 1, groups } } : null;
}

export async function migrate(log = console.log) {
  return walkWorld({ actor: actor => militiaGroupsUpdate(actor.getFlag('azeroth-rpg', MILITIA_DRILL_FLAG)) }, log);
}
