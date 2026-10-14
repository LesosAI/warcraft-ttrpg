/**
 * WHAT PLAYS, AND WHAT NEVER DOES (D-728). Pure: no Foundry imports, no bare
 * globals (CLAUDE.md §3, `unbound.test.mjs`).
 *
 * Two questions, and nothing else:
 *
 *  - `plan(record, facts)` - a completed action just happened; what CUE does
 *    this client play for it, if any? A cue is an EVENT: it fires once, on the
 *    client that saw the record arrive, and it is never replayed.
 *  - `loopsFor(state)` - what does the world currently hold, and which LOOPS
 *    does that imply? A loop is STATE: every client works out the same set from
 *    the same world, so every ending - a Sustain dropped by any of its five
 *    paths, an effect deleted or expired, a Region deleted, a token deleted, a
 *    scene changed - ends the loop with no code path of its own.
 *
 * **THIS LAW NEVER MOVES A TOKEN, APPLIES DAMAGE, CHOOSES A CHAIN TARGET OR
 * ALTERS A RULE.** It reads records and answers with pictures. Every anchor it
 * uses was recorded when the action happened (D-724, D-725, D-726); nothing is
 * inferred from what happens to be selected now.
 *
 * ## What never animates
 *
 *  - a cancel or a refusal - there is no record, so there is nothing to read;
 *  - a MISS's impact. The swing plays, marked `missed`, and the impact step is
 *    not emitted at all;
 *  - a FAILED CASTING TEST, on EVERY trigger. A failed card still offers
 *    Resist (07 §8 charges the Mana and nothing else), and its Place area now
 *    refuses in words (the lead, 2026-09-26) - but a Region laid off the card's
 *    record by any other hand can still exist, so the animation layer refuses
 *    the area and the resistance itself;
 *  - a PARRY Test, which posts an attack card and is not an attack;
 *  - an anchor this user cannot see.
 *
 * ## The record
 *
 * `module/animation/records.mjs` (Phase 4) reads a card, a Region, an
 * ActiveEffect or a newly recorded resist into this shape. Every key is
 * optional and a missing one means *nothing recorded*.
 *
 *     {
 *       trigger:  "cast" | "region" | "resist" | "effect",
 *       kind:     "attack" | "spell",
 *       sceneId:  where it happened,
 *       // an attack card
 *       parry, hit, strike {form, rangeKind, ...},
 *       // a spell card
 *       identifier, cast, success, area {shape, distanceFt, angle, widthFt},
 *       source {sceneId, tokenId}, targets [{sceneId, tokenId, actorId, name}],
 *       // the three joins
 *       region {id, sceneId, shape}, resist {tokenId, actorId, success},
 *       effect {id, sceneId, tokenId, actorId}
 *     }
 *
 * ## The facts
 *
 *     {
 *       sceneId, contentVisible, soundsOn,
 *       libraries: ["JB2A_DnD5e", "psfx", "jaamod"],
 *       tokens: {<id>: {x, y, width, height, visible}},   // x,y are CENTRES, px
 *       pxPerFt
 *     }
 */

import {
  FILTERS, LIBRARY_BY_ROOT, SPELL_ANIMATIONS, STRIKE_ANIMATIONS, libraryOf
} from "./animation-table.mjs";

/** The prefix every key this system writes into Sequencer's manager carries. */
export const LOOP_PREFIX = "azeroth-rpg:loop";

/** The prefix a one-shot cue's sections are named with. */
export const CUE_PREFIX = "azeroth-rpg:cue";

/**
 * Every reason a record produces no cue, in the order they are asked.
 *
 * A skip is a WORD, never a silent empty list: Phase 5's Quench batch asserts
 * the exact code for each of them, and the console warning names it.
 */
export const SKIPS = Object.freeze([
  "hidden", "other-scene", "parry", "no-form", "no-row", "reason",
  "failed-cast", "not-this-trigger", "resisted", "recorded-targets",
  "no-anchor", "library-off", "sounds-off"
]);

/* ------------------------------------------------------------------ */
/*  Geometry                                                           */
/* ------------------------------------------------------------------ */

/** A finite number, or null. */
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A point, or null. */
function point(x, y) {
  const px = num(x);
  const py = num(y);
  return px === null || py === null ? null : { x: px, y: py };
}

/**
 * A circular Region's centre and radius, in pixels.
 *
 * `canvas/regions.mjs#shapeFor` writes `{type: "circle", x, y, radius}` with
 * x and y at the CENTRE, so a ground area is cued at its own centre and sized
 * `2 * radius` - never on the caster, which is the design document's own rule.
 *
 * @param {{type: string, x: number, y: number, radius: number}} shape
 * @returns {{x: number, y: number, radius: number}|null}
 */
export function circleOf(shape) {
  if (shape?.type !== "circle") return null;
  const centre = point(shape.x, shape.y);
  const radius = num(shape.radius);
  return centre && radius !== null && radius > 0 ? { ...centre, radius } : null;
}

/**
 * A cone Region's apex and the point its axis reaches, in pixels.
 *
 * `shapeFor` writes `{type: "cone", x, y, radius, angle, rotation}` with x and
 * y at the APEX and `rotation` the facing the caster clicked (D-723). Canvas y
 * runs DOWN, which is core's own convention for a shape's rotation.
 *
 * @returns {{apex: {x, y}, end: {x, y}, rotation: number, radius: number, angle: number}|null}
 */
export function coneEnds(shape) {
  if (shape?.type !== "cone") return null;
  const apex = point(shape.x, shape.y);
  const radius = num(shape.radius);
  if (!apex || radius === null || radius <= 0) return null;
  const rotation = num(shape.rotation) ?? 0;
  const radians = rotation * (Math.PI / 180);
  return {
    apex,
    end: { x: apex.x + Math.cos(radians) * radius, y: apex.y + Math.sin(radians) * radius },
    rotation,
    radius,
    angle: num(shape.angle) ?? 0
  };
}

