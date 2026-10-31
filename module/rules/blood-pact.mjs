/** Blood Pact follows the normal temporary-Health maximum, without the
 * same-source refresh exception used by explicitly replaceable shields.
 */
export const BLOOD_PACT = Object.freeze({ amount: 2, radius: 10, minutes: 1 });
export function bloodPactGrant(temp) {
  if (!Number.isInteger(temp) || temp < 0) return null;
  return { applies: temp < BLOOD_PACT.amount, amount: BLOOD_PACT.amount, held: temp };
}
