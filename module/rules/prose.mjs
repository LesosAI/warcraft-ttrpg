/**
 * Plain prose and the HTML the packs store, both ways. Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * **A TEXT BOX TAKES FREE TYPING AND FORMATS ITSELF ON SUBMIT** (the lead,
 * 2026-09-14: *those fields should not require html `<p>` style formatting.
 * It should just be free type and it format itself after submitted*). Every
 * prose field a pack holds is HTML — `<p>` around each paragraph, `<strong>`
 * and `<em>` inside — because that is what `tools/parse-book/lib/markdown.mjs#html`
 * emits from the chapter, and it is what an enriched field renders. A plain
 * `<textarea>` over such a field therefore shows tags to whoever opens it and
 * stores whatever is typed back verbatim, so a GM either learns to type HTML
 * or the field ends up storing a bare sentence where every pack entry holds a
 * paragraph.
 *
 * The NPC generator solved this first and this pair was written inside
 * `rules/bestiary.mjs` for it; it lives here now because the Forge's Signature
 * box was the one raw-HTML text box left in the system. `bestiary.mjs` still
 * exports both names, so nothing that already imports them moved.
 *
 * The item sheet's own description, effect and Signature editors are
 * `<prose-mirror>` and need none of this — they are rich editors and emit
 * their own HTML.
 */

/**
 * A block tag already present. `htmlFromProse` is IDEMPOTENT over it, so a
 * state that somehow still carries HTML — a caller handing a stored field
 * straight back, a fixture written before the box took prose — is never
 * wrapped a second time into `<p><p>…</p></p>`.
 */
const BLOCK = /<p[\s>]/i;

/**
 * A typed paragraph or two to the HTML the parser stores: paragraphs split
 * on a blank line, `**x**` strong, `*x*` em - `tools/parse-book/lib/markdown.mjs#html`
 * exactly, so a creature typed in the generator and one read from 14 are the
 * same shape, and a Signature typed at the Forge bench and one read from 08
 * §20 are too.
 *
 * @param {string} text  what the box holds
 * @returns {string} HTML, or "" for nothing
 */
export function htmlFromProse(text) {
  const written = String(text ?? "");
  // Already HTML: hand it back untouched rather than wrapping it again.
  if (BLOCK.test(written)) return written;
  return written
    .trim()
    .split(/\n{2,}/)
    .map(p => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map(p => p.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>"))
    .map(p => `<p>${p}</p>`)
    .join("");
}

/** The inverse, for a stored block reopened in a box; lossy only for markup the parser never emits. */
export function proseFromHtml(html) {
  return String(html ?? "")
    .replace(/<\/p>\s*<p>/g, "\n\n")
    .replace(/<\/?p>/g, "")
    .replace(/<strong>([^<]*)<\/strong>/g, "**$1**")
    .replace(/<em>([^<]*)<\/em>/g, "*$1*")
    .replace(/<[^>]+>/g, "")
    .trim();
}