/**
 * A line Region's start and end, in pixels.
 *
 * `shapeFor` writes `{type: "line", x, y, length, width, rotation}` with x and
 * y where the line STARTS - the first click - and the entry fixing the length
 * (D-723).
 *
 * @returns {{start: {x, y}, end: {x, y}, rotation: number, length: number, width: number}|null}
 */
export function lineEnds(shape) {
  if (shape?.type !== "line") return null;
  const start = point(shape.x, shape.y);
  const length = num(shape.length);
  if (!start || length === null || length <= 0) return null;
  const rotation = num(shape.rotation) ?? 0;
  const radians = rotation * (Math.PI / 180);
  return {
    start,
    end: { x: start.x + Math.cos(radians) * length, y: start.y + Math.sin(radians) * length },
    rotation,
    length,
    width: num(shape.width) ?? 0
  };
}

/** The distance between two points in FEET, for a range bucket and for the long band. */
export function feetBetween(from, to, pxPerFt) {
  const a = point(from?.x, from?.y);
  const b = point(to?.x, to?.y);
  const scale = num(pxPerFt);
  if (!a || !b || scale === null || scale <= 0) return null;
  return Math.hypot(b.x - a.x, b.y - a.y) / scale;
}

/**
 * WHICH DISTANCE BUCKET A FILE IS PLAYED FROM.
 *
 * JB2A and PSFX cut a travelling asset at 5, 15, 30, 60 and 90 feet; a shot of
 * 40 feet plays the 60 ft file stretched down, never the 30 ft file stretched
 * up. So: the SMALLEST bucket that reaches, else the largest there is.
 *
 * `Sequencer.Database.entryExists` is a prefix match and `FEET_REGEX` is a
 * stateful global (sequencer.js L20, L6752), so Phase 4 resolves this as
 * `getEntry(base).file[bucket]` and plays the path - never by appending the
 * bucket to the key.
 *
 * @param {number} feet
 * @param {string[]} ranges  the entry's own bucket names, `["05ft", "15ft", ...]`
 * @returns {string|null}
 */
export function rangeBucket(feet, ranges) {
  const list = (Array.isArray(ranges) ? ranges : [])
    .map(r => ({ key: String(r), ft: Number(String(r).replace(/ft$/i, "")) }))
    .filter(r => Number.isFinite(r.ft))
    .sort((a, b) => a.ft - b.ft);
  if (!list.length) return null;
  const want = num(feet);
  if (want === null) return list[0].key;
  return (list.find(r => r.ft >= want) ?? list[list.length - 1]).key;
}

/**
 * DETERMINISTIC SCATTER inside a unit disc, from a string seed.
 *
 * Rain of Chaos drops five uneven pieces and Starfall three stars: they must
 * land in the same places on every client, or one player watches fire fall
 * where another watches it miss. The seed is the Region's id, so a second
 * casting scatters differently and the same casting never does.
 *
 * FNV-1a over the seed and the index, then a disc by the square root of the
 * radius so the points are spread evenly rather than crowded at the centre.
 *
 * @param {string} seed
 * @param {number} count
 * @returns {Array<{x: number, y: number, t: number}>}  x and y in [-1, 1]
 */
export function seededOffsets(seed, count) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(unit(`${seed}#r${i}`));
    const a = unit(`${seed}#a${i}`) * 2 * Math.PI;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, t: unit(`${seed}#t${i}`) });
  }
  return out;
}

/** FNV-1a over a string, as an unsigned 32-bit number. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  const str = String(text ?? "");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A number in [0, 1) from a string, stable across clients and runs. */
function unit(text) {
  return fnv1a(text) / 0x100000000;
}

/** A short stable hash of anything JSON can hold, for a loop's `origin`. */
export function hashOf(value) {
  return fnv1a(stable(value)).toString(36);
}

/** JSON with its object keys sorted, so two equal states hash alike. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/* ------------------------------------------------------------------ */
/*  Anchors                                                            */
/* ------------------------------------------------------------------ */

/** A token's facts, or null where this client has no such token. */
function tokenOf(facts, id) {
  const token = id && facts?.tokens ? facts.tokens[id] : null;
  if (!token) return null;
  const centre = point(token.x, token.y);
  if (!centre) return null;
  return { id, ...centre, width: num(token.width) ?? 0, height: num(token.height) ?? 0, visible: token.visible !== false };
}

/** Whether the token can be seen here. An unseen anchor drops its step (D-728). */
function seen(token) {
  return Boolean(token?.visible);
}

/* ------------------------------------------------------------------ */
/*  Building a step                                                    */
/* ------------------------------------------------------------------ */

/**
 * A step as Phase 4 receives it. Every key that was never asked for is LEFT
 * OUT rather than written null, so a reader can tell *no rotation* from
 * *rotation zero* and a test can compare whole steps.
 */
function step(recipe, resolved) {
  const out = { kind: recipe.kind ?? "effect", asset: recipe.asset, library: libraryOf(recipe.asset) };
  const carry = [
    "travel", "opacity", "below", "filter", "delay", "waitFor", "overlap",
    "grow", "hold", "fadeIn", "fadeOut", "speed", "spin", "offset", "count",
    "stagger", "duration", "volume", "bucketed", "scale", "secondary",
    // A FIXED FACING a recipe asks for. The table's own vocabulary has always
    // documented it and `look()` reads it; it was dropped here in silence, so
    // the first picked asset that needs one would have lost it. A placement
    // that works a facing out (`region-cone`, `region-line`) overrides this,
    // because `resolved` is spread after the carried keys.
    "rotation"
  ];
  for (const key of carry) if (recipe[key] !== undefined) out[key] = recipe[key];
  for (const [key, value] of Object.entries(resolved)) if (value !== undefined && value !== null) out[key] = value;
  return out;
}

