/** Only explicitly linked pack attacks enter the owned-weapon workflow. */
export function npcArmamentFor(actor, row) {
  if (!actor?.flags?.["azeroth-rpg"]?.armamentRows?.includes(row?.name)) return null;
  const items = [...(actor.items?.contents ?? actor.items ?? [])].filter(i => i.type === "weapon"
    && i.flags?.["azeroth-rpg"]?.npcAttackRows?.includes(row.name));
  const weapon = items.length === 1 && items[0].system?.equipped === true ? items[0] : null;
  return { weapon, primary: weapon?.flags?.["azeroth-rpg"]?.npcAttackRow === row.name };
}
