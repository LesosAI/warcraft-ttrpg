/**
 * Where a thing came from, for the expanded row (D-622): parts a sheet
 * localizes and joins with a middle dot. Pure: no Foundry imports.
 *
 *  - a class feature: its class and the level it arrived at;
 *  - a race's trait: the race and "trait";
 *  - a racial talent: the race and its tier;
 *  - a class talent: the class, the branch and its tier.
 *
 * Null for anything else - a weapon's or a spell's detail already says.
 * A part is `{text}` to print as it is, or `{key, n}` for the sheet to
 * format as `AZEROTH.Origin.<key>` with the number.
 *
 * @returns {Array<{text?: string, key?: string, n?: number}>|null}
 */
export function originParts({ type, className = "", level = null, race = "", branch = "", tier = null, isTrait = false, isTalentGrant = false } = {}) {
  if (type === "feature") {
    if (isTrait) return [{ text: className }, { key: "Trait" }];
    if (!className) return null;
    // A feature a talent granted (D-642): the class, the branch, "talent".
    if (isTalentGrant) return [{ text: className }, ...(branch ? [{ text: branch }] : []), { key: "Talent" }];
    return [{ text: className }, { key: "Level", n: level ?? 1 }];
  }
  if (type === "talent") {
    if (race) return [{ text: race }, { key: "Tier", n: tier ?? 1 }];
    if (!className) return null;
    return [{ text: className }, ...(branch ? [{ text: branch }] : []), { key: "Tier", n: tier ?? 1 }];
  }
  return null;
}