/**
 * The diameter, in pixels, a step asks for.
 *
 *  - `area: f`        a fraction of the area's own diameter. A placed Region
 *                     uses the Region's; a self-centred area at cast uses the
 *                     Target line's radius from the card (D-728).
 *  - `area: [a, b]`   a scatter, interpolated by the offset's own `t`.
 *  - `sizeFt: n`      an absolute DIAMETER in feet. **A `sustain-*` loop has
 *                     no Region to measure**, so a self-centred sustained area
 *                     - Hellfire and Devotion Aura - carries its own from the
 *                     table, and a census holds it against that spell's own
 *                     Target line. Without it the fallback was the holder's
 *                     token width, and a 20 ft radius drew one square across.
 *
 * `scale` is not a size: it is a multiple of the ANCHOR TOKEN's width and is
 * carried through untouched for Sequencer's `scaleToObject`.
 */
function sizeOf(recipe, { diameter = null, pxPerFt = null, t = 0 }) {
  if (recipe.sizeFt !== undefined) {
    const ft = num(recipe.sizeFt);
    const scale = num(pxPerFt);
    return ft !== null && scale !== null ? ft * scale : null;
  }
  if (recipe.area === undefined) return null;
  const d = num(diameter);
  if (d === null) return null;
  if (Array.isArray(recipe.area)) {
    const [a, b] = recipe.area.map(num);
    if (a === null || b === null) return null;
    return (a + (b - a) * (num(t) ?? 0)) * d;
  }
  const f = num(recipe.area);
  return f === null ? null : f * d;
}

/* ------------------------------------------------------------------ */
/*  plan()                                                             */
/* ------------------------------------------------------------------ */

/** No cue, and the word for why. */
function skipped(skip) {
  return { skip, steps: [] };
}

/**
 * WHAT ONE COMPLETED ACTION PLAYS ON THIS CLIENT.
 *
 * Gated in order, each gate with its own skip code, and only then are the
 * steps built and filtered. The order matters: a Parry card carries a `strike`
 * of its own, so the `parry` gate comes FIRST or every Parry Test animates as
 * an attack.
 *
 * **The tables are INJECTED** (the loot generator's shape, D-666). Phase 5
 * renders a Jinker's candidate beside the shipped draft by handing in a table
 * with that one row changed; nothing else can tell the difference.
 *
 * @param {object} record  see the file comment
 * @param {object} facts   see the file comment
 * @param {{spells?: object, strikes?: object}} [tables]
 * @returns {{skip: string|null, steps: object[]}}
 */
export function plan(record, facts = {}, tables = {}) {
  const spells = tables.spells ?? SPELL_ANIMATIONS;
  const strikes = tables.strikes ?? STRIKE_ANIMATIONS;
  if (!record) return skipped("no-row");

  // 1. Nothing a reader may not read. A card the chat selector hid is not
  //    announced by an explosion over the board.
  if (facts.contentVisible === false) return skipped("hidden");

  // 2. Nothing from a scene this client is not looking at.
  const where = record.sceneId ?? record.source?.sceneId ?? record.region?.sceneId ?? record.effect?.sceneId ?? null;
  if (where && facts.sceneId && where !== facts.sceneId) return skipped("other-scene");

  const built = record.kind === "attack" ? planAttack(record, facts, strikes) : planSpell(record, facts, spells);
  if (built.skip) return built;

  // 3. The per-step pass: a sound where sounds are off, an anchor this user
  //    cannot see, a step whose library is not running.
  const on = new Set(Array.isArray(facts.libraries) ? facts.libraries : Object.values(LIBRARY_BY_ROOT));
  const dropped = new Set();
  const steps = built.steps.filter(s => {
    if (s.kind === "sound" && facts.soundsOn === false) { dropped.add("sounds-off"); return false; }
    if (s.library && !on.has(s.library)) { dropped.add("library-off"); return false; }
    if (s.unseen) { dropped.add("no-anchor"); return false; }
    return true;
  }).map(s => { const { unseen, ...rest } = s; return rest; });

  if (steps.length) return { skip: null, steps };
  // Everything was dropped: say WHICH gate emptied it rather than "nothing".
  // The codes are what Phase 5 asserts on, so a cue silenced by a disabled
  // module, by a hidden anchor and by the sound setting are three answers.
  if (dropped.has("no-anchor")) return skipped("no-anchor");
  if (dropped.has("library-off")) return skipped("library-off");
  if (dropped.has("sounds-off")) return skipped("sounds-off");
  return skipped("no-anchor");
}

/**
 * AN ATTACK (D-725).
 *
 * A hit is the swing or the projectile from the attacker to the target with
 * its swing or launch sound, then the impact and the impact sound after the
 * travel. A miss plays the same swing marked `missed` and HAS NO IMPACT STEP
 * AT ALL - a bite, with nothing to swing, plays a small bite beside the target
 * instead.
 */
function planAttack(record, facts, strikes) {
  // A Parry Test posts an attack card and carries a strike of its own. It is a
  // Reaction, not an attack, and nothing about it animates.
  if (record.parry === true) return skipped("parry");
  const form = record.strike?.form ?? null;
  const recipe = form && Object.hasOwn(strikes, form) ? strikes[form] : null;
  if (!recipe) return skipped("no-form");

  const source = tokenOf(facts, record.source?.tokenId);
  const target = tokenOf(facts, record.targets?.[0]?.tokenId);
  if (!source && !target) return skipped("no-anchor");

  const hit = record.hit === true;
  const steps = [];
  const swing = !hit && recipe.swing.miss ? { ...recipe.swing, ...recipe.swing.miss } : recipe.swing;
  const aim = target;
  // **A SOUND IS GATED ON ITS OWN PICTURE.** A swing that could not be drawn -
  // an attack whose source token is not on this board, so there is nothing for
  // it to travel from - must not leave its swoosh and its impact thud standing
  // where the picture was refused, or a blow is heard and nothing is seen.
  const drew = push(steps, swing, { record, facts, source, aim, missed: !hit });
  if (drew && swing.sound) push(steps, swing.sound, { record, facts, source, aim, follow: swing });
  for (const launch of recipe.launch ?? []) push(steps, launch, { record, facts, source, aim });
  if (hit && recipe.impact) {
    const landed = push(steps, recipe.impact, { record, facts, source, aim });
    if (landed && recipe.impact.sound) push(steps, recipe.impact.sound, { record, facts, source, aim, follow: recipe.impact });
  }
  if (hit && recipe.ret) push(steps, recipe.ret, { record, facts, source, aim });
  return steps.length ? { skip: null, steps } : skipped("no-anchor");
}

