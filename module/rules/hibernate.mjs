/**
 * **02's HIBERNATE, THE OFFER'S LAW** (the class talent audit's C7, D-1895; its final review). Pure: no
 * Foundry imports (CLAUDE.md §3). The writes are `effects/hibernate.mjs`'s.
 *
 * *Once per Long Rest, you and every ally resting with you take a Short Rest's recovery in ten minutes.*
 * Each ally named is OFFERED the rest on the client that answers for them, so the offer is a request that
 * client must judge: the druid's feature is Hibernate by identifier, its last Use left a record (a ticket and
 * the allies named) once the Use was paid, and each ally takes that ticket's rest once.
 */

/** Hibernate's identifier: the feature the offer is judged against (02's row, slugged by the sync). */
export const HIBERNATE_ID = "hibernate";

/** The flag on the Hibernate feature recording the last Use's offer. */
export const HIBERNATE_OFFER_FLAG = "hibernateOffer";

/** The flag on an ally recording the last offer's ticket it took. */
export const HIBERNATE_TAKEN_FLAG = "hibernateTaken";

/**
 * **WHETHER AN OFFERED REST MAY BE TAKEN**: the feature is Hibernate by identifier, its last Use's record
 * carries this ticket and names this ally, and the ally has not taken this ticket's rest yet. A reason key,
 * or null.
 *
 * @param {{identifier?: string|null, record?: {ticket?: string, allies?: string[]}|null, ticket?: string|null,
 *   allyUuid?: string|null, taken?: string|null}} o
 * @returns {string|null}
 */
export function hibernateRefusal({ identifier = null, record = null, ticket = null, allyUuid = null, taken = null } = {}) {
  if (identifier !== HIBERNATE_ID) return "AZEROTH.Hibernate.Refuse.notHibernate";
  if (!ticket || !record || record.ticket !== ticket || !allyUuid || !(Array.isArray(record.allies) && record.allies.includes(allyUuid))) return "AZEROTH.Hibernate.Refuse.noUse";
  if (taken === ticket) return "AZEROTH.Hibernate.Refuse.taken";
  return null;
}
