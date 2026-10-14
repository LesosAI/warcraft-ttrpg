/**
 * **AN AMOUNT A DESCRIPTOR STATES, READ AT THE MOMENT IT LANDS** (D-770).
 * Pure: no Foundry imports (CLAUDE.md §3).
 *
 * A rider's Bleeding and a tick's amount are written in 04's and 07's own
 * arithmetic: *equal to your rank* is `rank`, Rip's *half the Ferocity spent,
 * rounded down, plus your rank* is `floor(spent/2)+rank`. It is the system's ONE
 * reader of an amount: `class-features.mjs#evaluateAmount`, which read sums of
 * `tier`, `level`, `sl` and `rank` with integer coefficients and could not say
 * *half, rounded down*, is a thin wrapper over this since the D-770 review (item
 * B), keeping only its defaults, and `amounts.test.mjs` holds every amount
 * string in the tables and the packs to the number the old reader gave.
 *
 * The grammar, and nothing beyond it:
 *
 *   expr    := term (("+" | "-") term)*
 *   term    := factor (("*" | "/") factor)*
 *   factor  := integer | name | "floor(" expr ")" | "ceil(" expr ")"
 *            | "(" expr ")" | "-" factor
 *   name    := rank | tier | level | sl | spent | weapon
 *
 * `weapon` is the striker's own Damage Rating - the main-hand weapon's, or 08
 * §7's Unarmed 1 with none (04's Wrath of the Light: *Holy damage at your Damage
 * Rating*; D-772) - which the feature door hands in.
 *
 * **A NAME OUTSIDE THE LIST, A WORD IT DOES NOT KNOW OR A DANGLING OPERATOR
 * READS AS NULL**, never as a guess: a descriptor saying something this cannot
 * read is caught by its census in Node rather than landing a wrong number at
 * the table. A name in the list the caller did not hand in reads 0, because a
 * preview with nothing spent yet is still a preview. No `eval`, no `Function`.
 */

/** The names an amount may use, and what each is. */
export const EXPRESSION_NAMES = Object.freeze(["rank", "tier", "level", "sl", "spent", "weapon"]);

/** The functions an amount may call. Both round toward their own side, as 04 says. */
const FUNCTIONS = Object.freeze({ floor: Math.floor, ceil: Math.ceil });

/** The tokens of an expression, or null where a character is not one of its own. */
function tokens(text) {
  const out = [];
  const s = String(text ?? "").replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const number = /^\d+/.exec(rest);
    if (number) { out.push({ t: "num", v: Number(number[0]) }); i += number[0].length; continue; }
    const word = /^[a-z]+/.exec(rest);
    if (word) { out.push({ t: "word", v: word[0] }); i += word[0].length; continue; }
    if ("+-*/()".includes(s[i])) { out.push({ t: s[i] }); i += 1; continue; }
    return null;
  }
  return out;
}

/**
 * The number an expression comes to, or null where it cannot be read.
 *
 * @param {string|number|null|undefined} expr
 * @param {{rank?: number, tier?: number, level?: number, sl?: number, spent?: number}} [scope]
 * @returns {number|null}
 */
export function evaluateExpression(expr, scope = {}) {
  if (expr === null || expr === undefined || expr === "") return null;
  if (typeof expr === "number") return Number.isFinite(expr) ? expr : null;
  const list = tokens(expr);
  if (!list || !list.length) return null;
  let at = 0;
  const peek = () => list[at] ?? null;
  const take = kind => (peek()?.t === kind ? list[at++] : null);
  const value = name => {
    if (!EXPRESSION_NAMES.includes(name)) return null;
    const n = Number(scope?.[name] ?? 0);
    return Number.isFinite(n) ? n : null;
  };

  function factor() {
    if (take("-")) {
      const v = factor();
      return v === null ? null : -v;
    }
    const num = take("num");
    if (num) return num.v;
    if (take("(")) {
      const v = expression();
      return v !== null && take(")") ? v : null;
    }
    const word = take("word");
    if (!word) return null;
    if (FUNCTIONS[word.v]) {
      if (!take("(")) return null;
      const v = expression();
      return v !== null && take(")") ? FUNCTIONS[word.v](v) : null;
    }
    return value(word.v);
  }

  function term() {
    let v = factor();
    while (v !== null && (peek()?.t === "*" || peek()?.t === "/")) {
      const op = list[at++].t;
      const r = factor();
      if (r === null) return null;
      if (op === "/" && r === 0) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }

  function expression() {
    let v = term();
    while (v !== null && (peek()?.t === "+" || peek()?.t === "-")) {
      const op = list[at++].t;
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const result = expression();
  if (result === null || at !== list.length || !Number.isFinite(result)) return null;
  return result;
}