/** A SPELL: the row, the verdict, the trigger, and only then the steps. */
function planSpell(record, facts, spells) {
  const id = record.identifier ?? null;
  const row = id && Object.hasOwn(spells, id) ? spells[id] : null;
  // A Region placed from a FEATURE card carries no `cast` and no `identifier`
  // (D-724): there is no spell row and nothing to draw.
  if (!row) return skipped("no-row");
  if (row.reason) return skipped("reason");

  // 07 §8: a failed Casting Test costs the Mana and nothing else. The card
  // still offers Place area and Resist, so the refusal lives here and covers
  // EVERY trigger (D-728). A card with no recorded verdict recorded nothing.
  if (record.success !== true) return skipped("failed-cast");

  const trigger = record.trigger ?? "cast";
  const cues = (row.cues ?? []).filter(c => matches(c.trigger, trigger));
  if (!cues.length) return skipped("not-this-trigger");

  // A recorded Resilience Test that SUCCEEDED is the `resisted` skip, never a
  // cue: 07's transformations and banishments wait for a failure (D-726).
  if (trigger === "resist" && record.resist?.success !== false) return skipped("resisted");

  // The `cast|effect` fallback fires only where the cast recorded nothing to
  // aim at; otherwise the cast trigger already played it on the targets.
  const targets = Array.isArray(record.targets) ? record.targets : [];
  if (trigger === "effect" && targets.length) return skipped("recorded-targets");

  const source = tokenOf(facts, record.source?.tokenId);
  // WHAT A `cast|effect` ROW AIMS AT. At cast it is the recorded target; on
  // the effect trigger - which fires only where the cast recorded nothing to
  // aim at - it is the token the laid effect landed on. The row writes one
  // placement and means both.
  const aim = trigger === "effect"
    ? tokenOf(facts, record.effect?.tokenId)
    : tokenOf(facts, record.targets?.[0]?.tokenId);
  const steps = [];
  // A SOUND FOLLOWS THE VISUAL IT SITS BESIDE. The draft writes a cue as a
  // picture and then its sound, so a sound naming no placement takes the one
  // the effect before it took - and never more than one copy of it, however
  // many the effect made.
  //
  // **AND A SOUND IS GATED ON ITS OWN PICTURE** (D-728), exactly as an
  // attack's is. Nothing in `castSpell` refuses a cast with nothing targeted,
  // so Fireball pressed at no one used to come back with `skip: null` and two
  // sound steps on the caster - a launch and a fire impact over an empty board,
  // and a reader counting skips saw a cue that played. Thirty-nine of the 105
  // rows could do it.
  let follow = null;
  let drew = false;
  for (const c of cues) {
    for (const recipe of c.steps) {
      if (recipe.kind === "sound" && !recipe.place && !drew) continue;
      const added = push(steps, recipe, { record, facts, source, aim, trigger, follow });
      if (recipe.kind !== "sound") {
        follow = recipe;
        drew = added > 0;
      }
    }
  }
  return steps.length ? { skip: null, steps } : skipped("no-anchor");
}

/** Whether a cue's trigger answers the one that fired. */
function matches(cueTrigger, trigger) {
  if (cueTrigger === trigger) return true;
  return cueTrigger === "cast|effect" && (trigger === "cast" || trigger === "effect");
}

/* ------------------------------------------------------------------ */
/*  Resolving a placement                                              */
/* ------------------------------------------------------------------ */

/** The diameter the record's own area implies, in pixels. */
function areaDiameter(record, facts, trigger) {
  const pxPerFt = num(facts.pxPerFt);
  if (trigger === "region" || record.region) {
    const shape = record.region?.shape ?? null;
    const circle = circleOf(shape);
    if (circle) return circle.radius * 2;
    const cone = coneEnds(shape);
    if (cone) return cone.radius * 2;
    const line = lineEnds(shape);
    if (line) return line.length;
  }
  const ft = num(record.area?.distanceFt);
  return ft !== null && pxPerFt !== null ? ft * 2 * pxPerFt : null;
}

/**
 * Turn one recipe step into the steps it becomes here, and add them.
 *
 * A step whose anchor cannot be resolved is NOT ADDED; one whose anchor is
 * resolvable but unseen is added with `unseen`, which `plan`'s last pass
 * drops. The two differ because an unseen anchor is a reason to say
 * `no-anchor` and a missing one may simply not be this step's business.
 *
 * @returns {number} how many steps it added, so a caller can gate a sound on
 *   its own picture having been drawn.
 */
function push(steps, recipe, context) {
  const before = steps.length;
  addSteps(steps, recipe, context);
  return steps.length - before;
}

