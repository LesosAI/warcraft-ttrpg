import { withSpellstealUseLock } from "./spellsteal-use.mjs";
import { sameSpellstealRecoveryState as same, spellstealAlreadyDelivered } from "../rules/spellsteal-recovery.mjs";
import { reconcileSustainedSpells } from "./sustained-spells.mjs";
import { sweepAreas, SWEEP_DELETE } from "../canvas/sustained-areas.mjs";

const scope = "azeroth-rpg", flag = "spellstealTransfers";
const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const writer = () => game.user?.isGM && game.users.activeGM?.id === game.user.id;
const otherWriterActive = (row, gm) => [row.request?.writerId,
  ...(row.reviews ?? []).filter(review => review.state === "pending").map(review => review.userId)]
  .some(id => id && id !== gm && game.users.get?.(id)?.active);
const actors = () => {
  const found = new Map(values(game.actors).map(actor => [actor.uuid, actor]));
  for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) {
    if (token.actor) found.set(token.actor.uuid, token.actor);
  }
  return [...found.values()].filter(actor => fromUuidSync(actor.uuid) === actor);
};

export function spellstealRecoveryView(caster, key) {
  if (!writer() || caster?.documentName !== "Actor" || fromUuidSync(caster.uuid) !== caster) return null;
  const rows = caster.getFlag(scope, flag);
  if (!Array.isArray(rows)) return null;
  const matches = rows.filter(row => row.key === key);
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (!row.request || ["done", "closed"].includes(row.request.state)) return null;
  let source, cast;
  try { [source, cast] = JSON.parse(key); } catch { return null; }
  if (source !== caster.uuid || typeof cast !== "string" || !cast) return null;
  const mage = fromUuidSync(row.request.mageUuid);
  if (mage?.documentName !== "Actor" || mage === caster) return null;
  const delivery = row.delivery;
  if (delivery && (delivery.key !== key || delivery.cast !== cast || delivery.casterUuid !== caster.uuid
    || delivery.recipientUuid !== mage.uuid || !delivery.transactionId)) return null;
  const effects = actors().flatMap(actor => values(actor.effects).filter(effect => {
    const f = effect.flags?.[scope];
    return f?.cast === cast && ([caster.uuid, mage.uuid].includes(effect.origin)
      || (!effect.origin && f.spell === delivery?.plan?.inventory?.entry?.uuid)
      || (delivery?.transactionId && f.sustainTransfer?.transactionId === delivery.transactionId));
  }).map(effect => ({ ...effect.toObject(), uuid: effect.uuid, parentUuid: actor.uuid })));
  // Another transfer's marker is never ours to recover.
  if (effects.some(effect => effect.flags?.[scope]?.sustainTransfer
    && effect.flags[scope].sustainTransfer.transactionId !== delivery?.transactionId)) return null;
  const regions=values(game.scenes).flatMap(scene=>values(scene.regions).filter(region=>{
    const f=region.flags?.[scope];
    return f?.cast===cast && ([caster.uuid,mage.uuid].includes(f.caster)
      || (delivery?.transactionId && f.sustainRegionTransfer?.transactionId===delivery.transactionId));
  }).map(region=>({...region.toObject(),uuid:region.uuid,parentUuid:scene.uuid})));
  if(regions.some(region=>region.flags?.[scope]?.sustainRegionTransfer
    && region.flags[scope].sustainRegionTransfer.transactionId!==delivery?.transactionId))return null;
  const casterEntries = caster.getFlag(scope, "sustaining") ?? [], mageEntries = mage.getFlag(scope, "sustaining") ?? [];
  if (![casterEntries, mageEntries].every(Array.isArray)) return null;
  if ([...casterEntries, ...mageEntries].some(entry => entry.cast === cast && entry.sustainTransfer
    && entry.sustainTransfer.transactionId !== delivery?.transactionId)) return null;
  const view = structuredClone({ key, cast, casterUuid: caster.uuid, mageUuid: mage.uuid, row,
    casterEntries, mageEntries, effects: effects.sort((a, b) => a.uuid.localeCompare(b.uuid)),
    regions:regions.sort((a,b)=>a.uuid.localeCompare(b.uuid)),
    survivingOriginals: [...(delivery?.plan?.relocation?.removals ?? []),...(delivery?.plan?.inventory?.regions ?? [])]
      .filter(doc => fromUuidSync(doc.uuid)).map(doc => doc.uuid).sort() });
  return { ...view, canConfirm: spellstealAlreadyDelivered(view) };
}

