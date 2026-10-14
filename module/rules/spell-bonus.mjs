/**
 * WHAT A CASTER'S STANDING BONUSES ADD TO A SPELL'S DAMAGE (D-756). Pure: no
 * Foundry imports (CLAUDE.md §3).
 *
 * `dice/workflows.mjs#castSpell` added six of these inline, and an area's tick
 * (`AzerothCombat#_areaTicks`) has to add the same six at the START OF A TURN,
 * rounds after the cast - the lead: *standing Holy and spell-damage bonuses
 * add to a tick; the dialog's one-off lines and the Success Level do not.* One
 * function, so the card and the tick cannot disagree about what a caster adds:
 *
 * - **Spellpower** in the damage's school, from tier 3 up (07 §9) - which on
 *   a damage-over-time spell *raises the ongoing damage, not the initial hit*
 * - **Corruption's** Damage Rating (10 §4, §9): on all damage, and on Fel
 * - a **talent** that raises this spell's Damage Rating (the Warlock's *Shadow
 *   Bolt*), as `talent-effects.mjs#spellDamageFor` hands its rows in
 * - a **Signature** scoped to one school's spells (08 §20, D-692), and one
 *   naming this spell (D-698)
 * - the **spell lane** a `final`-phase effect wrote: Seal of Command's Holy for
 *   the encounter, Arcane Power's until the end of the next turn, Demonic
 *   Pact's aura (D-755) - read where the caster stands WHEN IT IS READ
 *
 * **Not** the roll dialog's ticked Damage lines, which are one roll's, and not
 * the Success Level, which never adds to a spell's damage (D-330).
 *
 * @param {object} system  the caster's prepared `system`
 * @param {{name?: string, damageSchool?: string|null, takesSpellpower?: boolean}} spell
 * @param {Array<{name: string, amount: number}>} [talentRows]  `spellDamageFor`'s rows
 * @returns {{total: number, spellpower: number, corruption: number, talents: number,
 *   signatureSchool: number, signatureNamed: number, lane: number}}
 */
export function standingSpellBonus(system = {}, { name = "", damageSchool = null, takesSpellpower = false } = {}, talentRows = []) {
  const s = system && typeof system === "object" ? system : {};
  const n = v => Math.trunc(Number(v) || 0);
  const spellpower = takesSpellpower && damageSchool ? n(s.spellpower?.[damageSchool]) : 0;
  const corruption = corruptionDamageBonus(s, damageSchool);
  const talents = (talentRows ?? []).reduce((sum, t) => sum + n(t?.amount), 0);
  const signatureSchool = damageSchool ? n(s.signatureEffects?.spellDamage?.[damageSchool]) : 0;
  const signatureNamed = name ? n(s.signatureEffects?.empowers?.[name]?.damageRating) : 0;
  const lane = laneBonus(s, "spell", damageSchool);
  return {
    total: spellpower + corruption + talents + signatureSchool + signatureNamed + lane,
    spellpower, corruption, talents, signatureSchool, signatureNamed, lane
  };
}

/**
 * **WHAT A `final`-PHASE EFFECT PUT ON ONE LANE, FOR ONE TYPE** (D-711 phase 2,
 * D-768): `all` plus the type. The derived `system.damageBonus` map is two
 * lanes - an attack and a spell - and one key per damage type; Seal of Command
 * adds to the Holy key of both for the encounter, Arcane Power to the spell
 * lane's Arcane until the end of the next turn, an aura's spell damage to the
 * spell lane. ONE reading for the attack door, the spell door, an area's tick
 * and a class feature: the attack door and the feature door used to read it
 * inline or not at all.
 *
 * A creature's `damageBonus` is a SCALAR (D-643) and has no lanes; it reads 0
 * here, and `attackWithDialog` adds it on its own line.
 *
 * @param {object} system
 * @param {"attack"|"spell"} lane
 * @param {string|null} type  the damage type, `physical` where nothing converted it
 * @returns {number}
 */