/** The body of `push`, which answers nothing and is never called directly. */
function addSteps(steps, recipe, context) {
  const { record, facts, source = null, aim = null, missed = false, trigger = record?.trigger ?? "cast", follow = null } = context;
  const pxPerFt = num(facts.pxPerFt);
  const diameter = areaDiameter(record, facts, trigger);
  const place = recipe.place ?? follow?.place ?? null;
  const firstTarget = aim;
  const mark = missed ? { missed: true } : {};

  // A SOUND IS ONE SOUND. Five scattered impacts are five pictures and one
  // bang; three darts are one launch. So a sound resolves to a single anchor
  // and a distance, never to a copy per picture, and the distance is what
  // `rangeBucket` reads for a bucketed file.
  //
  // **AND A SOUND ON AN UNSEEN ANCHOR IS DROPPED TOO.** A swoosh at a hidden
  // creature announces where it is stood as plainly as a picture would.
  if (recipe.kind === "sound") {
    const spot = soundAnchor({ place, record, facts, source, firstTarget });
    // **A SOUND WITH NO ANCHOR IS NOT A SOUND.** `chooseSource` answers null
    // rather than guess among a caster's two uncontrolled tokens (D-724), and
    // a step carrying neither `at` nor `on` would be played non-positionally:
    // a bang from nowhere, in exactly the case where the picture was refused.
    if (!spot) return;
    const span = feetBetween(source, firstTarget, pxPerFt);
    steps.push({
      ...step(recipe, {
        at: spot.at ?? undefined,
        on: spot.on ?? undefined,
        feet: spot.feet ?? span ?? undefined
      }),
      ...(spot.unseen ? { unseen: true } : {})
    });
    return;
  }

  const at = (token, extra = {}) => {
    if (!token) return;
    steps.push({
      ...step(recipe, { at: { x: token.x, y: token.y }, on: token.id, size: sizeOf(recipe, { diameter, pxPerFt }), ...extra }),
      ...mark,
      ...(seen(token) ? {} : { unseen: true })
    });
  };

  const between = (from, to, extra = {}) => {
    if (!from || !to) return;
    steps.push({
      ...step(recipe, {
        from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
        fromToken: from.id ?? undefined, toToken: to.id ?? undefined,
        feet: feetBetween(from, to, pxPerFt),
        size: sizeOf(recipe, { diameter, pxPerFt }),
        ...extra
      }),
      ...mark,
      ...((from.id && !seen(from)) || (to.id && !seen(to)) ? { unseen: true } : {})
    });
  };

  switch (place) {
    case "source": return at(source);
    case "target": return at(firstTarget);
    case "resisted": return at(tokenOf(facts, record.resist?.tokenId));
    case "effect": return at(tokenOf(facts, record.effect?.tokenId));

    case "targets": {
      (record.targets ?? []).forEach((t, index) => {
        const token = tokenOf(facts, t?.tokenId);
        if (token) at(token, { index, delay: (num(recipe.delay) ?? 0) + index * (num(recipe.stagger) ?? 0) });
      });
      return;
    }

    // A miss with nothing to swing: the bite happens BESIDE the target, never
    // on it, so a miss can never read as a hit.
    case "beside-target": {
      if (!firstTarget) return;
      const away = (firstTarget.width || (pxPerFt ?? 0) * 5) * 0.75;
      steps.push({
        ...step(recipe, {
          at: { x: firstTarget.x + away, y: firstTarget.y - away },
          size: sizeOf(recipe, { diameter, pxPerFt })
        }),
        ...mark,
        ...(seen(firstTarget) ? {} : { unseen: true })
      });
      return;
    }

    // AT THE PLACED AREA'S OWN CENTRE, never on the caster - the design
    // document's own rule. `shapeFor` writes a circle's x and y at its centre,
    // so a 20 ft radius is cued there and sized `2 * radius`. A cone or a line
    // takes `region-cone` or `region-line`; this refuses them rather than
    // dropping a burst on an apex.
    case "region": {
      const circle = circleOf(record.region?.shape ?? null);
      if (!circle) return;
      steps.push(step(recipe, {
        at: { x: circle.x, y: circle.y },
        size: sizeOf(recipe, { diameter, pxPerFt }),
        mask: recipe.mask ? record.region?.id ?? undefined : undefined
      }));
      return;
    }

    // Uneven pieces inside the area, in the same places on every client.
    case "region-scatter": {
      const circle = circleOf(record.region?.shape ?? null);
      if (!circle) return;
      const count = Number.isInteger(recipe.count) && recipe.count > 0 ? recipe.count : 1;
      seededOffsets(record.region?.id ?? record.cast ?? "", count).forEach((o, index) => {
        steps.push(step(recipe, {
          at: { x: circle.x + o.x * circle.radius, y: circle.y + o.y * circle.radius },
          size: sizeOf(recipe, { diameter, pxPerFt, t: o.t }),
          index,
          delay: (num(recipe.delay) ?? 0) + index * (num(recipe.stagger) ?? 0)
        }));
      });
      return;
    }

    case "region-line": {
      const line = lineEnds(record.region?.shape ?? null);
      if (!line) return;
      return between(line.start, line.end, { rotation: line.rotation, mask: recipe.mask ? record.region?.id : undefined });
    }

    case "region-cone": {
      const cone = coneEnds(record.region?.shape ?? null);
      if (!cone) return;
      return between(cone.apex, cone.end, { rotation: cone.rotation, mask: recipe.mask ? record.region?.id : undefined });
    }

    case "source>target": return between(source, firstTarget);
    case "target>source": return between(firstTarget, source);

    // Exactly three darts to the FIRST target, staggered. The conditional
    // fourth needs a secondary target nothing records.
    case "missiles": {
      const count = Number.isInteger(recipe.count) && recipe.count > 0 ? recipe.count : 1;
      for (let index = 0; index < count; index++) {
        between(source, firstTarget, { index, delay: (num(recipe.delay) ?? 0) + index * (num(recipe.stagger) ?? 0) });
      }
      return;
    }

    // ONE bolt to the first target, then target to target - never three bolts
    // from the caster. The order is the order the card recorded, and the chain
    // STOPS at the first target this client cannot resolve or cannot see,
    // because a leg to nowhere is a lie about where the bolt went.
    case "chain": {
      let from = source;
      let index = 0;
      for (const entry of record.targets ?? []) {
        const to = tokenOf(facts, entry?.tokenId);
        if (!to || !seen(to)) break;
        if (from && !(from.x === to.x && from.y === to.y)) {
          const asset = index === 0 ? recipe.asset : (recipe.secondary ?? recipe.asset);
          const leg = { ...recipe, asset };
          steps.push(step(leg, {
            from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
            fromToken: from.id ?? undefined, toToken: to.id,
            feet: feetBetween(from, to, pxPerFt),
            index,
            delay: (num(recipe.delay) ?? 0) + index * (num(recipe.stagger) ?? 0)
          }));
          index += 1;
        }
        from = to;
      }
      return;
    }

    default:
      // A placement only a LOOP uses (`holder`, `channel`, `orbit`) reached a
      // cue, or a recipe named nothing. Neither is a cue.
      return;
  }
}

