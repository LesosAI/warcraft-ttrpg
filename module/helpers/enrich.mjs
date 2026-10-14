/**
 * Enrich prose for display: `@UUID[...]{...}` becomes a content link, inline
 * rolls become buttons, secrets are stripped for a non-owner.
 *
 * Enrichment is async, so it is a module function called while a context is
 * prepared - never a Handlebars helper. Every prose field a template prints
 * with a triple-stash goes through here first; the NPC's abilities, the
 * spell card's effect and the talent card printed raw `@UUID[...]` text for
 * a whole pass because only the item description did (2026-09-02).
 *
 * @param {string|null|undefined} html
 * @param {object} [options]
 * @param {Document|null} [options.relativeTo]  Resolves relative links.
 * @param {boolean} [options.secrets]           Keep secret blocks.
 * @returns {Promise<string>}
 */
export async function enrich(html, { relativeTo = null, secrets = false } = {}) {
  if (html === null || html === undefined || html === "") return "";
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(String(html), { relativeTo, secrets });
}

/** Enrich every string in a list of `{description}` rows into `html`, keeping the rest. */
export async function enrichRows(rows, { relativeTo = null } = {}) {
  return Promise.all((rows ?? []).map(async row => ({
    ...row,
    html: await enrich(row?.description, { relativeTo })
  })));
}
