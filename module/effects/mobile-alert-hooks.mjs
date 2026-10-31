import { MOBILE_ALERT, MOBILE_ALERT_FLAG, mobileAlertStep } from "../rules/mobile-alert.mjs";
import { mobileAlertBusy, releaseMobileAlert } from "./mobile-alert-lock.mjs";
import { mobileAlertQueryHandler } from "./mobile-alert-use.mjs";
import { mobileAlertPreMove } from "./mobile-alert-restrictions.mjs";
import { cleanMobileFlares } from "./mobile-alert-flare.mjs";

const values = collection => [...(collection?.values?.() ?? collection ?? [])];
const gmHere = () => globalThis.game?.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const flag = token => token.getFlag("azeroth-rpg", MOBILE_ALERT_FLAG) ?? null;
const key = (token, record) => `${token.uuid}:${record.cast}`;
const allTokens = () => values(game.scenes).flatMap(scene => values(scene.tokens));

function stepFor(token, record) {
  const actor = token.actor;
  const combat = values(game.combats).find(combat => combat.started
    && values(combat.combatants).some(row => row.actor?.uuid === actor?.uuid));
  return mobileAlertStep({ record, tokenUuid: token.uuid, actorUuid: actor?.uuid,
    point: { x: token.x, y: token.y, elevation: token.elevation, level: token._source?.level },
    time: game.time.worldTime, alive: actor?.system?.health?.value > 0,
    disabled: actor?.statuses?.has("stunned") || !actor?.system?.creatureAbilities?.some(row => row.name === MOBILE_ALERT.name),
    combat: combat ? { id: combat.id, round: combat.round, actorUuid: combat.combatant?.actor?.uuid } : null });
}

/** Each live client remembers which cast was offered. Only the active GM
 * resolves it. Loading pending alarms never silently replays their summons. */
export function registerMobileAlertHooks() {
  Hooks.on("preMoveToken", mobileAlertPreMove);
  const cleanFlares = () => cleanMobileFlares().catch(error => console.warn("azeroth-rpg | Alarm Flare cleanup", error));
  Hooks.on("ready", cleanFlares);
  Hooks.on("updateWorldTime", cleanFlares);
  Hooks.on("updateToken", cleanFlares);
  Hooks.on("deleteToken", cleanFlares);
  const offered = new Set();
  let ready = false;
  const inspect = async (token, allowResolve = false) => {
    if (!ready || !token?.uuid) return;
    const record = flag(token);
    if (record?.phase !== "arming" || record.version !== 1) return;
    const step = stepFor(token, record);
    if (!step.ok) return;
    if (step.action === "cancel") {
      if (!gmHere() || mobileAlertBusy.has(token.uuid)) return;
      mobileAlertBusy.add(token.uuid);
      try {
        if (game.scenes?.get(token.parent.id)?.tokens.get(token.id) !== token
          || flag(token) !== record || stepFor(token, record).action !== "cancel") return;
        await token.setFlag("azeroth-rpg", MOBILE_ALERT_FLAG, { ...record, phase: "cancelled", reason: step.reason });
        if (gmHere()) ui.notifications?.info("The Mobile Alert System's delayed summon was interrupted. Its earlier warning still stands.");
      } finally { releaseMobileAlert(token); }
      return;
    }
    if (!allowResolve || step.action !== "summon" || offered.has(key(token, record))) return;
    // All clients record the observed deadline, including clients that are not
    // currently GM, so a later handoff cannot replay an already offered cast.
    offered.add(key(token, record));
    if (!gmHere() || mobileAlertBusy.has(token.uuid)) return;
    const index = token.actor.system.creatureAbilities.findIndex(row => row.name === MOBILE_ALERT.name);
    const result = await mobileAlertQueryHandler({ actorUuid: token.actor.uuid, index,
      source: { sceneId: token.parent.id, tokenId: token.id }, operation: "resolve" }, { user: game.user });
    if (!result?.ok && gmHere()) ui.notifications?.warn("The due alarm was not completed. Use Raise Alarm to review or resolve its saved state; no automatic retry will occur.");
  };
  const safe = (token, allowResolve = false) => inspect(token, allowResolve).catch(error => {
    console.warn("azeroth-rpg | Mobile Alert lifecycle", error);
    if (gmHere()) ui.notifications?.warn("An alarm update could not be confirmed. Review its saved state before retrying.");
  });
  const scan = async allowResolve => {
    for (const token of allTokens()) await safe(token, allowResolve);
  };
  Hooks.on("ready", () => {
    ready = true;
    for (const token of allTokens()) {
      const record = flag(token);
      if (record?.phase === "arming") offered.add(key(token, record));
    }
    if (gmHere() && offered.size) ui.notifications?.warn("Pending Mobile Alert alarms were loaded. Review or resolve them from Raise Alarm; they will not summon automatically after loading.");
  });
  Hooks.on("updateWorldTime", () => scan(true));
  Hooks.on("updateCombat", () => scan(true));
  Hooks.on("deleteCombat", () => scan(false));
  Hooks.on("updateToken", token => safe(token));
  Hooks.on("updateActor", actor => Promise.all(allTokens().filter(token => token.actor === actor).map(token => safe(token))));
  Hooks.on("createActiveEffect", effect => effect.parent?.documentName === "Actor"
    ? Promise.all(allTokens().filter(token => token.actor === effect.parent).map(token => safe(token))) : undefined);
  Hooks.on("updateActiveEffect", effect => effect.parent?.documentName === "Actor"
    ? Promise.all(allTokens().filter(token => token.actor === effect.parent).map(token => safe(token))) : undefined);
  Hooks.on("azerothMobileAlertIdle", token => safe(token));
}