/**
 * Where a sound sits, and how far away the thing it belongs to is.
 *
 * One anchor, whatever the picture beside it did: the placed area's centre,
 * the creature it happened to, or the caster. `feet` is what a bucketed file
 * is chosen by, and it is the span of the action rather than the span of the
 * sound - a launch heard at the caster is still a 60 ft shot.
 */
function soundAnchor({ place, record, facts, source, firstTarget }) {
  const pxPerFt = num(facts.pxPerFt);
  const spot = (token) => (token
    ? { at: { x: token.x, y: token.y }, on: token.id, ...(seen(token) ? {} : { unseen: true }) }
    : null);
  switch (place) {
    case "target":
    case "targets":
    case "beside-target":
    case "source>target":
    case "missiles":
      return spot(firstTarget) ?? spot(source);
    case "target>source":
    case "chain":
    case "source":
      return spot(source) ?? spot(firstTarget);
    case "resisted":
      return spot(tokenOf(facts, record.resist?.tokenId)) ?? spot(source);
    case "effect":
      return spot(tokenOf(facts, record.effect?.tokenId)) ?? spot(source);
    case "region":
    case "region-scatter": {
      const circle = circleOf(record.region?.shape ?? null);
      return circle ? { at: { x: circle.x, y: circle.y } } : spot(source);
    }
    case "region-line": {
      const line = lineEnds(record.region?.shape ?? null);
      return line ? { at: { ...line.start }, feet: line.length / (pxPerFt || 1) } : spot(source);
    }
    case "region-cone": {
      const cone = coneEnds(record.region?.shape ?? null);
      return cone ? { at: { ...cone.apex }, feet: cone.radius / (pxPerFt || 1) } : spot(source);
    }
    default:
      return spot(source) ?? spot(firstTarget);
  }
}

/* ------------------------------------------------------------------ */
/*  loopsFor()                                                         */
/* ------------------------------------------------------------------ */

/**
 * WHAT THE WORLD CURRENTLY HOLDS, AS LOOPS.
 *
 * Every client works the same answer out of the same world, so the key is the
 * same everywhere and a GM's Stop holds on every screen. Nothing here is a
 * history: a loop exists because a Sustain is held, an effect stands or a
 * Region sits on the board, and it stops existing the moment that does.
 *
 * **A LOOP NEEDS NO CARD.** A held Sustain or a laid effect is itself proof
 * the cast succeeded, and a GM who clears chat mid-fight must not stop a
 * running Blizzard.
 *
 * `state`:
 *
 *     {
 *       sceneId, isGM, pxPerFt, tokens,
 *       sustains: [{cast, identifier, actorId, source {sceneId, tokenId},
 *                   targets [{sceneId, tokenId, actorId}], name}],
 *       effects:  [{id, cast, identifier, active, sceneId, tokenId, name}],
 *       regions:  [{id, sceneId, cast, identifier, shape}],
 *       resists:  [{cast, tokenId, actorId, sceneId, success}]
 *     }
 *
 * **The table is INJECTED**, as `plan`'s is: Phase 5 renders a Jinker's
 * candidate by handing in a table with one row changed, and the three
 * `sustain-resisted` rows the lead has not picked are exercised the same way
 * (D-727).
 *
 * @param {object} state
 * @param {{table?: object}} [tables]
 * @returns {Array<{key, binding, cast, identifier, name, sceneId, anchors, hash, layers}>}
 */
export function loopsFor(state = {}, tables = {}) {
  const spells = tables.table ?? SPELL_ANIMATIONS;
  const sceneId = state.sceneId ?? null;
  const loops = [];
  const seenKeys = new Set();

  const add = loop => {
    if (!loop || seenKeys.has(loop.key)) return;
    seenKeys.add(loop.key);
    loops.push(loop);
  };

  for (const entry of state.sustains ?? []) {
    // An entry written before D-724 carries no `cast`, and a loop keyed on
    // nothing would collide with every other. It is skipped.
    const cast = entry?.cast ?? null;
    const row = rowFor(spells, entry?.identifier);
    if (!cast || !row?.loop || !String(row.loop.binding).startsWith("sustain")) continue;
    const binding = row.loop.binding;
    const caster = tokenOf(state, entry.source?.tokenId);
    const target = tokenOf(state, entry.targets?.[0]?.tokenId);

    if (binding === "sustain-self") add(build({ state, row, entry, binding, cast, anchors: [caster], holder: caster }));
    else if (binding === "sustain-target") add(build({ state, row, entry, binding, cast, anchors: [target], holder: target }));
    else if (binding === "sustain-channel") add(build({ state, row, entry, binding, cast, anchors: [target, caster], holder: target, other: caster }));
    else if (binding === "sustain-region") {
      for (const region of regionsFor(state, cast, entry.identifier)) {
        add(build({ state, row, entry, binding, cast, anchors: [{ id: region.id }], region }));
      }
    } else if (binding === "sustain-resisted") {
      // Built and unused: the three rows that would take it are Appendix C's,
      // and the lead has not picked them (D-727).
      for (const resist of resistsFor(state, cast)) {
        const token = tokenOf(state, resist.tokenId);
        add(build({ state, row, entry, binding, cast, anchors: [token], holder: token }));
      }
    }
  }

  for (const effect of state.effects ?? []) {
    const cast = effect?.cast ?? null;
    const row = rowFor(spells, effect?.identifier);
    if (!cast || !row?.loop || !String(row.loop.binding).startsWith("effect")) continue;
    if (effect.active === false) continue;
    if (effect.sceneId && sceneId && effect.sceneId !== sceneId) continue;
    const holder = tokenOf(state, effect.tokenId);
    const entry = { identifier: effect.identifier, name: effect.name ?? null, source: effect.source ?? null };
    if (row.loop.binding === "effect") {
      add(build({ state, row, entry, binding: "effect", cast, anchors: [holder], holder, other: tokenOf(state, effect.source?.tokenId) }));
    } else {
      // Flare: while its Region AND its laid effect both exist.
      for (const region of regionsFor(state, cast, effect.identifier)) {
        add(build({ state, row, entry, binding: "effect-region", cast, anchors: [{ id: region.id }, { id: effect.id }], region }));
      }
    }
  }

  return loops;
}

