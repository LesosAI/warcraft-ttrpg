/** Encrypted spell receipts and recipient-only views.
 * V14 sends hidden ChatMessage, Journal, pack and Setting data to clients.
 * The stored document therefore contains only an authenticated ciphertext;
 * original whisper recipients obtain a decrypted view from the active GM. */

export const PRIVATE_SPELL_KEY_QUERY = "azeroth-rpg.privateSpellKey";
export const PRIVATE_SPELL_VIEW_QUERY = "azeroth-rpg.privateSpellView";
const NS = "azeroth-rpg";
const FLAG = "privateSpellEnvelope";
const VERSION = 1;
const ALGORITHM = "AES-256-GCM";
const RAW_CONTENT = "<p>Private spell record</p>";
const gmCache = new Map();
const recipientCache = new Map();
const updates = new Map();
const unreadable = new Set();
let activeKey = null;
let unlocking = null;
let registered = false;

const worldId = () => globalThis.game?.world?.id ?? globalThis.game?.world?.name ?? null;
const storageName = () => `azeroth-rpg.privateSpellKey.v1.${worldId()}`;
const isGm = user => {
  if (user?.isGM !== true) return false;
  const users = globalThis.game?.users;
  if (!users) return false;
  if (typeof users.get === "function") return users.get(user.id)?.isGM === true;
  const rows = users.contents ?? users;
  return Array.isArray(rows) && rows.some(row => row.id === user.id && row.isGM === true);
};
const activeGm = () => isGm(globalThis.game?.user) && game.users?.activeGM?.id === game.user.id;
const envelopeOf = message => message?.flags?.[NS]?.[FLAG] ?? null;
const allMessages = () => globalThis.game?.messages?.contents ?? [];
// ChatMessage.author is server-stamped on creation (V14 BaseChatMessage#canCreate
// rejects player impersonation). A player-authored fake envelope is never a
// private record and cannot block the GM's key or unrelated valid records.
const trustedEnvelope = message => Boolean(envelopeOf(message) && message.author?.isGM === true);
const encryptedMessages = () => allMessages().filter(trustedEnvelope);
const clone = value => structuredClone(value);

function requireCrypto() {
  if (!worldId()) throw new Error("Private spell storage requires an active world.");
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("Private spells require WebCrypto on localhost or HTTPS.");
  }
  if (!globalThis.localStorage?.getItem || !globalThis.localStorage?.setItem) {
    throw new Error("Private spells require persistent GM browser storage.");
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x4000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("Invalid private key encoding.");
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function keyId(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return bytesToBase64(digest.subarray(0, 16));
}

async function loadKey(bytes, { verifyRecords = "none" } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error("Invalid private spell key.");
  const id = await keyId(bytes);
  const key = { bytes, id, cryptoKey: await crypto.subtle.importKey("raw", bytes,
    { name: "AES-GCM" }, false, ["encrypt", "decrypt"]), world: worldId() };
  if (verifyRecords !== "none" && encryptedMessages().length) {
    const recordedKeys = new Set(encryptedMessages().map(message => envelopeOf(message).kid));
    if (verifyRecords === "strict" && (recordedKeys.size !== 1 || !recordedKeys.has(id))) {
      throw new Error("Private spell backup conflicts with stored record key IDs.");
    }
    let matching = 0;
    for (const message of encryptedMessages()) {
      if (envelopeOf(message).kid !== id) continue;
      try { await open(message, key); matching++; } catch { /* Isolate this record. */ }
    }
    if (!matching) throw new Error("Private spell key does not match stored records.");
  }
  return key;
}

function localKeyBytes() {
  const saved = globalThis.localStorage?.getItem(storageName());
  if (!saved) return null;
  const parsed = JSON.parse(saved);
  if (parsed?.version !== VERSION || parsed.world !== worldId()) throw new Error("Stored private spell key belongs to another world.");
  return base64ToBytes(parsed.key);
}

function saveKey(bytes) {
  globalThis.localStorage?.setItem(storageName(), JSON.stringify({
    version: VERSION, world: worldId(), key: bytesToBase64(bytes)
  }));
}

async function keyFromOtherGm() {
  if (CONFIG.debug?.queries) throw new Error("Disable Foundry query debug logging before private key exchange.");
  for (const user of game.users ?? []) {
    if (!user.active || !user.isGM || user.id === game.user.id) continue;
    try {
      const answer = await user.query(PRIVATE_SPELL_KEY_QUERY, { world: worldId() }, { timeout: 10000 });
      if (answer?.world !== worldId()) continue;
      return base64ToBytes(answer.key);
    } catch { /* Try another connected GM. */ }
  }
  return null;
}

async function unlockKey({ create = false } = {}) {
  requireCrypto();
  if (!isGm(game.user)) throw new Error("Only a GM may unlock private spell records.");
  if (activeKey?.world === worldId()) return activeKey;
  let bytes = localKeyBytes();
  if (!bytes) bytes = await keyFromOtherGm();
  if (!bytes && create && activeGm() && !encryptedMessages().length) {
    bytes = crypto.getRandomValues(new Uint8Array(32));
  }
  if (!bytes) throw new Error("Private spell key unavailable; import its backup or connect a GM who has it.");
  const key = await loadKey(bytes, { verifyRecords: "compatible" });
  if (!localKeyBytes()) saveKey(bytes);
  activeKey = key;
  return key;
}

async function ensureKey(options = {}) {
  requireCrypto();
  if (!isGm(globalThis.game?.user)) throw new Error("Only a GM may unlock private spell records.");
  if (activeKey?.world === worldId()) return activeKey;
  if (unlocking) return unlocking;
  const pending = unlockKey(options);
  unlocking = pending;
  try { return await pending; }
  finally { if (unlocking === pending) unlocking = null; }
}

function aad(id, kind) {
  return new TextEncoder().encode(JSON.stringify({ version: VERSION, world: worldId(), id, kind }));
}

async function seal(id, kind, payload, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ version: VERSION, ...payload }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv,
    additionalData: aad(id, kind), tagLength: 128 }, key.cryptoKey, plaintext));
  return { version: VERSION, algorithm: ALGORITHM, kind, kid: key.id,
    iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}

