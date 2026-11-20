/**
 * **THE HORDE PANEL'S CONTEXT** (D11 §2; the frozen artboard `docs/design/artboards/HordePanel.html`;
 * the Necromancer plan's door 14). Pure: no Foundry imports (CLAUDE.md §3). The sheet hands in plain
 * facts and a bag of words (the localised strings), and this composes every row the partial draws,
 * so a test can read the panel without a running Foundry.
 *
 * Two meters, then the rows: **Essence** *n / cap* with one socket a point of the cap and the
 * formula in words; **Horde** *places used / places* with Bone's skeleton-only places named apart.
 * One row for each of the raised dead in the order raised: its kind's edge (bone or flesh, never the
 * only carrier - the word is on the row), its name, *weight class · from its spell · places*, its
 * Health as a bar AND *n / max Health* with temporary Health in words, its grafts in words, the
 * marks **Lead** and **Keeps its Reaction** in words, and its own **Dismiss**. A legend repeats the
 * marks. There is no Call the horde control (the lead).
 */

import { HORDE_FLOOR, hordeLoad, isSkeleton, isFleshServant, placesOf } from "./horde.mjs";

const whole = v => Math.max(0, Math.trunc(Number(v)) || 0);

/**
 * @param {{essence?: {value: number, max: number}|null, capacity: {general: number, skeletons: number, total: number},
 *   members?: Array<{id: string, name: string, entry: string, raisedAt?: number, weightClass?: string|null, spell?: string,
 *   health?: number, max?: number, temp?: number, keepsReaction?: boolean, outside?: boolean, controlled?: boolean,
 *   grafts?: string[], img?: string|null}>, lead?: string|null, pendingLead?: string|null, editable?: boolean,
 *   words: object}} o
 */
export function hordePanelContext({ essence = null, capacity, members = [], lead = null, pendingLead = null, editable = true, words = {} } = {}) {
  const w = (k, d) => (typeof words[k] === "function" ? words[k](d ?? {}) : (words[k] ?? k));
  const counted = (members ?? []).filter(m => m && m.outside !== true && !(typeof m.health === "number" && m.health <= 0));
  const load = hordeLoad(counted, capacity ?? { general: HORDE_FLOOR, skeletons: 0 });
  const total = whole(capacity?.total ?? capacity?.general ?? HORDE_FLOOR);
  const used = whole(load.counted);
  const sockets = essence ? Array.from({ length: whole(essence.max) }, (_, i) => ({ on: i < whole(essence.value), label: i < whole(essence.value) ? w("held") : w("empty") })) : [];
  const ordered = [...(members ?? [])].sort((a, b) => (Number(a.raisedAt ?? 0) - Number(b.raisedAt ?? 0))
    || String(a.name ?? "").localeCompare(String(b.name ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
  const rows = ordered.map(m => {
    const max = whole(m.max);
    const health = whole(m.health);
    const temp = whole(m.temp);
    const places = m.outside ? 0 : placesOf(m);
    const kind = isSkeleton(m) ? "bone" : isFleshServant(m) ? "flesh" : "other";
    const isLead = lead === m.id;
    return {
      id: m.id, name: m.name, img: m.img ?? null, kind, kindWord: w(`kind.${kind}`),
      initials: String(m.name ?? "?").split(/\s+/).map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase(),
      meta: [m.weightClass ? w("weight", { weight: m.weightClass }) : null, m.spell ? w("from", { spell: m.spell }) : null,
        m.outside ? w("outside") : m.controlled ? w("controlled") : w(places === 1 ? "place" : "places", { n: places })].filter(Boolean).join(" · "),
      percent: max > 0 ? Math.max(0, Math.min(100, Math.round((health / max) * 100))) : 0,
      healthText: temp > 0 ? w("healthTemp", { value: health, max, temp }) : w("health", { value: health, max }),
      fallen: health <= 0,
      lead: isLead, pending: pendingLead === m.id && !isLead,
      keepsReaction: m.keepsReaction === true && !m.controlled,
      controlled: m.controlled === true,
      grafts: (m.grafts ?? []).length ? (m.grafts ?? []).map(g => (g === "wardedHide" && (m.wardSchools ?? []).length
        ? w("graftSchool", { graft: w(`graft.${g}`), schools: (m.wardSchools ?? []).map(s => w(`school.${s}`)).join(", ") })
        : w(`graft.${g}`))).join(" · ") : null,
      canDismiss: editable && !m.controlled,
      // 02 §7: a lead is named from here only once the lead has collapsed; at a cast, through its line.
      canLead: editable && !lead && !m.controlled && !m.outside && health > 0
    };
  });
  return {
    essence: essence ? { value: whole(essence.value), max: whole(essence.max), sockets, text: w("essenceCount", { value: whole(essence.value), max: whole(essence.max) }) } : null,
    places: {
      used, total, percent: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0,
      text: w("placesCount", { used, total }),
      skeletons: whole(capacity?.skeletons) > 0 ? w("skeletonPlaces", { n: whole(capacity.skeletons) }) : null,
      over: load.over > 0
    },
    rows,
    empty: rows.length === 0,
    overview: essence ? w("overview", { value: whole(essence.value), max: whole(essence.max), used, total }) : null
  };
}
