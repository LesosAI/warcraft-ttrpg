/** All Ancient specials update the same creatureAbilities array. Share both
 * source and target locks across their GM handlers, including pending menus. */
export const ancientSpecialBusy = new Set();
