/**
 * Career eligibility (03 §2).
 *
 * Pure functions, no Foundry imports.
 *
 * **03 GATES ON A PRIOR CAREER AND ON NOTHING ELSE.** Every Entry either opens
 * with `Tier N <Career>` — sometimes two, joined by `or` — or is a tier-1
 * entry point that requires no career at all. Read across all fifty-three:
 *
 *   - 37 name a prior career and its tier
 *   - 16 are tier-1 roads anybody may walk onto
 *   - **0 name corruption, faction standing, or character level**
 *
 * That last line matters, because D2's plan expected faction standing and
 * corruption thresholds here and the written chapter has neither. What it has
 * instead is the road: a career is entered from the career below it.
 *
 * **The rest of an Entry is prose and stays prose.** *"and a season in which
 * your post fed, held and settled itself without help from above"* is the GM's
 * call, not a predicate. `isEligible` returns it as `narrative` rather than
 * dropping it, so the sheet can show the table what it still has to satisfy.
 * Pretending to evaluate it would be worse than not checking it.
 */

/** `Tier 2 Blood Guard, and a season in which…` — the machine-readable half. */
const ENTRY_GATE = /^\s*Tier\s+(\d)\s+([^,.]+?)\s*(?:,|\.|$)/i;

/** Two named roads into one career: `Field Surgeon or Grave-Tender`. */
const OR = /\s+or\s+/i;

/**
 * Read an Entry line into the careers it demands and the prose it leaves.
 *
 * @param {string} entry  03 §2's Entry field.
 * @returns {{tier: number|null, careers: string[], narrative: string}}
 */
export function parseEntry(entry) {
  const text = String(entry ?? "").trim();
  const match = text.match(ENTRY_GATE);
  if (!match) return { tier: null, careers: [], narrative: text };

  // A NAMED CAREER MAY CARRY A QUALIFIER. Journeyman reads `Tier 1 Bound
  // Apprentice with the term served out` — one case in thirty-seven, and
  // without this the career name is "Bound Apprentice with the term served
  // out", which matches nothing and makes the whole road unreachable.
  const qualifiers = [];
  const careers = match[2]
    .split(OR)
    .map(name => {
      const [career, ...rest] = name.split(/\s+with\s+/i);
      if (rest.length) qualifiers.push(`with ${rest.join(" with ")}`.trim());
      return career.trim();
    })
    .filter(Boolean);

  // Everything after the gate clause is the part a person judges, and the
  // qualifier belongs with it rather than being dropped: serving out a term is
  // a real requirement, it is just not one this can evaluate.
  const rest = text.slice(match[0].length).replace(/^\s*(and|,)\s*/i, "").trim();
  const narrative = [...qualifiers, rest].filter(Boolean).join(", ");
  return { tier: Number(match[1]), careers, narrative };
}

/** Compare career names ignoring case, punctuation and spacing. */
export function sameCareer(a, b) {
  const flat = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return flat(a) !== "" && flat(a) === flat(b);
}

/**
 * Whether a character may take a career, on the mechanical half alone.
 *
 * **A `true` here is not permission, it is the absence of a mechanical
 * objection.** The narrative clause comes back alongside so the table can weigh
 * it; a sheet that hides it turns a decision the GM owns into a button.
 *
 * @param {object} snapshot           A plain object, so this stays testable.
 * @param {string} [snapshot.current] The career held now.
 * @param {string[]} [snapshot.held]  Every career held, current included.
 * @param {object} career             `{name, system: {tier, entry}}` or `{name, tier, entry}`.
 * @returns {{ok: boolean, reason: string|null, requires: string[], narrative: string}}
 */
export function isEligible(snapshot = {}, career = {}) {
  const system = career.system ?? career;
  const { tier, careers, narrative } = parseEntry(system.entry);

  const held = new Set([
    ...(snapshot.held ?? []),
    ...(snapshot.current ? [snapshot.current] : [])
  ]);

  // A tier-1 road with no named predecessor: anybody may walk onto it.
  //
  // AN UNREADABLE ENTRY IS NOT THE SAME THING. A career whose Entry never
  // loaded parses to no requirements and would come out looking exactly like
  // an open tier-1 road — a green light on a career nobody has qualified for.
  // A blank Entry on a career the book says is above tier 1 is a failure to
  // read, so it says so instead.
  if (!careers.length) {
    const blank = !String(system.entry ?? "").trim();
    if (blank && Number(system.tier) > 1) {
      return { ok: false, reason: "unknown", requires: [], narrative };
    }
    return { ok: true, reason: null, requires: [], narrative };
  }

  const satisfied = careers.some(name => [...held].some(h => sameCareer(h, name)));
  if (!satisfied) {
    return { ok: false, reason: "career", requires: careers, narrative };
  }

  // The Entry names the tier it expects that career to have been at. Where the
  // snapshot knows the tier, hold it to that; where it does not, the named
  // career is enough.
  if (tier !== null && snapshot.tier !== undefined && snapshot.tier < tier) {
    return { ok: false, reason: "tier", requires: careers, narrative };
  }

  return { ok: true, reason: null, requires: careers, narrative };
}

/**
 * The careers reachable from one, as 03's Exits list gives them.
 *
 * **An exit is not always to the next tier up.** 03 carries lateral moves — a
 * Blood Guard exits to Warden of the March at the same tier — and the tier-4
 * careers exit into 15-LEGACIES rather than into another career. Filtering to
 * `tier + 1` drops both, which is a road the graph really has.
 */
export function exitsFrom(career) {
  const system = career?.system ?? career ?? {};
  return (system.exits ?? [])
    .map(exit => (typeof exit === "string" ? exit : exit?.name))
    .filter(Boolean);
}