export function laneBonus(system = {}, lane = "spell", type = null) {
  const s = system && typeof system === "object" ? system : {};
  const n = v => Math.trunc(Number(v) || 0);
  const map = s.damageBonus && typeof s.damageBonus === "object" ? s.damageBonus[lane] ?? null : null;
  return n(map?.all) + (type ? n(map?.[type]) : 0);
}

/**
 * **WHAT A STANDING EFFECT ADDS TO EVERY BLOW OF A LANE, AS ITS OWN TYPE**
 * (D-777; the lead, 2026-10-03: *"Different damage types in one attack are
 * possible"*): the typed lane `system.damageBonus.typed.<lane>.<type>` - 04's
 * Arcane Power, *your spells add 1 Arcane damage per rank* - as `resolveDamage`'s
 * `extras`, one entry a type that carries anything, in the vocabulary's order.
 * An amount of the blow's own type rides its Rating there (`typedExtras`).
 *
 * ONE reading for the spell door, a casting feature's, an area's tick and a laid
 * tick, as `laneBonus` is for the untyped lanes. A creature's scalar
 * `damageBonus` has no typed lane and reads none.
 *
 * @param {object} system
 * @param {"attack"|"spell"} lane
 * @returns {Array<{type: string, amount: number}>}
 */
export function typedLaneExtras(system = {}, lane = "spell") {
  const s = system && typeof system === "object" ? system : {};
  const map = s.damageBonus && typeof s.damageBonus === "object" ? s.damageBonus.typed?.[lane] ?? null : null;
  if (!map || typeof map !== "object") return [];
  return Object.entries(map)
    .map(([type, n]) => ({ type, amount: Math.max(0, Math.trunc(Number(n) || 0)) }))
    .filter(x => x.amount > 0);
}

/**
 * **CORRUPTION'S DAMAGE RATING** (10 §4, §9): *+1 Damage Rating on all damage
 * you deal*, and the Fel-touched rung's *+1 on Fel damage you deal*.
 *
 * @param {object} system
 * @param {string|null} type
 * @returns {number}
 */
export function corruptionDamageBonus(system = {}, type = null) {
  const s = system && typeof system === "object" ? system : {};
  const n = v => Math.trunc(Number(v) || 0);
  return n(s.damageRatingBonus?.all) + (type ? n(s.damageRatingBonus?.bySchool?.[type]) : 0);
}

/**
 * **WHAT A CHARACTER'S STANDING BONUSES ADD TO A CLASS FEATURE'S DAMAGE**
 * (D-768). `useFeature` added nothing at all: no lane, and not 10's *all damage
 * you deal*, so a Burning Shaman's Forked Lightning dealt what an untouched
 * one's did and Seal of Command's Holy never reached a feature.
 *
 * - the LANE the feature rides (`talent-effects.mjs#featureDamageLane`):
 *   whatever a `final`-phase effect wrote there for this damage type;
 * - Corruption's Damage Rating, which is every damage the character deals.
 *
 * **Not Spellpower** (07 §9 is a spell's, from its tier), **and not a
 * Signature scoped to a school's SPELLS** (08 §20). The lead's ruling that
 * *your spells* talent rows reach a casting feature (*"Yes, casting features
 * count"*, 2026-10-03) arrives through the spell LANE and the dialog's lines;
 * it was not asked about Spellpower or a Signature, and both stay off a feature
 * as built (D-768).
 *
 * @param {object} system
 * @param {{lane?: "attack"|"spell", type?: string|null}} o
 * @returns {{total: number, lane: number, corruption: number}}
 */
export function standingFeatureBonus(system = {}, { lane = "spell", type = null } = {}) {
  const laneN = laneBonus(system, lane, type);
  const corruption = corruptionDamageBonus(system, type);
  return { total: laneN + corruption, lane: laneN, corruption };
}
