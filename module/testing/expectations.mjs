/**
 * Expected-content assertions: what the prepared context carries, the DOM
 * must show.
 *
 * `checkNotEmpty` cannot tell a panel that drew nine of ten pools from one
 * that drew ten, and it cannot tell an empty slot that should read `—` from
 * one that was never rendered. A manifest names, per template, what has to be
 * there. Framework-free: a root, a context and a manifest in, findings out.
 *
 * Three rule shapes:
 *
 *   { each: "pools", selector: ".azeroth-pool", text: p => [...strings] }
 *     One matching element per array entry, and each entry's strings present
 *     in the matching element's text (order of elements is the array's).
 *
 *   { absent: "ap.head", selector: ".azeroth-ap-head", dash: "—" }
 *     When the context path is null, the element's text is the dash. When it
 *     is not null, the element's text is NOT the dash.
 *
 *   { omit: "race.talents", reason: "..." }
 *     A deliberate omission, recorded so it does not pass by accident.
 */

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const norm = s => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * @param {Element} root
 * @param {object} context   What `_prepareContext()` returned.
 * @param {object[]} manifest
 * @returns {object[]} findings `{check:"expect", kind, detail}`
 */
export function checkExpectations(root, context, manifest) {
  const findings = [];
  for (const rule of manifest) {
    if (rule.omit) continue;   // recorded, not checked

    if (rule.each) {
      const items = get(context, rule.each);
      if (!Array.isArray(items)) {
        findings.push({ check: "expect", kind: "context", detail: `context.${rule.each} is not an array` });
        continue;
      }
      const els = [...root.querySelectorAll(rule.selector)];
      if (els.length !== items.length) {
        findings.push({
          check: "expect", kind: "count",
          detail: `context.${rule.each} has ${items.length} entries and ${rule.selector} matched ${els.length}`
        });
      }
      items.forEach((item, i) => {
        const el = els[i];
        if (!el) return;
        const want = (rule.text ? rule.text(item, i) : [String(item)]).map(norm).filter(Boolean);
        const have = norm(el.textContent);
        for (const w of want) {
          if (!have.includes(w)) {
            findings.push({
              check: "expect", kind: "text",
              detail: `${rule.selector}[${i}] should show "${w}" from context.${rule.each}[${i}]; shows "${have.slice(0, 60)}"`
            });
          }
        }
      });
      continue;
    }

    if (rule.absent) {
      const value = get(context, rule.absent);
      const el = root.querySelector(rule.selector);
      const dash = rule.dash ?? "—";
      if (!el) {
        findings.push({ check: "expect", kind: "missing", detail: `${rule.selector} is not rendered (context.${rule.absent} = ${JSON.stringify(value)})` });
        continue;
      }
      const have = norm(el.textContent);
      if (value === null || value === undefined) {
        if (have !== dash) findings.push({ check: "expect", kind: "absent", detail: `${rule.selector} should read "${dash}" for an absent context.${rule.absent}; reads "${have.slice(0, 40)}"` });
      } else if (have === dash || have === "") {
        findings.push({ check: "expect", kind: "present", detail: `${rule.selector} reads "${have}" while context.${rule.absent} = ${JSON.stringify(value)}` });
      }
    }
  }
  return findings;
}

/**
 * What a pool row READS, whether or not it is editable.
 *
 * **The count stopped being text** (the lead, 2026-09-13): an editable pool
 * draws a stepper, and its value lives in an `<input>`, which contributes
 * nothing to `textContent`. Three tests read `0 / 10` off the head and would
 * have seen `/ 10`, so this is the one reader all of them use — a fourth copy
 * of the fallback is a fourth place for it to rot.
 *
 * @param {Element|null} head  a `.azeroth-pool-head`, or anything containing one
 * @returns {string} `"3 / 10"`, or the em-dash for a pool nobody holds
 */
export function poolCount(head) {
  if (!head) return "";
  const input = head.querySelector("input.azeroth-pool-value");
  const of = head.querySelector(".azeroth-pool-of");
  if (input && of) return norm(`${input.value} ${of.textContent}`);
  return norm(head.querySelector(".azeroth-pool-count")?.textContent ?? head.textContent);
}

/** What every sheet must never show: an unlocalised key or a stray `undefined`. */
export function checkNoRawKeys(root) {
  const text = root.textContent ?? "";
  const findings = [];
  const m = text.match(/\[\[AZEROTH\.[A-Za-z.]+\]\]|\bAZEROTH\.[A-Z][A-Za-z.]+\b/);
  if (m) findings.push({ check: "expect", kind: "rawkey", detail: `an unlocalised key reached the page: ${m[0]}` });
  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) {
    findings.push({ check: "expect", kind: "garbage", detail: `"undefined", "NaN" or "[object Object]" reached the page` });
  }
  return findings;
}
