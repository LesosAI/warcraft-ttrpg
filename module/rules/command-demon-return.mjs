/** Restore only permission/disposition values still matching the command's grant.
 * A later GM edit wins. No original state is invented for legacy bonds. */
export function commandDemonReturn(record, current) {
  const map = value => value && typeof value === "object" && !Array.isArray(value);
  const levels = value => map(value) && Object.entries(value).every(([key, n]) =>
    /^[a-zA-Z0-9_-]+$/.test(key) && Number.isInteger(n) && n >= -1 && n <= 3);
  const tokensValid = rows => Array.isArray(rows) && rows.every(row => typeof row?.uuid === "string"
    && row.uuid.length > 0 && Number.isInteger(row.disposition)) && new Set(rows.map(row => row.uuid)).size === rows.length;
  if (record?.version !== 1 || !levels(record.ownership) || !levels(record.granted)
    || !levels(current?.ownership) || !Number.isInteger(record.disposition)
    || !Number.isInteger(record.prototype) || !tokensValid(record.tokens) || !tokensValid(current.tokens)) return null;
  const actor = {};
  for (const [key, granted] of Object.entries(record.granted)) {
    if (current.ownership[key] !== granted || record.ownership[key] === granted) continue;
    if (Object.hasOwn(record.ownership, key)) actor[`ownership.${key}`] = record.ownership[key];
    else actor[`ownership.-=${key}`] = null;
  }
  if (current.prototype === record.disposition && current.prototype !== record.prototype)
    actor["prototypeToken.disposition"] = record.prototype;
  const originals = new Map(record.tokens.map(t => [t.uuid, t.disposition]));
  const tokens = current.tokens.filter(t => t.disposition === record.disposition)
    .map(t => ({ uuid: t.uuid, disposition: originals.get(t.uuid) ?? record.prototype }))
    .filter(t => t.disposition !== record.disposition);
  return { actor, tokens };
}
