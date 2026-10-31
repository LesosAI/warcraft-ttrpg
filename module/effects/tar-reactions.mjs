/** GM-owned tar reactions offered by a newly resolved attack card. */
import { tarHit, tarOptions, claimTarReaction, tarOutcome, TAR_CLAIMS } from "../rules/tar-reactions.mjs";
import { realmRefusalFor } from "./spirit-realm.mjs";
import { strikeFromArea } from "./area-strikes.mjs";
import { inflictCondition } from "./inflict.mjs";

const SCOPE = "azeroth-rpg";
const busy = new Set();
const seen = new WeakSet();
let offerQueue = Promise.resolve();
const text = (key, args = {}) => game.i18n.format(`AZEROTH.Tar.${key}`, args);
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const writer = () => game.user?.isGM && game.users?.activeGM?.id === game.user.id;
const clock = () => game.combat?.started
  ? `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}` : `world:${game.time?.worldTime}`;

/** Capture actual documents before opening any dialog. This API is GM-only;
 * it accepts a message document, never a player-provided attack snapshot. */
export async function offerTarReaction(message, index, observed = null) {
  if (!writer() || game.messages?.get(message?.id) !== message) return { ok: false, reason: "authority" };
  const readHit = () => tarHit({ messageId: message.id, index, flags: message.flags?.[SCOPE], success: message.rolls?.[0]?.outcome?.success });
  const hit = readHit();
  if (!hit) return { ok: false, reason: "hit" };
  const scene = game.scenes.get(hit.attacker.sceneId);
  const source = scene?.tokens.get(hit.attacker.tokenId), token = scene?.tokens.get(hit.defender.tokenId);
  const attacker = source?.actor, holder = token?.actor;
  if (!holder || !attacker || holder === attacker || !message.author
    || !attacker.testUserPermission(message.author, "OWNER")) return { ok: false, reason: "source" };
  const weapon = hit.weaponId ? attacker.items?.get(hit.weaponId) : null;
  if (observed && (observed.clock !== clock() || observed.source !== source || observed.token !== token
    || observed.weapon !== weapon)) return { ok: false, reason: "expired" };
  const heldWeapon = () => weapon?.type === "weapon" && weapon.parent === attacker
    && attacker.items.get(hit.weaponId) === weapon && weapon.system?.equipped === true;
  const options = () => tarOptions(holder.system?.creatureAbilities, { weaponId: heldWeapon() ? hit.weaponId : null });
  if (!options().length) return { ok: false, reason: "noUses" };
  if (busy.has(holder.uuid) || busy.has(message.id)) return { ok: false, reason: "pending" };
  busy.add(holder.uuid); busy.add(message.id);
  const moment = clock(), fight = game.combat?.started ? game.combat : null;
  const positions = [source.x, source.y, token.x, token.y];
  let paid = false;
  try {
    const validate = (selected = null) => {
      if (!writer() || game.messages.get(message.id) !== message || JSON.stringify(readHit()) !== JSON.stringify(hit)) return "hit";
      if (clock() !== moment || (!fight && !Number.isFinite(game.time?.worldTime))) return "expired";
      if (game.scenes.get(scene.id) !== scene || scene.tokens.get(source.id) !== source || scene.tokens.get(token.id) !== token
        || source.actor !== attacker || token.actor !== holder) return "identity";
      if ([source.x, source.y, token.x, token.y].some((v, i) => v !== positions[i])) return "moved";
      if (!attacker.testUserPermission(message.author, "OWNER")) return "ownership";
      if (fight && (!fight.getCombatantsByActor(holder)?.length || !fight.getCombatantsByActor(attacker)?.length)) return "encounter";
      if ((holder.system.health?.value ?? 0) <= 0 || (attacker.system.health?.value ?? 0) <= 0
        || holder.statuses?.has("stunned") || realmRefusalFor(holder, "reaction") || realmRefusalFor(attacker, "ability")) return "unavailable";
      if (selected) {
        const current = holder.system.creatureAbilities?.[selected.index];
        const expected = paid ? { ...current, automation: { ...current?.automation, uses: { ...current?.automation?.uses, value: 1 } } } : current;
        const actual = tarOptions([expected], { weaponId: heldWeapon() ? hit.weaponId : null }).find(o => o.key === selected.key);
        if (!actual || actual.dc !== selected.dc) return "ability";
        if (selected.key === "sticky" && !heldWeapon()) return "weapon";
      }
      return null;
    };
    let reason = validate();
    if (reason) return { ok: false, reason };
    const prior = message.flags?.[SCOPE]?.[TAR_CLAIMS] ?? [];
    if (!claimTarReaction(prior, { index, holderUuid: holder.uuid, key: "burning" })) return { ok: false, reason: "claimed" };
    const { chooseOption, spendTurnBudget, rollResilience } = await import("../dice/workflows.mjs");
    const available = options();
    const choice = await chooseOption({ id: `${message.id}-tar-${index}`, name: holder.name }, [
      { key: "cancel", name: text("Cancel"), description: text("NoCost") },
      ...available.map(o => ({ key: o.key, name: o.name, description: text(o.key === "sticky" ? "StickyCost" : "BurningCost", { dc: o.dc }) }))
    ], null, { prompt: text("Prompt", { name: attacker.name }) });
    const selected = available.find(o => o.key === choice?.key);
    if (!selected) return { ok: false, reason: "cancelled" };
    reason = validate(selected);
    if (reason) return { ok: false, reason };
    const claims = claimTarReaction(message.flags?.[SCOPE]?.[TAR_CLAIMS] ?? [], { index, holderUuid: holder.uuid, key: selected.key });
    if (!claims) return { ok: false, reason: "claimed" };
    await message.setFlag(SCOPE, TAR_CLAIMS, claims);
    // A rejected Reaction spends no per-rest use. Release only our own claim
    // while this message and holder are locked; no other tar writer can race it.
    if (!(await spendTurnBudget(holder, "reaction"))) {
      await message.setFlag(SCOPE, TAR_CLAIMS, prior);
      return { ok: false, reason: "reaction" };
    }
    paid = true;
    const abilities = foundry.utils.deepClone(holder.system.creatureAbilities);
    abilities[selected.index].automation.uses.value = 0;
    await holder.update({ "system.creatureAbilities": abilities });
    reason = validate(selected);
    if (reason) return { ok: false, reason, paid };
    const resistance = await rollResilience({ actor: attacker, resilience: selected.resilience, dc: selected.dc, subtitle: selected.name });
    const outcome = tarOutcome(selected.key, resistance?.rolls?.[0]?.outcome?.success);
    if (!outcome) return { ok: false, reason: "testUnresolved", paid };
    reason = validate(selected);
    if (reason) return { ok: false, reason, paid };
    let result = { ok: true, resisted: outcome.resisted, paid };
    let words = text("Resisted", { name: attacker.name, ability: selected.name });
    if (!outcome.resisted && outcome.dropWeapon) {
      // Foundry keeps the owned item for normal recovery; it is removed from
      // the hand, and the result explicitly places it at the attacker's feet.
      await weapon.update({ "system.equipped": false });
      words = text("Dropped", { name: attacker.name, weapon: weapon.name });
    } else if (!outcome.resisted) {
      const lines = await strikeFromArea({ actor: attacker, caster: holder,
        spell: { name: selected.name, feature: true, isSpell: false, takesSpellpower: false }, damage: outcome.damage });
      reason = validate(selected);
      // Initial damage can put the attacker down. Do not add a fresh condition
      // to a dead NPC or apply anything after identity/clock changes.
      const immune = (attacker.system.immune ?? []).includes("fire");
      const landing = !reason && !immune ? await inflictCondition({ victim: attacker, id: "scorched", value: 2, by: holder }) : null;
      result = { ...result, immune, scorched: landing?.landed === true };
      words = [...lines, text(landing?.landed ? "Burned" : "NoScorched", { name: attacker.name })].join(" ");
    }
    const useSource = { sceneId: scene.id, tokenId: token.id };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: holder }), content: `<p>${escape(words)}</p>`,
      flags: { [SCOPE]: { kind: "ability",
        source: useSource ?? null,
        featureKey: selected.key === "sticky" ? "ability:sticky-tar" : "ability:burning-tar",
        casting: false, success: !outcome.resisted && !result.immune,
        targets: [{ sceneId: scene.id, tokenId: source.id, actorUuid: attacker.uuid, name: attacker.name }] } } });
    return result;
  } catch (error) {
    console.warn("azeroth-rpg | tar reaction", error);
    if (!paid) ui.notifications?.warn(text("WriteFailure"));
    return { ok: false, reason: "writeFailed", paid };
  } finally { busy.delete(holder.uuid); busy.delete(message.id); }
}

