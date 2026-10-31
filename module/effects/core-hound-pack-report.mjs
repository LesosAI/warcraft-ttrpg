/** Durable outcome card for actual revival attempts, not every Health hook. */
export async function reportCoreHoundPack(combat, packId, result) {
  const restored = result?.restored ?? [], uncertain = result?.uncertain ?? [], deferred = result?.deferred ?? [];
  if (!restored.length && !uncertain.length && !deferred.length) return null;
  if (game.user?.isGM !== true || game.users?.activeGM?.id !== game.user.id) return null;
  const escape = foundry.utils.escapeHTML;
  const name = uuid => {
    try { return fromUuidSync(uuid)?.name ?? uuid; } catch { return uuid; }
  };
  const lines = [
    ...restored.map(uuid => `${name(uuid)} returned at full current maximum Health. Its defeated markers were cleared.`),
    ...uncertain.map(uuid => `${name(uuid)}: the revival write is uncertain. Check Health and defeated markers before making further changes.`),
    ...deferred.map(uuid => `${name(uuid)}: revival was claimed but not completed. Review the pack and resolve this member manually; it will not retry automatically.`)
  ];
  const targets = restored.flatMap(uuid => {
    try {
      const token = fromUuidSync(uuid);
      if (token?.documentName !== "Token" || token.parent !== combat.scene
        || combat.scene?.tokens?.get(token.id) !== token || !(token.actor?.system?.health?.value > 0)) return [];
      return [{ sceneId: combat.scene.id, tokenId: token.id, actorUuid: token.actor.uuid, name: token.name }];
    } catch { return []; }
  });
  const source = targets[0] ?? null;
  return ChatMessage.create({
    content: `<p><strong>Pack Rekindling</strong></p>${lines.map(line => `<p>${escape(line)}</p>`).join("")}`,
    flags: { "azeroth-rpg": { ...(targets.length ? { kind: "ability",
      source: source ?? null,
      featureKey: "ability:pack-rekindling",
      casting: false,
      success: true, targets
    } : {}), coreHoundPackOutcome: {
      combatUuid: combat.uuid, packId, restored: [...restored], uncertain: [...uncertain], deferred: [...deferred],
      reason: result.reason ?? null
    } } }
  });
}
