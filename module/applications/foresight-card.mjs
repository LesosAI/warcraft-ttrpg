import { foresightFor } from "../rules/class-talents.mjs";
import { foresightTimingAllows } from "../rules/foresight-timing.mjs";
import { drawCardPartial } from "../helpers/card-partials.mjs";

const FORESIGHT_REVEAL = "systems/azeroth-rpg/templates/chat/partials/foresight-reveal.hbs";

/** Render from the persisted window on every client, including after reload.
 * Damage remains recorded for resolution; this controls normal card visibility,
 * not access to the underlying ChatMessage by a developer or administrator. */
export function showForesightTiming(message, html, priests = []) {
  const flags = message.flags?.["azeroth-rpg"] ?? {};
  const state = flags.attackResolution;
  const unrevealed = state?.damageRevealed === false;
  const unsettled = state?.targets?.some(row => !["pending", "applied", "phased"].includes(row?.stage));
  for (const block of html.querySelectorAll("[data-foresight]")) {
    const index = Number(block.querySelector("[data-target-index]")?.dataset.targetIndex);
    if (unsettled || state?.targets?.[index]?.stage !== "pending"
      || !priests.some(priest => !state.targets[index].wardedBy?.includes(priest.uuid)
        && foresightTimingAllows(foresightFor(priest.takenTalents?.() ?? [])?.rank, state?.damageRevealed))) block.remove();
  }
  if (!unrevealed) return;
  for (const el of html.querySelectorAll('.azeroth-damage, .azeroth-card-mitigated, [data-action="applyDamage"]:not([data-self]), [data-action="blowShare"], [data-action="guidanceHeal"]')) el.remove();
  const body = html.querySelector(".azeroth-card-body");
  if (!body) return;
  const note = document.createElement("p");
  note.className = "azeroth-note azeroth-foresight-window";
  note.textContent = game.i18n.localize(unsettled ? "AZEROTH.Foresight.ResolutionPending" : "AZEROTH.Foresight.BeforeReveal");
  body.append(note);
  const index = state.targets.findIndex((row, i) => row.stage === "pending"
    && flags.damageByTarget?.[i]?.hit === true && flags.damageByTarget[i].withdrawn !== true);
  if (index < 0 || unsettled || !(game.user?.isGM || message.author?.id === game.user?.id)) return;
  const actions = drawCardPartial(FORESIGHT_REVEAL, { index }, message);
  if (actions) body.append(actions);
}
