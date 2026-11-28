import { chainLightningFinishEvidence, requestChainLightningReview } from "../effects/chain-lightning-cast.mjs";

// What the chat shows about the cast, in words, by `finishEvidence`'s kind and reason (D-2174).
const EVIDENCE_WORDS = Object.freeze({
  complete: "AZEROTH.ChainLightning.Review.Evidence.Complete",
  resume: "AZEROTH.ChainLightning.Review.Evidence.Resume",
  noCard: "AZEROTH.ChainLightning.Review.Evidence.NoCard",
  manyCards: "AZEROTH.ChainLightning.Review.Evidence.ManyCards",
  superseded: "AZEROTH.ChainLightning.Review.Evidence.Superseded",
  unreadable: "AZEROTH.ChainLightning.Review.Evidence.Unreadable",
  noTotal: "AZEROTH.ChainLightning.Review.Evidence.NoTotal",
  notSuccessful: "AZEROTH.ChainLightning.Review.Evidence.NotSuccessful",
  noRecord: "AZEROTH.ChainLightning.Review.Evidence.NoRecord",
  record: "AZEROTH.ChainLightning.Review.Evidence.Record"
});
const RESULT_WORDS = Object.freeze({
  writerActive: "AZEROTH.ChainLightning.Review.WriterActive",
  busy: "AZEROTH.ChainLightning.Review.Busy",
  evidence: "AZEROTH.ChainLightning.Review.EvidenceChanged",
  route: "AZEROTH.ChainLightning.Review.ResumeRoute",
  card: "AZEROTH.ChainLightning.Review.ResumeFailed"
});

export async function reviewChainLightningCast(actor) {
  if (!game.user?.isGM) return null;
  const record = actor.getFlag("azeroth-rpg", "chainLightningCast");
  if (record?.stage !== "pending") { ui.notifications.info(game.i18n.localize("AZEROTH.ChainLightning.Review.None")); return null; }
  const expected = structuredClone(record);
  const evidence = chainLightningFinishEvidence(actor, record);
  // A card the cast posted and finished is closed against it, and a paid card whose arcs were not resolved is
  // resumed from its record; every other case is reconciled by hand.
  const finish = evidence.kind === "complete" || evidence.kind === "resume";
  const action = finish ? "finish" : "review";
  const cards = game.messages.filter(message => message.getFlag("azeroth-rpg", "chainLightningRequestId") === record.requestId
    && message.getFlag("azeroth-rpg", "caster") === actor.uuid).map(message => ({ uuid: message.uuid, label: new Date(message.timestamp).toLocaleString() }));
  const evidenceLine = game.i18n.localize(EVIDENCE_WORDS[evidence.kind === "none" ? evidence.reason : evidence.kind] ?? EVIDENCE_WORDS.unreadable);
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/dialog/chain-lightning-review.hbs",
    { name: actor.name, cards, evidence: evidenceLine, finish });
  const acknowledged = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("AZEROTH.ChainLightning.Review.Title") }, classes: ["azeroth", "azeroth-ice-block-review"], position: { width: 560 }, content, rejectClose: false,
    buttons: [{ action, label: game.i18n.localize(finish ? "AZEROTH.ChainLightning.Review.Finish" : "AZEROTH.ChainLightning.Review.Confirm"),
      callback: (_event, button) => button.form.elements.acknowledged?.checked === true },
    { action: "cancel", label: game.i18n.localize("AZEROTH.ChainLightning.Review.Cancel"), default: true, callback: () => false }],
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form");
      const update = () => { form.querySelector(`[data-action="${action}"]`).disabled = form.elements.acknowledged?.checked !== true; };
      form.addEventListener("change", update); update();
    }
  });
  if (acknowledged !== true) return null;
  const result = await requestChainLightningReview(actor, expected, finish ? evidence.kind : "review");
  ui.notifications[result.ok ? "info" : "warn"](game.i18n.localize(result.ok
    ? (evidence.kind === "resume" ? "AZEROTH.ChainLightning.Review.Resumed"
      : finish ? "AZEROTH.ChainLightning.Review.Finished" : "AZEROTH.ChainLightning.Review.Reviewed")
    : RESULT_WORDS[result.reason] ?? "AZEROTH.ChainLightning.Review.Changed"));
  return result;
}
