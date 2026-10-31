import { NPC_DISARM } from "../rules/npc-disarm.mjs";
import { disarmSelectionValid } from "../rules/npc-disarm-options.mjs";
import { disarmInventory } from "./npc-disarm-picker.mjs";
import { disarmedAttack } from "./npc-disarm.mjs";
import { weaponTraitEffects } from "../rules/weapon-traits.mjs";
import { strikeFor, strikeForRow, weaponFacts } from "../rules/strikes.mjs";
import { attackAbility } from "../rules/ammunition.mjs";

/** A non-damaging Attack Test, not an attack or a Parry. The ordinary dialog
 * supplies attack modifiers, but its runner only rolls and records the Test:
 * no Critical Injury, hit riders, ammunition, Momentum or Reaction payment.
 */
export async function rollDisarmSide(actor, picked, { valid, source = null, defending = false } = {}) {
  const eligible = () => typeof valid === "function" && valid()
    && disarmSelectionValid(picked?.selection, disarmInventory(actor), { rowConfirmed: picked?.rowConfirmed });
  if (!eligible()) return null;
  const reference = picked.selection.weapon, sys = actor.system;
  const item = reference.kind === "item" ? actor.items.get(reference.itemId) : null;
  const row = reference.kind === "npcRow" ? sys.attacks[reference.index] : null;
  const strike = item ? strikeFor(weaponFacts(item), { mode: "hand" }) : strikeForRow(row, { index: reference.index, mode: "hand" });
  if (!defending && strike.rangeKind !== "melee") return null;
  const weaponId = item?.id ?? null;
  if (disarmedAttack(actor, { weaponId, strike })) return null;
  const strength = sys.abilities?.str;
  // The defender uses the selected weapon's ordinary Attack Test, but does
  // not fire or throw it: no ammunition, damage or ranged attack side effects.
  const ability = item ? attackAbility(item.system, "hand") : "str";
  const abilityLabel = ability === "dex" ? "AZEROTH.Ability.Dex.Label" : "AZEROTH.Ability.Str.Label";
  const effects = weaponTraitEffects((item?.system ?? row)?.traits ?? [], { strength: strength?.total ?? strength?.value ?? 10 });
  const modifiers = row ? [{ label: "AZEROTH.Sheet.AttackBonus", value: row.bonus ?? 0 }]
    : [{ label: abilityLabel, value: sys.abilities?.[ability]?.mod ?? 0 }, { label: "AZEROTH.Sheet.Proficiency", value: sys.proficiency ?? 0 }];
  if (sys.attackBonus) modifiers.push({ label: "AZEROTH.Sheet.Passive", value: sys.attackBonus });
  const { rollWithDialog } = await import("../applications/actions.mjs");
  return rollWithDialog(actor, { kind: "attack", title: "Disarm: Opposed Attack Test", dc: NPC_DISARM.dc,
    damage: null, budget: "none", gainsMomentum: false, targets: [], modifiers,
    weaponEffects: effects, heavyBane: effects.heavyBane, weaponId, strike, source,
    run: async args => {
      if (!eligible() || disarmedAttack(actor, { weaponId, strike })) return null;
      if (args.dc !== NPC_DISARM.dc) {
        ui.notifications?.warn("Both Disarm Tests must use DC 12."); return null;
      }
      const { AzerothRoll } = await import("../dice/azeroth-roll.mjs");
      const roll = AzerothRoll.build({ dc: NPC_DISARM.dc, modifiers: args.modifiers, boons: args.boons,
        banes: args.banes, kind: "attack", rollData: actor.getRollData?.() ?? {} });
      roll.options.provenance.push(...(args.provenanceExtra ?? []));
      await roll.evaluate();
      const explanation = roll.options.provenance.map(part => {
        const label = game.i18n.localize(part.label);
        return `${foundry.utils.escapeHTML(label)}: ${foundry.utils.escapeHTML(String(part.formula ?? part.value ?? ""))}`;
      }).join("; ");
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll],
        content: `<h3>Disarm: Opposed Attack Test</h3><p>${explanation}</p>${await roll.render()}`,
        flags: { "azeroth-rpg": { kind: "npcDisarmTest", source, strike, dc: NPC_DISARM.dc } } });
    }
  });
}