/** Only new attack cards trigger the GM prompt. Rendering, reconnecting,
 * updating a card or loading old chat history never replays a reaction. */
export function registerTarReactionHooks() {
  Hooks.on("createChatMessage", message => {
    if (!writer() || seen.has(message) || message.flags?.[SCOPE]?.kind !== "attack") return;
    seen.add(message);
    // Snapshot identities now, before a previous GM prompt finishes. Otherwise
    // a queued card could bind to a replacement weapon/token or a later turn.
    const observed = (message.flags?.[SCOPE]?.targets ?? []).map((_, index) => {
      const hit = tarHit({ messageId: message.id, index, flags: message.flags[SCOPE], success: message.rolls?.[0]?.outcome?.success });
      const scene = game.scenes.get(hit?.attacker.sceneId), source = scene?.tokens.get(hit?.attacker.tokenId);
      return { clock: clock(), source, token: scene?.tokens.get(hit?.defender.tokenId),
        weapon: hit?.weaponId ? source?.actor?.items?.get(hit.weaponId) : null };
    });
    offerQueue = offerQueue.then(async () => {
      for (let index = 0; index < observed.length; index++) {
        const result = await offerTarReaction(message, index, observed[index]);
        if (result.paid && !result.ok) ui.notifications?.warn(text("PaidFailure"));
      }
    }).catch(error => {
      console.warn("azeroth-rpg | tar offer", error);
      ui.notifications?.warn(text("WriteFailure"));
    });
  });
}
