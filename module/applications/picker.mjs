/**
 * The in-window picker (D-638): a text input over a list the window drew,
 * filtered in place as the user types, Enter taking the best row still
 * showing.
 *
 * A native `<datalist>` draws its popup at the browser's own size and in the
 * browser's own colours over the window - four hundred catalogue names in a
 * black column taller than the screen, which the lead refused on sight. So
 * no system window carries one. The rows are ordinary list items the
 * template wrote, each carrying `data-search` (its lowercased name) and a
 * `data-action` button that does the picking, so a click and Enter go
 * through the same handler. The term lives in the window's state and is
 * redrawn into the input, which is what keeps the list filtered across a
 * render.
 *
 *   <input data-picker="items" name="itemSearch" value="{{search}}">
 *   <ul data-picker-list="items" [data-picker-typed]>
 *     <li data-search="longsword"> ... <button data-action="creatorAddItem" data-uuid="..."> </li>
 *     <li class="azeroth-picker-none" hidden>Nothing matches.</li>
 *   </ul>
 *
 * `data-picker-typed` keeps every row hidden until something is typed, for a
 * list too long to browse: every spell in 07, every creature in 14.
 */

/** Bind every picker under `root`: filter on input, pick on Enter, and filter once now for a term the render restored. */
export function bindPickers(root) {
  for (const input of root.querySelectorAll("input[data-picker]")) {
    const list = root.querySelector(`[data-picker-list="${input.dataset.picker}"]`);
    if (!list) continue;
    input.addEventListener("input", () => filterPicker(input, list));
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      // The row's pick is the button marked for it where the row carries
      // more than one (an expand before the Add, 2026-09-06), else its first.
      const row = pickRow(list, input.value);
      (row?.querySelector("button[data-picker-pick]") ?? row?.querySelector("button[data-action]"))?.click();
    });
    filterPicker(input, list);
  }
}

/**
 * Show the rows whose `data-search` holds the input's term and hide the
 * rest. An empty term shows every row, or none on a typed-only list; a term
 * that matches nothing shows the list's "nothing matches" row. Returns how
 * many rows show.
 */
export function filterPicker(input, list) {
  const term = input.value.trim().toLowerCase();
  const typedOnly = "pickerTyped" in list.dataset;
  let shown = 0;
  for (const row of list.querySelectorAll("li[data-search]")) {
    const hit = term ? row.dataset.search.includes(term) : !typedOnly;
    row.hidden = !hit;
    if (hit) shown += 1;
  }
  const none = list.querySelector(".azeroth-picker-none");
  if (none) none.hidden = shown > 0 || !term;
  list.hidden = shown === 0 && !term;
  return shown;
}

/** The row Enter takes: the one named exactly, else the first whose name opens on the term, else the first showing. */
export function pickRow(list, value) {
  const term = String(value ?? "").trim().toLowerCase();
  const rows = [...list.querySelectorAll("li[data-search]:not([hidden])")];
  if (!rows.length) return null;
  return rows.find(r => r.dataset.search === term)
    ?? rows.find(r => r.dataset.search.startsWith(term))
    ?? rows[0];
}