async function open(message, key) {
  const envelope = envelopeOf(message);
  if (!envelope || envelope.version !== VERSION || envelope.algorithm !== ALGORITHM
    || typeof envelope.kind !== "string" || envelope.kid !== key.id) {
    throw new Error("Private spell envelope is invalid.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv),
      additionalData: aad(message.id, envelope.kind), tagLength: 128 }, key.cryptoKey,
    base64ToBytes(envelope.ciphertext));
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (payload.version !== VERSION || typeof payload.content !== "string"
      || !payload.flags || typeof payload.flags !== "object" || Array.isArray(payload.flags)
      || !Array.isArray(payload.audience) || payload.audience.some(id => typeof id !== "string")
      || typeof payload.authorId !== "string" || payload.authorId !== message.author?.id) {
      throw new Error("Invalid payload");
    }
    return { content: payload.content, flags: payload.flags, speaker: payload.speaker ?? null,
      audience: payload.audience, authorId: payload.authorId };
  } catch { throw new Error("Private spell record authentication failed."); }
}

async function loadGmMessage(message) {
  if (!trustedEnvelope(message)) throw new Error("Private spell record has no trusted GM author.");
  const key = await ensureKey();
  const existing = gmCache.get(message.id);
  const envelope = envelopeOf(message);
  if (existing?.ciphertext === envelope?.ciphertext) return existing.payload;
  let payload;
  try { payload = await open(message, key); }
  catch (error) { unreadable.add(message.id); throw error; }
  unreadable.delete(message.id);
  gmCache.set(message.id, { ciphertext: envelope.ciphertext, payload });
  return payload;
}

function payloadFor(message) {
  if (!trustedEnvelope(message)) return null;
  if (!isGm(globalThis.game?.user) && !message.whisper?.includes(globalThis.game?.user?.id)) return null;
  const cache = isGm(game.user) ? gmCache : recipientCache;
  const entry = cache.get(message.id);
  if (!entry || entry.ciphertext !== envelopeOf(message).ciphertext) {
    return null;
  }
  if (!isGm(game.user) && !entry.payload.audience?.includes(game.user.id)) return null;
  return entry.payload;
}

function applyChanges(payload, changes) {
  const next = clone(payload);
  for (const [path, wrapped] of Object.entries(changes)) {
    const value = foundry.data.operators.ForcedReplacement.get(wrapped);
    if (path === "content") next.content = String(value);
    else if (path === "speaker") next.speaker = clone(value);
    else if (path === "flags") next.flags = clone(value);
    else if (path.startsWith("flags.")) {
      const keys = path.slice(6).split(".");
      if (!keys.length || keys.some(key => !key || ["__proto__", "prototype", "constructor"].includes(key))) {
        throw new Error("Invalid private spell update path.");
      }
      let object = next.flags;
      for (const key of keys.slice(0, -1)) object = object[key] ??= {};
      object[keys.at(-1)] = clone(value);
    } else throw new Error("Unsupported private spell update.");
  }
  return next;
}

