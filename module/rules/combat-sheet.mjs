/** Visibility only: showing maneuvers never grants a pool or changes costs. */
export function showsManeuvers(system = {}, forceShow = false) {
  return forceShow === true || (system.momenta ?? []).length > 0;
}
