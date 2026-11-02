const live = new Set();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const activeGM = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const resolve = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };

export function bellowRecoveryViews(actor) {
  if (!activeGM() || !actor || resolve(actor.uuid) !== actor) return [];
  const records = actor.getFlag('azeroth-rpg', 'bellowDeliveries') ?? {};
  return Object.entries(records).filter(([, row]) => ['committing', 'delivering', 'unconfirmed'].includes(row?.state))
    .map(([id, record]) => structuredClone({ actorUuid: actor.uuid, key: `bellowDeliveries.${id}`, record,
      recipients: (record.recipients ?? []).map(row => {
        const target = resolve(row.actorUuid);
        return { actorUuid: row.actorUuid, exists: Boolean(target), effects: [...(target?.effects ?? [])].map(effect =>
          effect.toObject?.() ?? { id: effect.id, flags: effect.flags, disabled: effect.disabled }) };
      }) }));
}

export async function reviewBellowDelivery({ actorUuid, expected, acknowledged } = {}) {
  const actor = resolve(actorUuid), key = expected?.key;
  if (!activeGM() || acknowledged !== true || !actor) return { ok: false, reason: 'authority' };
  const lock = `${actorUuid}:${key}`;
  if (live.has(lock)) return { ok: false, reason: 'busy' };
  const current = bellowRecoveryViews(actor).find(row => row.key === key);
  if (!current || !same(current, expected)) return { ok: false, reason: 'changed' };
  if (current.record.writerId !== game.user.id && game.users.get?.(current.record.writerId)?.active)
    return { ok: false, reason: 'writerActive' };
  live.add(lock);
  try {
    const next = { ...current.record, state: 'reviewed', reviewedBy: game.user.id };
    await actor.setFlag('azeroth-rpg', key, next);
    return { ok: Boolean(activeGM() && same(actor.getFlag('azeroth-rpg', key), next)) };
  } finally { live.delete(lock); }
}

/** Delivery evidence survives interruption before the final feature card.
 * This journal never retries effects, refunds costs or refreshes uses. */
export async function beginBellowJournal(actor, item, recipients) {
  const key = `bellowDeliveries.${foundry.utils.randomID(24)}`;
  const lock = `${actor.uuid}:${key}`;
  let expected = {
    version: 1, sourceUuid: actor.uuid, itemUuid: item.uuid, writerId: game.user.id,
    state: 'committing', messageUuid: null,
    recipients: recipients.map(row => ({ actorUuid: row.actor.uuid, name: row.actor.name,
      delivery: structuredClone(row.bellowDelivery), state: 'pending', effectId: null }))
  };
  const write = async next => {
    if (!actor.isOwner || !same(actor.getFlag('azeroth-rpg', key), expected)) throw Error('Bellow delivery journal changed');
    await actor.setFlag('azeroth-rpg', key, next);
    if (!same(actor.getFlag('azeroth-rpg', key), next)) throw Error('Bellow delivery journal unconfirmed');
    expected = next;
  };
  if (!actor.isOwner) throw Error('Bellow delivery journal requires ownership');
  live.add(lock);
  await actor.setFlag('azeroth-rpg', key, expected);
  if (!same(actor.getFlag('azeroth-rpg', key), expected)) throw Error('Bellow delivery journal unconfirmed');
  return {
    key,
    async cancelBeforePayment() {
      if (expected.state !== 'committing') throw Error('Bellow payment may have started');
      await write({ ...expected, state: 'cancelled' });
      live.delete(lock);
    },
    async delivering() {
      if (expected.state !== 'committing') throw Error('Bellow delivery already started');
      await write({ ...expected, state: 'delivering' });
    },
    async record(result) {
      if (expected.state !== 'delivering') throw Error('Bellow delivery not started');
      const index = expected.recipients.findIndex(row => row.actorUuid === result.actorUuid);
      if (index < 0 || expected.recipients[index].state !== 'pending') throw Error('Bellow recipient changed');
      const recipients = structuredClone(expected.recipients);
      recipients[index] = structuredClone(result);
      await write({ ...expected, recipients });
    },
    async published(message) {
      if (!message?.uuid) throw Error('Bellow card publication unconfirmed');
      await write({ ...expected, messageUuid: message.uuid,
        state: expected.recipients.every(row => row.state === 'confirmed') ? 'complete' : 'unconfirmed' });
      live.delete(lock);
    }
  };
}