/** The table row for an identifier, or null. */
function rowFor(spells, identifier) {
  return identifier && Object.hasOwn(spells, identifier) ? spells[identifier] : null;
}

/** The Regions on the viewed scene that this cast placed. */
function regionsFor(state, cast, identifier) {
  return (state.regions ?? []).filter(r => r
    && r.cast === cast
    && (!identifier || !r.identifier || r.identifier === identifier)
    && (!state.sceneId || !r.sceneId || r.sceneId === state.sceneId));
}

/** The recorded Resilience Tests of one cast that FAILED. */
function resistsFor(state, cast) {
  return (state.resists ?? []).filter(r => r && r.cast === cast && r.success === false);
}

/**
 * One loop, with its layers resolved and its key built.
 *
 * The key is `azeroth-rpg:loop:<binding>:<cast>:<sceneId>:<anchorA>[:<anchorB>]`
 * - the same on every client, so a GM's Stop holds everywhere and a recast,
 * which has a new `cast`, shows again.
 *
 * **A LOOP ON A TOKEN THE GM HAS HIDDEN IS DROPPED FOR PLAYERS.** A standing
 * flame over an invisible creature says where it is.
 */
function build({ state, row, entry, binding, cast, anchors, holder = null, other = null, region = null }) {
  const ids = anchors.map(a => a?.id ?? null);
  if (ids.some(id => !id)) return null;
  for (const anchor of anchors) {
    if (anchor && Object.hasOwn(anchor, "visible") && !seen(anchor) && state.isGM !== true) return null;
  }
  const sceneId = state.sceneId ?? null;
  const key = [LOOP_PREFIX, binding, cast, sceneId ?? "-", ...ids].join(":");
  const layers = [];
  for (const recipe of row.loop.layers) {
    const made = layerOf(recipe, { state, holder, other, region });
    for (const one of made) layers.push(one);
  }
  if (!layers.length) return null;
  return {
    key, binding, cast,
    identifier: entry.identifier ?? null,
    name: entry.name ?? null,
    sceneId,
    anchors: ids,
    hash: hashOf({ layers: hashable(layers), binding }),
    layers
  };
}

/**
 * WHAT A LOOP'S HASH IS OF: the recipe, and the geometry the recipe does not
 * already carry.
 *
 * A moved Region or an edited row must replay, which is what the hash is for.
 * **AN ATTACHED LAYER MUST NOT.** `.attachTo()` and `stretchTo(..., {attachTo:
 * true})` carry the position themselves, so a layer naming a token needs no
 * coordinates in its hash - and if it keeps them, every step the token takes
 * moves the hash and restarts the flames. That is twenty of the twenty-six
 * loops: every `sustain-self`, `sustain-target`, `sustain-channel` and
 * `effect`.
 *
 * `feet` goes with them: it is the distance between two tokens and changes on
 * every stride.
 */
function hashable(layers) {
  return layers.map(layer => {
    if (!layer.on && !layer.fromToken && !layer.toToken) return layer;
    const { at, from, to, feet, ...rest } = layer;
    return rest;
  });
}