export function spellstealRecoveryRows() {
  if (!writer()) return [];
  return actors().flatMap(caster => {
    const rows = caster.getFlag(scope, flag);
    return (Array.isArray(rows) ? rows : []).flatMap(row => {
      const view = spellstealRecoveryView(caster, row.key);
      return view ? [{ ...view, casterName: caster.name, mageName: fromUuidSync(view.mageUuid)?.name ?? "",
        spellName: row.delivery?.plan?.inventory?.entry?.name
          ?? view.casterEntries.find(entry => entry.cast === view.cast)?.name ?? view.cast }] : [];
    });
  });
}

/** Explicit GM adjudication only. Never charges, refunds or resumes payment. */
export async function recoverSpellsteal({ casterUuid, key, action, expected }) {
  return withSpellstealUseLock(async () => {
    const gm = game.user?.id;
    if (!writer() || !["confirm", "end"].includes(action)) return { ok: false, reason: "authority" };
    const caster = fromUuidSync(casterUuid), current = spellstealRecoveryView(caster, key);
    if (!current || !same(current, expected)) return { ok: false, reason: "changed" };
    if (otherWriterActive(current.row, gm)) return { ok: false, reason: "writerActive" };
    if (action === "confirm" && !current.canConfirm) return { ok: false, reason: "incomplete" };
    const mage = fromUuidSync(current.mageUuid);
    let view = structuredClone(current);
    const check = () => {
      if (!writer() || game.user.id !== gm || otherWriterActive(view.row, gm)
        || !same(spellstealRecoveryView(caster, key), view)) throw Error("Recovery state changed");
    };
    const save = async row => {
      check();
      await caster.setFlag(scope, flag, caster.getFlag(scope, flag).map(value => value.key === key ? row : value));
      view.row = structuredClone(row);
      view.canConfirm = spellstealAlreadyDelivered(view);
      check();
    };
    try {
      const review = { id: foundry.utils.randomID(), userId: gm, action, state: "pending", time: game.time.worldTime };
      const reviews = [...(view.row.reviews ?? []), review];
      await save({ ...view.row, reviews });
      if (action === "end" && view.row.delivery) {
        // Delete carriers before removing holds; ordinary orphan hooks cannot
        // race us to delete the same effects after the held records disappear.
        for (const effect of [...view.effects]) {
          check();
          const owner = fromUuidSync(effect.parentUuid);
          await owner.deleteEmbeddedDocuments("ActiveEffect", [effect._id]);
          view.effects = view.effects.filter(row => row.uuid !== effect.uuid);
          view.survivingOriginals = view.survivingOriginals.filter(uuid => uuid !== effect.uuid);
          view.canConfirm = spellstealAlreadyDelivered(view); check();
        }
        for(const region of [...view.regions]) {
          check();
          await fromUuidSync(region.parentUuid).deleteEmbeddedDocuments('Region',[region._id],{[SWEEP_DELETE]:true});
          view.regions=view.regions.filter(row=>row.uuid!==region.uuid);
          view.survivingOriginals=view.survivingOriginals.filter(uuid=>uuid!==region.uuid);
          view.canConfirm=spellstealAlreadyDelivered(view);check();
        }
        for (const [actor, field] of [[caster, "casterEntries"], [mage, "mageEntries"]]) {
          const next = view[field].filter(entry => entry.cast !== view.cast);
          if (same(next, view[field])) continue;
          check(); await actor.setFlag(scope, "sustaining", next);
          view[field] = next; view.canConfirm = spellstealAlreadyDelivered(view); check();
        }
      }
      // Also finish orphan cleanup from an interrupted capacity replacement.
      check(); await reconcileSustainedSpells(); await sweepAreas({ caster: mage.uuid }); check();
      const row = { ...view.row, request: { ...view.row.request, state: action === "confirm" ? "done" : "closed" },
        reviews: reviews.map(value => value.id === review.id ? { ...value, state: "done" } : value) };
      check();
      await caster.setFlag(scope, flag, caster.getFlag(scope, flag).map(value => value.key === key ? row : value));
      if (!writer() || game.user.id !== gm || !same(caster.getFlag(scope, flag).find(value => value.key === key), row)) throw Error("Recovery acknowledgement missing");
      return { ok: true, action };
    } catch { return { ok: false, reason: "review" }; }
  });
}
