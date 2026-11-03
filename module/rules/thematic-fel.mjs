/** Pure limits for Summoner's Writ and Fel Surety. */
export const THEMATIC_FEL_SPELLS = Object.freeze(["summoners-writ", "fel-surety"]);
export const WRIT_DURATION_SECONDS = 8 * 60 * 60;
export const WRIT_RANGE_FEET = 60;
export const WRIT_REVOKE_ACTION = "half";
export const SURETY_DURATION_SECONDS = 60;
export const SURETY_RANGE_FEET = 30;
export const SURETY_MAX_POWER = 6;
const NONDELEGABLE_WRIT_OPERATIONS = new Set(["dismiss", "release", "rebind", "transfer", "delegate"]);

const validTime = value => Number.isFinite(value) && value >= 0;
const identity = value => typeof value === "string" && value.trim().length > 0;

function ownedBoundDemon(bond, casterUuid) {
  return bond?.kind === "demon" && bond.ownerUuid === casterUuid && bond.temporarilyEnslaved !== true;
}

function current(record, now) {
  return Boolean(record && record.revokedAt == null && validTime(now) && validTime(record.createdAt)
    && validTime(record.expiresAt) && record.expiresAt > record.createdAt
    && now >= record.createdAt && now < record.expiresAt);
}

/**
 * Start a temporary command permission on the existing world actor bond.
 * This record is deliberately not an owner, bond, turn, or action-budget record.
 */
export function createSummonersWrit({
  casterUuid = null,
  casterClass = null,
  demonUuid = null,
  delegateUuid = null,
  bond = null,
  delegateConsented = false,
  touches = { casterDemon: false, casterDelegate: false },
  temporarilyEnslaved = false,
  activeWrits = [],
  now = null
} = {}) {
  if (casterClass !== "Warlock") return { ok: false, reason: "class" };
  if (!identity(casterUuid) || !identity(demonUuid) || !identity(delegateUuid) || casterUuid === delegateUuid) {
    return { ok: false, reason: "identity" };
  }
  if (!validTime(now)) return { ok: false, reason: "time" };
  if (temporarilyEnslaved || !ownedBoundDemon(bond, casterUuid)) return { ok: false, reason: "bond" };
  if (delegateConsented !== true) return { ok: false, reason: "consent" };
  if (touches?.casterDemon !== true || touches?.casterDelegate !== true) return { ok: false, reason: "touch" };
  if (activeWrits.some(writ => writ?.casterUuid === casterUuid && current(writ, now))) {
    return { ok: false, reason: "alreadyDelegated" };
  }

  return {
    ok: true,
    reason: null,
    writ: {
      casterUuid,
      demonUuid,
      delegateUuid,
      createdAt: now,
      expiresAt: now + WRIT_DURATION_SECONDS,
      revokedAt: null
    }
  };
}

/** Current permission state; going out of range suspends and later restores it. */
export function writStatus(writ, {
  demonUuid = null,
  bond = null,
  delegateFeetFromDemon = null,
  now = null
} = {}) {
  if (!writ || !identity(writ.casterUuid) || !identity(writ.demonUuid) || !identity(writ.delegateUuid)) return "invalid";
  if (writ.revokedAt != null) return "revoked";
  if (!validTime(now) || !validTime(writ.createdAt) || !validTime(writ.expiresAt) || writ.expiresAt <= writ.createdAt) return "invalid";
  if (now < writ.createdAt) return "notStarted";
  if (now >= writ.expiresAt) return "expired";
  if (demonUuid !== writ.demonUuid || !ownedBoundDemon(bond, writ.casterUuid)) return "unbound";
  if (!Number.isFinite(delegateFeetFromDemon) || delegateFeetFromDemon < 0) return "invalidRange";
  if (delegateFeetFromDemon > WRIT_RANGE_FEET) return "suspended";
  return "active";
}

/** Permission to issue the bound demon's existing commands, without ownership. */
export function mayDelegateDemonCommand(writ, {
  requesterUuid = null,
  operation = "ordinary",
  demonUuid = null,
  bond = null,
  delegateFeetFromDemon = null,
  now = null
} = {}) {
  if (!writ || requesterUuid !== writ.delegateUuid) return { ok: false, reason: "notDelegate" };
  if (NONDELEGABLE_WRIT_OPERATIONS.has(operation)) return { ok: false, reason: "notDelegated" };
  const status = writStatus(writ, { demonUuid, bond, delegateFeetFromDemon, now });
  if (status !== "active") return { ok: false, reason: status, status };
  return { ok: true, reason: null, status, permission: "command" };
}