function viewOf(message, payload, { readOnly = false } = {}) {
  let view;
  view = new Proxy(message, {
    get(target, property) {
      if (property === "content") return payload.content;
      if (property === "flags") return clone(payload.flags);
      if (property === "speaker") return clone(payload.speaker);
      if (property === "whisper") return [...payload.audience];
      if (property === "update") return async changes => {
        if (readOnly || !activeGm()) throw new Error("Private spell record is read-only here.");
        const previous = updates.get(target.id) ?? Promise.resolve();
        const current = previous.catch(() => {}).then(async () => {
          const key = await ensureKey();
          const currentPayload = await loadGmMessage(target);
          const next = applyChanges(currentPayload, changes);
          const envelope = await seal(target.id, envelopeOf(target).kind, next, key);
          await target.update({ [`flags.${NS}.${FLAG}`]: foundry.data.operators.ForcedReplacement.create(envelope) });
          gmCache.set(target.id, { ciphertext: envelope.ciphertext, payload: next });
          payload = next;
          return view;
        });
        updates.set(target.id, current);
        try { return await current; }
        finally { if (updates.get(target.id) === current) updates.delete(target.id); }
      };
      if (property === "delete") return async (...args) => {
        if (readOnly || !activeGm()) throw new Error("Private spell record is read-only here.");
        const result = await target.delete(...args);
        gmCache.delete(target.id);
        return result;
      };
      if (property === "toObject") return () => ({ ...target.toObject(),
        content: payload.content, flags: clone(payload.flags), speaker: clone(payload.speaker) });
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return view;
}

/** Raw documents may be visible to every client; this status never contains key bytes. */
export function privateSpellKeyStatus() {
  let localKey = false;
  try { localKey = Boolean(globalThis.localStorage?.getItem(storageName())); } catch { /* unavailable */ }
  return { world: worldId(), secureContext: Boolean(globalThis.crypto?.subtle),
    localKey, encryptedRecords: encryptedMessages().length, unreadableRecords: unreadable.size };
}

/** Explicit creation before the first private cast, useful before backing up. */
export async function createPrivateSpellKey() {
  if (!activeGm()) throw new Error("Only the active GM may create the private spell key.");
  const key = await ensureKey({ create: true });
  return { ok: true, keyId: key.id };
}

/** Explicit GM backup action. Never print or write the returned key automatically. */
export async function exportPrivateSpellKey() {
  const key = await ensureKey();
  return `ARPG-PRIVATE-1:${worldId()}:${bytesToBase64(key.bytes)}`;
}

/** Explicit GM restore action; the imported key must open all existing records. */
export async function importPrivateSpellKey(backup) {
  requireCrypto();
  if (!isGm(game.user)) throw new Error("Only a GM may import a private spell key.");
  const prefix = `ARPG-PRIVATE-1:${worldId()}:`;
  if (typeof backup !== "string" || !backup.startsWith(prefix)) throw new Error("Private spell backup belongs to another world.");
  const bytes = base64ToBytes(backup.slice(prefix.length));
  const key = await loadKey(bytes, { verifyRecords: "strict" });
  if (activeKey?.world === worldId() && activeKey.id !== key.id) {
    throw new Error("Imported key conflicts with the active GM key.");
  }
  saveKey(bytes);
  activeKey = key;
  gmCache.clear();
  return { ok: true, keyId: key.id };
}

/** Awaited guard for active-GM handlers. It never patches game.messages globally. */
export function withPrivateSpellRecords(handler) {
  return async (...args) => {
    if (!activeGm()) throw new Error("Private spell records require the active GM.");
    await ensureKey({ create: true });
    for (const message of encryptedMessages()) {
      try { await loadGmMessage(message); } catch { /* The specific ticket remains unavailable. */ }
    }
    return handler(...args);
  };
}

/** Sync compatibility read, after withPrivateSpellRecords or authorized preload. */
export function privateSpellMessage(id) {
  const message = typeof id === "string" ? globalThis.game?.messages?.get(id) : id;
  if (!message) return null;
  if (envelopeOf(message) && !trustedEnvelope(message)) return null;
  const payload = payloadFor(message);
  if (!envelopeOf(message)) return message;
  return payload ? viewOf(message, payload, { readOnly: !activeGm() }) : null;
}

export function privateSpellMessages() {
  return allMessages().map(message => privateSpellMessage(message)).filter(Boolean);
}

/** The stored ChatMessage carries no plaintext content, flags or speaker. */
export async function createPrivateSpellMessage(data, options = {}) {
  if (!activeGm()) throw new Error("Only the active GM may create a private spell record.");
  const key = await ensureKey({ create: true });
  const allowed = ["_id", "content", "flags", "speaker", "whisper", "blind"];
  if (!data || Object.keys(data).some(field => !allowed.includes(field))
    || typeof data.content !== "string" || !data.flags || typeof data.flags !== "object") {
    throw new Error("Invalid private spell record shape.");
  }
  const id = data._id ?? foundry.utils.randomID();
  const kind = Object.keys(data.flags?.[NS] ?? {})[0] ?? "spellRecord";
  const audience = data.whisper ?? [...game.users].filter(user => user.isGM).map(user => user.id);
  if (!Array.isArray(audience) || audience.some(userId => typeof userId !== "string" || !game.users.get(userId))) {
    throw new Error("Invalid private spell audience.");
  }
  const payload = { content: data.content, flags: clone(data.flags), speaker: clone(data.speaker ?? null),
    audience: [...audience], authorId: game.user.id };
  const envelope = await seal(id, kind, payload, key);
  const message = await ChatMessage.create({ _id: id, content: RAW_CONTENT,
    whisper: audience,
    blind: data.blind ?? true, flags: { [NS]: { [FLAG]: envelope } } },
  { ...options, keepId: true });
  gmCache.set(message.id, { ciphertext: envelope.ciphertext, payload });
  return viewOf(message, payload);
}

async function authorizedView(message) {
  if (!envelopeOf(message)) return message;
  if (isGm(game.user)) {
    await loadGmMessage(message);
    return privateSpellMessage(message);
  }
  if (!message.whisper?.includes(game.user.id)) return null;
  let payload = payloadFor(message);
  if (!payload) {
    if (CONFIG.debug?.queries) throw new Error("Disable Foundry query debug logging before private result delivery.");
    const gm = game.users?.activeGM;
    if (!gm) throw new Error("A GM must be connected to view private spell results.");
    const answer = await gm.query(PRIVATE_SPELL_VIEW_QUERY, { messageId: message.id }, { timeout: 30000 });
    if (!answer?.ok || answer.messageId !== message.id || answer.ciphertext !== envelopeOf(message).ciphertext
      || !answer.payload?.audience?.includes(game.user.id)) return null;
    payload = answer.payload;
    recipientCache.set(message.id, { ciphertext: answer.ciphertext, payload });
  }
  return viewOf(message, payload, { readOnly: true });
}

/** Hook adapter for render/create/delete hooks, including a deleted document. */
export function withPrivateSpellMessage(handler) {
  return async (message, ...args) => {
    try {
      const view = await authorizedView(message);
      if (!view) return;
      const html = args[0];
      if (envelopeOf(message) && typeof HTMLElement !== "undefined" && html instanceof HTMLElement) {
        const content = html.querySelector(".message-content");
        const revision = envelopeOf(message).iv;
        if (content && content.dataset.privateSpellRevision !== revision) {
          content.innerHTML = foundry.utils.cleanHTML(view.content);
          content.dataset.privateSpellRevision = revision;
        }
      }
      return handler(view, ...args);
    } catch {
      // Keep the neutral stored content when no GM/key is available.
      return;
    }
  };
}

export async function loadAuthorizedPrivateSpellMessages() {
  if (isGm(game.user)) {
    if (!encryptedMessages().length) return 0;
    await ensureKey();
    let loaded = 0;
    for (const message of encryptedMessages()) {
      try { await loadGmMessage(message); loaded++; } catch { /* Keep other records available. */ }
    }
    return loaded;
  }
  let loaded = 0;
  for (const message of encryptedMessages()) {
    if (!message.whisper?.includes(game.user.id)) continue;
    if (await authorizedView(message)) loaded++;
  }
  return loaded;
}

/** Register during init alongside other CONFIG.queries; safe to call twice. */
export function registerPrivateSpellQueries() {
  if (registered) return;
  registered = true;
  CONFIG.queries[PRIVATE_SPELL_KEY_QUERY] = async (data, { user } = {}) => {
    if (!isGm(game.user) || !isGm(user) || data?.world !== worldId() || CONFIG.debug?.queries) return null;
    const bytes = localKeyBytes();
    return bytes ? { world: worldId(), key: bytesToBase64(bytes) } : null;
  };
  CONFIG.queries[PRIVATE_SPELL_VIEW_QUERY] = async (data, { user } = {}) => {
    if (!activeGm() || !user?.id || CONFIG.debug?.queries) return null;
    const message = game.messages?.get(data?.messageId);
    if (!trustedEnvelope(message) || (!isGm(user) && !message.whisper?.includes(user.id))) return null;
    const payload = await loadGmMessage(message);
    if (!isGm(user) && !payload.audience.includes(user.id)) return null;
    return { ok: true, messageId: message.id, ciphertext: envelopeOf(message).ciphertext,
      payload: clone(payload) };
  };
  Hooks.on("renderChatMessageHTML", withPrivateSpellMessage(() => {}));
  const preload = () => { loadAuthorizedPrivateSpellMessages()
    .then(() => ui.chat?.render?.({ force: true })).catch(() => {}); };
  if (game.ready) preload();
  else Hooks.once("ready", preload);
}
