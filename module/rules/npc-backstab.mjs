/** Tabletop adaptation of Classic NPC Backstab. Position remains the GM's
 * judgement under 06's flanking/hiding rules; token rotation is not facing. */
export function npcBackstabLines(actor, spec = {}) {
  if (actor?.type !== "npc" || spec.kind !== "attack" || spec.parry === true || !spec.damage
    || (spec.strike?.rangeKind ?? spec.rangeKind) !== "melee"
    || !actor.system?.creatureAbilities?.some(row => row.name === "Backstab")) return [];
  return [{ id: "npc-backstab", name: "Backstab", label: "AZEROTH.Dialog.NpcBackstab",
    amount: 2, checked: false }];
}