/** Only the Warlock who created the writ may revoke it. */
export function revokeSummonersWrit(writ, { actorUuid = null, now = null } = {}) {
  if (!writ || actorUuid !== writ.casterUuid) return { ok: false, reason: "notCaster" };
  if (!validTime(now)) return { ok: false, reason: "time" };
  if (!current(writ, now)) return { ok: false, reason: writ.revokedAt != null ? "revoked" : now < (writ.createdAt ?? 0) ? "notStarted" : "expired" };
  return { ok: true, reason: null, writ: { ...writ, revokedAt: now } };
}

/** Place a one-minute payer substitution on one currently bound demon. */
export function createFelSurety({
  casterUuid = null,
  casterClass = null,
  demonUuid = null,
  bond = null,
  demonFeetFromCaster = null,
  now = null
} = {}) {
  if (casterClass !== "Warlock") return { ok: false, reason: "class" };
  if (!identity(casterUuid) || !identity(demonUuid)) return { ok: false, reason: "identity" };
  if (!validTime(now)) return { ok: false, reason: "time" };
  if (!ownedBoundDemon(bond, casterUuid)) return { ok: false, reason: "bond" };
  if (!Number.isFinite(demonFeetFromCaster) || demonFeetFromCaster < 0 || demonFeetFromCaster > SURETY_RANGE_FEET) {
    return { ok: false, reason: "range" };
  }
  return {
    ok: true,
    reason: null,
    surety: { casterUuid, demonUuid, createdAt: now, expiresAt: now + SURETY_DURATION_SECONDS, consumedAt: null }
  };
}

/**
 * A surety can cover only a listed native ability's explicit Power cost.
 * Callers pass a row from this demon's `creatureAbilities` list, not an item
 * spell or a delegated/borrowed ability.
 */
export function suretyPowerCost(ability) {
  const automation = ability?.automation ?? ability ?? {};
  const amount = automation.cost?.amount;
  if (automation.kind === "spell" || automation.casting === true || String(automation.spell ?? "").trim()) return null;
  if (automation.cost?.pool !== "power" || !Number.isInteger(amount) || amount < 1 || amount > SURETY_MAX_POWER) return null;
  return amount;
}

/**
 * Resolve the next eligible native ability without mutating it or its action
 * economy. The result names exactly one payer and the surety's consumption.
 */
export function resolveFelSurety(surety, {
  casterUuid = null,
  demonUuid = null,
  bond = null,
  demonFeetFromCaster = null,
  ability = null,
  casterMana = null,
  demonPower = null,
  payerChoice = "warlock",
  now = null
} = {}) {
  if (!surety || surety.consumedAt != null) return { ok: false, reason: "consumed" };
  if (casterUuid !== surety.casterUuid) return { ok: false, reason: "notCaster" };
  if (demonUuid !== surety.demonUuid || !ownedBoundDemon(bond, surety.casterUuid)) return { ok: false, reason: "unbound" };
  if (!validTime(now)) return { ok: false, reason: "time" };
  if (!validTime(surety.createdAt) || !validTime(surety.expiresAt) || surety.expiresAt <= surety.createdAt) return { ok: false, reason: "invalid" };
  if (now < surety.createdAt) return { ok: false, reason: "notStarted" };
  if (now >= surety.expiresAt) return { ok: false, reason: "expired" };
  if (!Number.isFinite(demonFeetFromCaster) || demonFeetFromCaster < 0 || demonFeetFromCaster > SURETY_RANGE_FEET) {
    return { ok: false, reason: "range" };
  }
  const cost = suretyPowerCost(ability);
  if (cost === null) return { ok: false, reason: "ability" };
  if (payerChoice !== "warlock" && payerChoice !== "demon") return { ok: false, reason: "payer" };

  const mana = Number.isInteger(casterMana) && casterMana >= 0 ? casterMana : 0;
  const power = Number.isInteger(demonPower) && demonPower >= 0 ? demonPower : 0;
  const payer = payerChoice === "warlock" && mana >= cost ? "warlock" : "demon";
  if ((payer === "warlock" && mana < cost) || (payer === "demon" && power < cost)) {
    return { ok: false, reason: "resources", cost, payer: null, suretySpent: false };
  }
  return {
    ok: true,
    reason: null,
    cost,
    payer,
    manaSpent: payer === "warlock" ? cost : 0,
    powerSpent: payer === "demon" ? cost : 0,
    suretySpent: true,
    surety: { ...surety, consumedAt: now }
  };
}
