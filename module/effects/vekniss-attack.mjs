import { preparedVoidwalkerDefender } from "./voidwalker-sacrifice-targets.mjs";
import { VEKNISS_FLAG, veknissChargeBonus } from "../rules/vekniss.mjs";

/** Final roll adapter for a declared Stinger charge. The caller supplies a
 * fresh GM-only document reader; no client snapshot is used as authority. */
export async function rollVeknissCharge({ actor, index = 0, targets, event = null, store, readCurrent } = {}) {
  const { npcAttackWithDialog } = await import("../applications/actions.mjs");
  const { rollTest } = await import("../dice/workflows.mjs");
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  const snapshot = token => targetSnapshots([{ id: token.id, actor: token.actor, name: token.name, scene: token.parent }])[0];
  return npcAttackWithDialog(actor, index, event, {
    title: "Stinger Charge", targets, mode: "hand", singleAttack: true,
    run: async args => {
      const current = await readCurrent();
      if (!current?.context || current.context.sourceUuid !== actor.uuid || args.actor !== actor) return null;
      const intended = current.target;
      if (intended?.parent?.id !== current.context.sceneId || intended?.id !== current.context.targetTokenId
        || intended?.actor?.uuid !== current.context.targetUuid || !preparedVoidwalkerDefender(args, intended, snapshot)) {
        ui.notifications?.warn("The charge must attack its declared target.");
        return null;
      }
      const result = await store.attack(current.context, current.source, current.target, {
        paidFeet: current.paidFeet,
        roll: async ({ bonus }) => {
          const defender = preparedVoidwalkerDefender(args, intended, snapshot);
          if (!defender) return null;
          if (defender.intercepted) {
            const effects = [...(defender.actor.effects ?? [])].map(effect => {
              const state = effect.flags?.["azeroth-rpg"]?.[VEKNISS_FLAG];
              let source;
              try { source = state?.sourceUuid ? fromUuidSync(state.sourceUuid) : null; } catch { source = null; }
              return { state, active: effect.active !== false && !effect.disabled && !effect.isSuppressed
                && effect.duration?.expired !== true && [...(effect.statuses ?? [])].includes("poisoned")
                && source?.documentName === "Actor" && source.uuid === state?.sourceUuid };
            });
            bonus = veknissChargeBonus({ charging: true, targetUuid: defender.actor.uuid,
              combatUuid: current.context.combatUuid, effects });
          }
          const selected = defender.targets;
          const card = await rollTest({ ...args, targets: selected,
          ...(Number.isFinite(args.dc) ? { dc: args.dc + selected[0].defense - args.targets[0].defense } : {}),
          extraRating: (args.extraRating ?? 0) + bonus,
          provenanceExtra: [...(args.provenanceExtra ?? []), ...(bonus ? [{ label: "Vekniss Catalyst", value: bonus }] : [])]
          });
          if (card && typeof card.rolls?.[0]?.outcome?.success === "boolean") {
            const hit = card.rolls?.[0]?.outcome?.success === true;
            const featureKey = bonus ? "ability:catalyst-charge" : "ability:stinger-charge";
            const source = { sceneId: current.context.sceneId, tokenId: current.context.sourceTokenId };
            // This is an outcome record only. Damage remains on the ordinary
            // attack card, including all its mitigation and reaction buttons.
            try { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
              content: `<p>Stinger Charge: ${hit ? "hit" : "miss"}.${hit && bonus ? " Vekniss Catalyst added 4 damage to the attack's Damage Rating." : ""}</p>`,
              flags: { "azeroth-rpg": { kind: "ability",
                source: source ?? null,
                featureKey: featureKey,
                casting: false, success: hit, targets: selected,
                attackMessageId: card.id, chargeBonus: bonus } } }); }
            catch { ui.notifications?.warn("The charge attack was rolled, but its visual cue could not be posted. Use the existing attack card; do not roll again."); }
          }
          return card;
        }
      });
      if (!result.ok) ui.notifications?.warn(result.message ?? `Stinger Charge could not be completed (${result.reason}).`);
      return result.card ?? null;
    }
  });
}