/** One loop layer, resolved against whatever the binding anchored it to. */
function layerOf(recipe, { state, holder, other, region }) {
  const pxPerFt = num(state.pxPerFt);
  const shape = region?.shape ?? null;
  const circle = circleOf(shape);
  const line = lineEnds(shape);
  const diameter = circle ? circle.radius * 2 : (line ? line.length : null);
  const out = [];

  switch (recipe.place) {
    case "holder": {
      if (!holder) break;
      // A Region's diameter where there is one (`effect-region`), else the
      // layer's own `sizeFt`. **Never the token's width**: a `sustain-*` loop
      // has no Region, and Hellfire's 20 ft radius drew 100px instead of 800
      // for as long as that fallback stood.
      out.push(step(recipe, { at: { x: holder.x, y: holder.y }, on: holder.id, size: sizeOf(recipe, { diameter, pxPerFt }) }));
      break;
    }
    case "orbit": {
      // Three charges at shoulder height, a third of a turn apart. The count
      // and the spin ride on the step; the orbit itself is Sequencer's
      // `spriteOffset` inside `spriteContainer` (Phase 4).
      if (!holder) break;
      const count = Number.isInteger(recipe.count) && recipe.count > 0 ? recipe.count : 1;
      for (let index = 0; index < count; index++) {
        out.push(step(recipe, { at: { x: holder.x, y: holder.y }, on: holder.id, index, phase: (360 / count) * index }));
      }
      break;
    }
    case "channel":
    case "channel-back": {
      const from = recipe.place === "channel" ? holder : other;
      const to = recipe.place === "channel" ? other : holder;
      if (!from || !to) break;
      out.push(step(recipe, {
        from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
        fromToken: from.id, toToken: to.id, feet: feetBetween(from, to, pxPerFt)
      }));
      break;
    }
    case "region": {
      if (!circle) break;
      out.push(step(recipe, {
        at: { x: circle.x, y: circle.y },
        size: sizeOf(recipe, { diameter, pxPerFt }),
        mask: recipe.mask ? region.id : undefined
      }));
      break;
    }
    case "region-scatter": {
      if (!circle) break;
      const count = Number.isInteger(recipe.count) && recipe.count > 0 ? recipe.count : 1;
      seededOffsets(region.id ?? "", count).forEach((o, index) => {
        out.push(step(recipe, {
          at: { x: circle.x + o.x * circle.radius, y: circle.y + o.y * circle.radius },
          size: sizeOf(recipe, { diameter, pxPerFt, t: o.t }),
          index, delay: index * (num(recipe.stagger) ?? 0)
        }));
      });
      break;
    }
    case "region-line": {
      if (!line) break;
      out.push(step(recipe, {
        from: { x: line.start.x, y: line.start.y }, to: { x: line.end.x, y: line.end.y },
        rotation: line.rotation, mask: recipe.mask ? region.id : undefined
      }));
      break;
    }
    default:
      break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Stops, hides and the window                                        */
/* ------------------------------------------------------------------ */

/**
 * Every word a loop's state can be, for the window and for `lang/en.json`.
 *
 * **`private` is never a ROW.** `animationRows` omits a private loop instead of
 * listing it, because a row reading *Immolation - not shown to you* announces
 * that a private Immolation is running, which is the leak the gate exists to
 * stop. The word is here so a GM-side surface can use it and so the vocabulary
 * is in one place.
 */
export const LOOP_STATES = Object.freeze(["playing", "stopped", "hidden", "off", "private"]);

/** A Set of cast ids, from a Set, an array, or nothing. */
function castSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

/**
 * The loops that should be PLAYING on this screen right now.
 *
 * **A PRIVATE CAST'S LOOP PLAYS NOWHERE IT SHOULD NOT BE SEEN** (integration
 * rule 6: *private rolls must not broadcast hidden results through effects or
 * sound*). A loop is computed from world state - an actor's `sustaining` flag,
 * a laid effect - and world state is public, so a GM casting Immolation on a
 * VISIBLE creature as a blind roll hides the card and the standing flames
 * would have said it anyway. `privateCasts` is the set of cast ids THIS CLIENT
 * MAY NOT SEE; the director seeds and maintains it from `isContentVisible`.
 *
 * **A loop whose cast this client knows no card for still plays.** A held
 * Sustain with its card deleted is world state and nothing else; only a cast
 * positively known to be private is dropped.
 *
 * @param {Array<object>} loops
 * @param {object} [o]
 * @param {object} [o.stops]         world setting, keyed by loop key
 * @param {object} [o.hidden]        client setting, keyed by loop key
 * @param {boolean} [o.loopsOn]      the client's `animationLoops` setting
 * @param {Set<string>|string[]} [o.privateCasts]  cast ids this client may not see
 */
export function visibleLoops(loops, { stops = {}, hidden = {}, loopsOn = true, privateCasts = null } = {}) {
  if (loopsOn === false) return [];
  const secret = castSet(privateCasts);
  return (loops ?? []).filter(loop => !stops?.[loop.key] && !hidden?.[loop.key] && !secret.has(loop.cast));
}

/**
 * THE STOP DOOR'S ROWS, in the order it draws them.
 *
 * A state is a WORD, never a colour: Playing, Stopped for everyone by so and
 * so, Hidden on this screen, Animations are off on this screen. The window
 * localises them; the law only says which.
 *
 * **A PRIVATE CAST IS NOT LISTED AT ALL.** Not greyed, not explained: a row
 * naming it is the leak. See `LOOP_STATES`.
 */
export function animationRows(loops, { stops = {}, hidden = {}, loopsOn = true, isGM = false, privateCasts = null } = {}) {
  const secret = castSet(privateCasts);
  return (loops ?? []).filter(loop => !secret.has(loop.cast)).map(loop => {
    const stop = stops?.[loop.key] ?? null;
    const state = stop ? "stopped" : (loopsOn === false ? "off" : (hidden?.[loop.key] ? "hidden" : "playing"));
    return {
      key: loop.key,
      binding: loop.binding,
      cast: loop.cast,
      identifier: loop.identifier,
      name: loop.name,
      anchors: loop.anchors,
      state,
      stoppedBy: stop?.by ?? null,
      canStop: isGM === true,
      canHide: loopsOn !== false && !stop
    };
  }).sort((a, b) => String(a.name ?? a.identifier ?? "").localeCompare(String(b.name ?? b.identifier ?? ""))
    || a.key.localeCompare(b.key));
}

/**
 * A SETTINGS MAP, CLEANED - AND ONLY THE KEYS IT WAS HANDED (CLAUDE.md §15).
 *
 * `animationStops` and `animationHidden` are Object settings, so what arrives
 * is a live object and may be a partial write. A guard that REBUILT the map
 * would write a null over every key the caller did not name; this one walks
 * the keys that are present and nothing else, at every depth.
 *
 * A key must look like a loop key, and a value must be an object (a stop) or
 * `true` (a hide). Anything else is dropped rather than repaired.
 */
export function cleanKeyMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    if (!String(key).startsWith(`${LOOP_PREFIX}:`)) continue;
    if (value === true) { out[key] = true; continue; }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = {};
    // Only the keys THIS value carries: a stop written as `{by}` alone must
    // not come back carrying a null `at`.
    if (Object.hasOwn(value, "by")) entry.by = typeof value.by === "string" ? value.by : null;
    if (Object.hasOwn(value, "at")) entry.at = num(value.at);
    if (Object.hasOwn(value, "userId")) entry.userId = typeof value.userId === "string" ? value.userId : null;
    out[key] = entry;
  }
  return out;
}

/** The map with one key set. Never mutates what it is given. */
export function withKey(map, key, value) {
  const clean = cleanKeyMap(map);
  if (!key) return clean;
  return { ...clean, [key]: value };
}

/** The map without one key. */
export function withoutKey(map, key) {
  const clean = cleanKeyMap(map);
  if (key) delete clean[key];
  return clean;
}

/**
 * The map with every key no longer wanted taken out.
 *
 * The active GM prunes stopped keys whose loop is gone across all scenes, and
 * each client prunes its own hidden keys; without it the two settings grow for
 * as long as the world runs.
 */
export function pruneKeys(map, liveKeys) {
  const live = new Set(Array.isArray(liveKeys) ? liveKeys : [...(liveKeys ?? [])]);
  const clean = cleanKeyMap(map);
  for (const key of Object.keys(clean)) if (!live.has(key)) delete clean[key];
  return clean;
}

/** The filter a named recolour stands for, or null. For Phase 4's builder. */
export function filterFor(name) {
  return name && Object.hasOwn(FILTERS, name) ? FILTERS[name] : null;
}
