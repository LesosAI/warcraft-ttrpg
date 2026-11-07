/**
 * **EVERY BOSS ACTION OF EVERY BOSS, PRESSED** (14 §1, D-809; the lead: *"build the boss
 * actions so they work for all bosses"*).
 *
 * `azeroth-rpg.boss-economy` holds the points: spent once through the one writer, a ×2
 * paid with two, a short Boss refused in words, one Boss Action after each turn, two
 * presses at once, a repeated press id, a player-owned Boss through the GM's query, a
 * Hexed Boss refused, a summon placed once, and the refresh at a fight's end.
 *
 * `azeroth-rpg.boss-actions-1` to `-4` take every Boss in the pack, a quarter each, as a
 * `ZZ` copy in a started fight beside a ZZ Mage and a ZZ Felhunter (and a ZZ Kobold on the
 * Boss's side), and press each of its Boss Actions through the NPC sheet's own Use control,
 * then the card's own rows, the die pinned. Each asserts the point spent, the card posted
 * and the stated effect landed - read off the row's own descriptor and plan, so the batch
 * holds all 109 to what the pack says they do - or the refusal in words.
 *
 * **Every document is found by its actor and its place, never by its order in an answer**
 * (the Hex agent's finding: 14.367 answers a create in the order ids resolve).
 */

import { cleanup, drainAreaWork, made, makeCharacter, pinDie, settle, tokenData, tokenDrawn, untilHook } from "./fixtures.mjs";
import { CARD_ACTIONS } from "../dice/chat.mjs";
import { ROLL_DIALOG_SETTING } from "../settings.mjs";
import { cleanAutomation } from "../rules/ability-automation.mjs";
import { cleanBossPlan } from "../rules/boss-actions.mjs";
import { BOSS_PRESS_FLAG, bossPointsQueryHandler, refreshBossPoints } from "../effects/boss-points.mjs";
import { AWAY_FLAG, BOSS_COPY_FLAG, BOSS_GRIP_FLAG, CANNOT_ATTACK_FLAG, MISS_NEXT_FLAG, REMINDER_FLAG, SIDE_SWITCH_FLAG } from "../effects/boss-doors.mjs";
import { EXPOSED_FLAG } from "../rules/class-talents.mjs";
import { LAID_BANE_FLAG, LAID_BOON_FLAG } from "../rules/banes.mjs";
import { ESCAPE_FLAG } from "../rules/escapes.mjs";
import { layForcedShape } from "../documents/shapes.mjs";

const SCOPE = "azeroth-rpg";
const until = async (fn, what, ms = 10000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 30));
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** What a call SAYS, both channels, and the notifier put back. */
async function saidDuring(fn) {
  const said = [];
  const originals = { warn: ui.notifications.warn, info: ui.notifications.info };
  for (const key of ["warn", "info"]) {
    ui.notifications[key] = function (message, ...rest) { said.push(String(message)); return originals[key].call(this, message, ...rest); };
  }
  try { return { result: await fn(), said }; } finally { Object.assign(ui.notifications, originals); }
}

/** Press the 2D board at a canvas point, as a browser does. */
function pressBoard(point) {
  const client = canvas.clientCoordinatesFromCanvas(point);
  canvas.app.view.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: client.x, clientY: client.y, button: 0, buttons: 1,
    pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true
  }));
}

/** Answer a pick the press opened, at a point. */
async function answerPick(point) {
  await until(() => game.system.azeroth.canvas.pickState()?.active === true || game.system.azeroth.canvas.pickState(), "a pick to wait", 10000);
  await settle();
  pressBoard(point);
}

/** Pick an option by name in the chooser `workflows.chooseOption` opened under this id. */
async function choose(id, name = null) {
  const app = await until(() => {
    const found = foundry.applications.instances.get(`azeroth-choose-${id}`);
    return found?.rendered && found.element?.querySelector(".azeroth-choose") ? found : null;
  }, `the chooser ${id}`, 10000);
  const select = app.element.querySelector("#azeroth-choose-select");
  if (select && name) {
    const option = [...select.options].find(o => o.textContent.trim().startsWith(name));
    if (option) select.value = option.value;
  }
  app.element.querySelector('button[data-action="choose"]').click();
  await until(() => !app.rendered, `the chooser ${id} to close`);
}

/** The card's own button, off its stored content (`quench-phase20.mjs`'s shape). */
function buttonsOf(card, selector) {
  const html = document.createElement("div");
  html.innerHTML = card.content;
  return [...html.querySelectorAll(selector)];
}

/** A card the Boss posts, by its row's name. */
const cardFrom = (boss, name) => untilHook("createChatMessage", 30000, m => m.speaker?.actor === boss.id
  && m.flags?.[SCOPE]?.kind === "ability" && m.flags[SCOPE].title === name).then(([m]) => m);

/** The skip setting and a pinned die around a press. */
async function pinned(face, fn) {
  const before = game.settings.get(SCOPE, ROLL_DIALOG_SETTING);
  await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, "skip");
  const unpin = pinDie(face);
  try { return await fn(); } finally {
    unpin();
    await game.settings.set(SCOPE, ROLL_DIALOG_SETTING, before);
  }
}

/** The bosses of the pack, sorted by name, from the index (no full read). */
async function bossNames() {
  const pack = game.packs.get(`${SCOPE}.bestiary`);
  const docs = await pack.getDocuments();
  return docs.filter(d => (d.system?.bossActions ?? []).length).map(d => d.name).sort();
}

/** A pack creature as a ZZ world actor, linked. */
async function worldCopy(name, extra = {}) {
  const pack = game.packs.get(`${SCOPE}.bestiary`);
  const entry = (await pack.getIndex()).find(e => e.name === name);
  const doc = await pack.getDocument(entry._id);
  const data = doc.toObject();
  const actor = await Actor.create({ ...data, name: `ZZ ${name}`, prototypeToken: { ...data.prototypeToken, actorLink: true }, ...extra });
  made.push(actor);
  return actor;
}

/** Tokens placed for these actors, each found by its actor and its place. */
async function place(scene, placements) {
  const data = [];
  for (const { actor, x, y, side } of placements) {
    data.push(await tokenData(actor, { x, y, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS[side] }));
  }
  const created = await scene.createEmbeddedDocuments("Token", data);
  const pool = [...created];
  const tokens = placements.map(({ actor, x, y }) => {
    const mine = pool.filter(t => t.actorId === actor.id).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    pool.splice(pool.indexOf(mine), 1);
    return mine;
  });
  await until(() => tokens.every(t => tokenDrawn(t.object)), "every token drawn", 20000);
  await settle();
  return tokens;
}

/** Every world actor made while `fn` ran that the batch did not make itself: the Summoned folder's. */
function worldActorsNow() {
  return new Set(game.actors.map(a => a.id));
}

/**
 * The batch for a quarter of the Bosses.
 *
 * @param {number} part   1 to 4
 */
function bossActionsBatch(part) {
  return function (context) {
    const { describe, it, assert, before, after } = context;
    describe(`14 §1's Boss Actions, pressed for every Boss (D-809), part ${part} of 4`, function () {
      let scene = null;
      let mage = null;
      let hunter = null;
      let ally = null;
      let baseActors = null;
      let bosses = [];
      // **WHO DELETES AN EFFECT TWICE** (a server refusal, *ActiveEffect "..." does not exist!*,
      // seen once in 109 presses): every delete request, by id, with the stack that asked.
      const deletes = new Map();
      const doubles = [];
      let restoreDeletes = null;
      before(async function () {
        this.timeout(120000);
        const cls = CONFIG.ActiveEffect.documentClass;
        const original = cls.deleteDocuments;
        cls.deleteDocuments = function (ids = [], operation = {}) {
          const stack = new Error().stack?.split("\n").slice(2, 7).join(" <- ") ?? "";
          for (const id of ids ?? []) {
            const prior = deletes.get(id);
            if (prior && Date.now() - prior.at < 5000) doubles.push(`${id}: ${prior.stack} || ${stack}`);
            deletes.set(id, { at: Date.now(), stack });
          }
          return original.call(this, ids, operation);
        };
        restoreDeletes = () => { cls.deleteDocuments = original; };
        baseActors = worldActorsNow();
        const all = await bossNames();
        const per = Math.ceil(all.length / 4);
        bosses = all.slice((part - 1) * per, part * per);
        scene = await Scene.create({ name: `ZZ Boss Actions ${part}`, width: 4000, height: 3000, grid: { size: 100, distance: 5, units: "ft" } });
        made.push(scene);
        await scene.view();
        await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene viewed", 20000);
        mage = await makeCharacter({ name: "ZZ Boss Target Mage", classes: [["Mage", 3]] });
        await mage.update({ "prototypeToken.actorLink": true });
        hunter = await worldCopy("Felhunter");
        ally = await worldCopy("Kobold");
      });
      after(async function () {
        this.timeout(180000);
        restoreDeletes?.();
        await game.combats.filter(c => c.name?.startsWith?.("ZZ") || c.scene?.id === scene?.id).reduce((p, c) => p.then(() => c.delete().catch(() => {})), Promise.resolve());
        // The Summoned folder's actors this batch called up, and the copies.
        const extra = game.actors.filter(a => !baseActors.has(a.id) && !made.includes(a));
        for (const a of extra) await a.delete().catch(() => {});
        await cleanup();
      });

      it(`presses every Boss Action of its Bosses, and each spends its points, posts its card and lands what its words say`, async function () {
        this.timeout(1500000);
        const problems = [];
        for (const name of bosses) {
          const t0 = performance.now();
          try {
            await pressEveryAction(name, problems);
          } catch (err) {
            problems.push(`${name}: ${err.message}`);
          }
          console.log(`azeroth-rpg | boss-actions-${part}: ${name} in ${Math.round(performance.now() - t0)} ms, heap ${Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576)} MB`);
        }
        problems.push(...doubles.map(d => `an effect deleted twice: ${d}`));
        assert.deepEqual(problems, [], problems.join("\n"));
      });

      async function pressEveryAction(name, problems) {
        const boss = await worldCopy(name);
        const big = Math.max(1, boss.prototypeToken.width ?? 1);
        const at = { x: 1500, y: 1200 };
        const [bossTok, mageTok, hunterTok, allyTok] = await place(scene, [
          { actor: boss, x: at.x, y: at.y, side: "HOSTILE" },
          { actor: mage, x: at.x - 100, y: at.y, side: "FRIENDLY" },
          { actor: hunter, x: at.x + big * 100, y: at.y, side: "FRIENDLY" },
          { actor: ally, x: at.x, y: at.y - 100, side: "HOSTILE" }
        ]);
        const base = new Set([bossTok.id, mageTok.id, hunterTok.id, allyTok.id]);
        const home = new Map([bossTok, mageTok, hunterTok, allyTok].map(t => [t.id, { x: t.x, y: t.y }]));
        const combat = await Combat.create({ scene: scene.id, name: `ZZ Boss Fight ${name}` });
        await combat.createEmbeddedDocuments("Combatant", [bossTok, mageTok, hunterTok, allyTok].map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
        await combat.activate();
        await combat.startCombat();
        await until(() => combat.started && combat.round >= 1, "the fight started");
        const sheet = await boss.sheet.render({ force: true });
        await until(() => boss.sheet.rendered && boss.sheet.element?.querySelector('[data-action="useAbility"][data-list="bossActions"]'), `${name}'s sheet`, 15000);
        try {
          const rows = boss.system.bossActions;
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            try {
              await pressOne({ boss, index, row, combat, bossTok, mageTok, hunterTok, allyTok, base, home });
            } catch (err) {
              problems.push(`${name} / ${row.name}: ${err.message}`);
            }
          }
        } finally {
          await drainAreaWork().catch(() => null);
          await sleep(300);
          await boss.sheet.close().catch(() => {});
          // The timed effects go BEFORE the fight: core reframes a fight's spans when the
          // fight ends (14.367 \`ActiveEffectRegistry#refresh\`), and a reframe that reaches an
          // effect deleted beside it is a write the server refuses.
          for (const a of [boss, mage, hunter, ally]) {
            const ids = a.effects.map(e => e.id);
            if (ids.length) await a.deleteEmbeddedDocuments("ActiveEffect", ids).catch(() => {});
          }
          await sleep(300);
          await combat.delete().catch(() => {});
          await sleep(500);
          await drainAreaWork().catch(() => null);
          const strays = scene.tokens.map(t => t.id);
          if (strays.length) await scene.deleteEmbeddedDocuments("Token", strays).catch(() => {});
          const regions = scene.regions.map(r => r.id);
          if (regions.length) await scene.deleteEmbeddedDocuments("Region", regions).catch(() => {});
          const cards = game.messages.filter(m => m.speaker?.scene === scene.id || m.flags?.[SCOPE]?.bossDoor || [boss.id, mage.id, hunter.id, ally.id].includes(m.speaker?.actor)).map(m => m.id);
          if (cards.length) await ChatMessage.deleteDocuments(cards).catch(() => {});
          for (const a of [mage, hunter, ally]) {
            const ids = a.effects.map(e => e.id);
            if (ids.length) await a.deleteEmbeddedDocuments("ActiveEffect", ids).catch(() => {});
          }
        }
      }

      /** Put the field back between two presses. */
      async function reset({ boss, combat, bossTok, base, home }) {
        await drainAreaWork().catch(() => null);
        await sleep(250);
        for (const a of [boss, mage, hunter, ally]) {
          const ids = a.effects.map(e => e.id);
          if (ids.length) await a.deleteEmbeddedDocuments("ActiveEffect", ids);
          const h = a.system.health;
          if (h && h.value !== h.max) await a.update({ "system.health.value": h.max });
        }
        const extra = scene.tokens.filter(t => !base.has(t.id)).map(t => t.id);
        if (extra.length) await scene.deleteEmbeddedDocuments("Token", extra);
        const regions = scene.regions.map(r => r.id);
        if (regions.length) await scene.deleteEmbeddedDocuments("Region", regions);
        for (const [id, pos] of home) {
          const t = scene.tokens.get(id);
          if (t && (t.x !== pos.x || t.y !== pos.y)) await t.update({ x: pos.x, y: pos.y }, { animate: false });
        }
        for (const c of combat.combatants) if (c.getFlag(SCOPE, "side") !== undefined) await c.unsetFlag(SCOPE, "side");
        const extraC = combat.combatants.filter(c => !base.has(c.tokenId)).map(c => c.id);
        if (extraC.length) await combat.deleteEmbeddedDocuments("Combatant", extraC);
        await refreshBossPoints(boss);
        await until(() => boss.system.bossPoints.value === boss.system.bossPoints.max && boss.getFlag(SCOPE, BOSS_PRESS_FLAG) === undefined, "the points full");
        // Full pools on the targets, so a loss shows (Reave the Ley's Mana, Feed's Power).
        for (const a of [mage, hunter]) {
          const fill = (a.poolSnapshot?.() ?? []).filter(p => p.value < p.max).map(p => ({ itemId: p.itemId ?? null, kind: p.kind, value: p.max }));
          if (fill.length) await a.updatePool(fill);
        }
        canvas.tokens.setTargets([]);
        await settle();
        void bossTok;
      }

      async function pressOne(ctx) {
        const heard = [];
        const originals = { warn: ui.notifications.warn, info: ui.notifications.info };
        for (const key of ["warn", "info"]) {
          ui.notifications[key] = function (message, ...rest) { heard.push(String(message)); return originals[key].call(this, message, ...rest); };
        }
        const doorText = () => game.messages.filter(m => m.flags?.[SCOPE]?.bossDoor).map(m => m.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join(" | ");
        try {
          await pressOneInner(ctx);
        } catch (err) {
          throw new Error(`${err.message} [said: ${heard.join(" | ") || "nothing"}] [doors: ${doorText() || "nothing"}]`);
        } finally {
          Object.assign(ui.notifications, originals);
        }
      }

      async function pressOneInner(ctx) {
        const { boss, index, row, combat, bossTok, mageTok, hunterTok, allyTok } = ctx;
        await reset(ctx);
        const a = cleanAutomation(row.automation);
        const plan = cleanBossPlan(a.plan);
        const cost = row.cost ?? 1;
        const max = boss.system.bossPoints.max;
        // Who is targeted: a circle gathers on its own; a one-creature door takes one; Bind a Demon.
        let targeted = [];
        if (plan.gather) targeted = [];
        else if (["relocateTarget", "away"].includes(plan.door)) targeted = [mageTok];
        else if (["enfeeble", "marked"].includes(plan.door)) targeted = [hunterTok];
        else if (plan.sideSwitch?.kinds?.length) targeted = [hunterTok];
        else if (["relocateSelf", "copies", "amaniFury", "classCall", "allyAttack", "disengage", "raise", "selfLine", "gyth"].includes(plan.door)) targeted = [];
        else targeted = [mageTok, hunterTok];
        canvas.tokens.setTargets(targeted.map(t => t.id));
        await settle();
        // The corpses a raise needs: two fallen humanoids beside the Boss.
        let corpses = [];
        if (plan.door === "raise") {
          const fallen = await worldCopy("Defias Footpad");
          const [c1, c2] = await place(scene, [
            { actor: fallen, x: bossTok.x - 200, y: bossTok.y + 200, side: "HOSTILE" },
            { actor: fallen, x: bossTok.x + 300, y: bossTok.y + 300, side: "HOSTILE" }
          ]);
          await fallen.update({ "system.health.value": 0 });
          corpses = [c1, c2];
        }
        if (plan.selfHeal || plan.drain) await boss.update({ "system.health.value": Math.max(1, boss.system.health.max - 30) });
        if (plan.poolGain) await boss.updatePool({ kind: plan.poolGain.pool, value: 0 });
        const hp = new Map([boss, mage, hunter, ally].map(x => [x.id, x.system.health.value]));
        const pos = new Map([bossTok, mageTok, hunterTok, allyTok].map(t => [t.id, { x: t.x, y: t.y }]));
        const pools = new Map([mage, hunter, boss].map(x => [x.id, (x.poolSnapshot?.() ?? []).map(p => p.value)]));

        // 1. The press, through the sheet's own control, the dialogs skipped and the die high.
        const card = await pinned(20, async () => {
          const posted = cardFrom(boss, row.name);
          const button = boss.sheet.element.querySelector(`[data-action="useAbility"][data-list="bossActions"][data-index="${index}"]`);
          if (!button) throw new Error("the sheet draws no Use for it");
          button.click();
          if (["relocateSelf", "gyth"].includes(plan.door)) await answerPick({ x: bossTok.object.center.x, y: bossTok.object.center.y + 300 });
          if (["relocateTarget", "away"].includes(plan.door)) await answerPick({ x: bossTok.object.center.x - 600, y: bossTok.object.center.y + 600 });
          if (plan.door === "selfLine") await answerPick({ x: bossTok.object.center.x, y: bossTok.object.center.y + 400 });
          if (plan.door === "classCall") await choose(`boss-${boss.id}-class`, "Mage");
          if (plan.door === "raise" && !plan.all && corpses.length > 1) await choose(`boss-${boss.id}-corpse`);
          const posted_ = await posted;
          // An ally commanded attacks inside the press (Unholy Command): its card, too.
          if (plan.door === "allyAttack") await until(() => game.messages.some(m => m.speaker?.actor === ally.id), "the ally's attack", 20000);
          return posted_;
        });
        await until(() => boss.system.bossPoints.value === max - cost, `${cost} point(s) spent`);
        if (card.flags[SCOPE].bossAction !== true) throw new Error("the card is not marked a Boss Action");

        // 2. What the card's rows land.
        const flags = card.flags[SCOPE];
        const cardTargets = flags.targets ?? [];
        const actorOfRow = t => t?.tokenId ? scene.tokens.get(t.tokenId)?.actor : null;
        if (a.resist && cardTargets.length) {
          for (const b of buttonsOf(card, '[data-action="resistTest"][data-target-index]')) {
            await pinned(1, () => CARD_ACTIONS.resistTest(b, game.messages.get(card.id)));
          }
          await sleep(400);
          for (const t of cardTargets) {
            const victim = actorOfRow(t);
            if (!victim) continue;
            if (a.inflicts.condition && a.inflicts.onFail && !(victim.system?.conditionImmunities ?? []).includes(a.inflicts.condition)) {
              await until(() => victim.statuses.has(a.inflicts.condition), `${victim.name} ${a.inflicts.condition}`);
              const effect = victim.effects.find(e => e.statuses.has(a.inflicts.condition));
              const want = { endOfNextTurn: "turnEnd", endOfRound: "roundEnd", encounter: "combatEnd" }[a.inflicts.until] ?? null;
              if (want && effect.duration?.expiry !== want && effect._source?.duration?.expiry !== want) throw new Error(`${a.inflicts.condition} on ${victim.name} lasts ${effect._source?.duration?.expiry ?? "for ever"}, not ${want}`);
            }
            if (plan.forced?.on === "fail") {
              const tok = scene.tokens.get(t.tokenId);
              const was = pos.get(t.tokenId);
              await sleep(200);
              if (was && plan.forced.toward === "away" && tok.x === was.x && tok.y === was.y) throw new Error(`${victim.name} was not ${plan.forced.toward === "away" ? "pushed" : "pulled"}`);
            }
            if (plan.poolLoss?.on === "fail" && (victim.poolSnapshot?.() ?? []).length) {
              await until(() => JSON.stringify((victim.poolSnapshot?.() ?? []).map(p => p.value)) !== JSON.stringify(pools.get(victim.id)), `${victim.name}'s pool to fall`);
            }
            if (plan.sunder) await until(() => victim.effects.some(e => e.getFlag(SCOPE, "sundered")), `${victim.name} Sundered`);
            if (plan.bane) await until(() => victim.effects.some(e => e.getFlag(SCOPE, LAID_BANE_FLAG)), `${victim.name}'s laid Bane`);
            if (plan.cannotAttack) await until(() => victim.effects.some(e => e.getFlag(SCOPE, CANNOT_ATTACK_FLAG)), `${victim.name} cannot attack`);
            if (plan.reminder) await until(() => victim.effects.some(e => e.getFlag(SCOPE, REMINDER_FLAG)), `${victim.name}'s reminder`);
            if (plan.sideSwitch && (!plan.sideSwitch.kinds?.length || plan.sideSwitch.kinds.includes(victim.system?.creatureType))) {
              await until(() => victim.effects.some(e => e.getFlag(SCOPE, SIDE_SWITCH_FLAG)), `${victim.name}'s side switched`);
              const c = combat.combatants.find(x => x.tokenId === t.tokenId);
              if (c?.side !== "hostile") throw new Error(`${victim.name} still fights on the ${c?.side} side`);
            }
          }
          if (plan.drain?.fixed) await until(() => boss.system.health.value > hp.get(boss.id), `${boss.name} to recover`);
        }
        if ((a.damage.amount ?? 0) > 0 && cardTargets.length) {
          const message = game.messages.get(card.id);
          const rowsDmg = message.flags[SCOPE].damageByTarget ?? [];
          for (const b of buttonsOf(card, '[data-action="applyDamage"][data-target-index]')) await CARD_ACTIONS.applyDamage(b, game.messages.get(card.id));
          await sleep(300);
          for (const [i, t] of cardTargets.entries()) {
            const victim = actorOfRow(t);
            const dealt = rowsDmg[i]?.damage ?? 0;
            if (victim && dealt > 0) await until(() => victim.system.health.value < hp.get(victim.id), `${victim.name} to take ${dealt}`);
          }
          if (plan.drain?.dealt && rowsDmg.some(r => (r?.damage ?? 0) > 0)) await until(() => boss.system.health.value > hp.get(boss.id), `${boss.name} to recover what it drained`);
        }
        if (!a.resist && a.inflicts.condition && cardTargets.length) {
          for (const b of buttonsOf(card, `[data-action="applyCondition"][data-condition="${a.inflicts.condition}"]`)) await CARD_ACTIONS.applyCondition(b, game.messages.get(card.id));
          for (const t of cardTargets) {
            const victim = actorOfRow(t);
            if (!victim || (victim.system?.conditionImmunities ?? []).includes(a.inflicts.condition)) continue;
            await until(() => victim.statuses.has(a.inflicts.condition), `${victim.name} ${a.inflicts.condition}`);
            const effect = victim.effects.find(e => e.statuses.has(a.inflicts.condition));
            if (plan.escape && !effect.getFlag(SCOPE, ESCAPE_FLAG)) throw new Error(`${victim.name}'s ${a.inflicts.condition} carries no escape`);
            if (plan.grip && !effect.getFlag(SCOPE, BOSS_GRIP_FLAG)) throw new Error(`${victim.name}'s grip is not recorded`);
          }
          if (plan.grip) {
            const before = new Map(cardTargets.map(t => [t.tokenId, actorOfRow(t)?.system.health.value]));
            await combat._bossGrips(boss);
            if (!cardTargets.some(t => (actorOfRow(t)?.system.health.value ?? 0) < (before.get(t.tokenId) ?? 0))) throw new Error("the grip struck nobody at the holder's turn");
          }
        }
        if (flags.summon?.entry && a.kind === "summon") {
          const was = scene.tokens.size;
          const place1 = buttonsOf(card, '[data-action="placeSummon"]')[0];
          await CARD_ACTIONS.placeSummon(place1, game.messages.get(card.id));
          await until(() => scene.tokens.size === was + flags.summon.count, `${flags.summon.count} ${flags.summon.entry}`, 20000);
          const { said } = await saidDuring(() => CARD_ACTIONS.placeSummon(place1, game.messages.get(card.id)));
          await sleep(300);
          if (scene.tokens.size !== was + flags.summon.count) throw new Error("a second Place placed the bodies again");
          if (!said.length) throw new Error("the second Place was refused in silence");
          const arrived = combat.combatants.filter(c => !ctx.base.has(c.tokenId));
          if (!arrived.length || arrived.some(c => !(Number(c.getFlag(SCOPE, "arrives")) > combat.round))) throw new Error("the bodies do not wait for the next round");
          if (!combat._bossTurnSkip(arrived[0])) throw new Error("an arrival's turn is not passed");
          await sleep(1500);
        }
        if (a.kind === "attack") {
          canvas.tokens.setTargets([mageTok.id]);
          const atk = buttonsOf(card, '[data-action="attackFromCard"]')[0];
          if (!atk) throw new Error("the card draws no Attack");
          const before = game.messages.size;
          await pinned(20, () => CARD_ACTIONS.attackFromCard(atk, game.messages.get(card.id)));
          await until(() => game.messages.size > before, "the attack's card");
          const allowed = Number(flags.attacks?.allowed) || 0;
          if (allowed === 1) {
            const n = game.messages.size;
            const { said } = await pinned(20, () => saidDuring(() => CARD_ACTIONS.attackFromCard(atk, game.messages.get(card.id))));
            await sleep(300);
            if (game.messages.size !== n || !said.length) throw new Error("a second Attack past the allowance was not refused in words");
          }
          if (plan.attack?.landsOnHit?.length) await until(() => mage.statuses.has(plan.attack.landsOnHit[0].condition), `the hit to lay ${plan.attack.landsOnHit[0].condition}`);
          if (plan.door === "disengage" && boss.statuses.has("disengaging")) throw new Error("the Disengage outlived the attack");
        }
        if (plan.selfHeal) {
          const healBtn = buttonsOf(card, '[data-action="applyHealing"][data-self]')[0];
          if (!healBtn) throw new Error("the heal is not the Boss's own");
          await CARD_ACTIONS.applyHealing(healBtn, game.messages.get(card.id));
          await until(() => boss.system.health.value > hp.get(boss.id), `${boss.name} healed`);
          if (plan.healAlt && !buttonsOf(card, `[data-action="applyHealing"][data-heal="${plan.healAlt}"]`).length) throw new Error("no button for the higher amount");
        }
        if (plan.poolGain) await until(() => (boss.poolSnapshot?.() ?? []).some(p => p.kind === "power" && p.value >= plan.poolGain.amount), `${boss.name} to gain Power`);
        if (plan.poolLoss?.on === "press") await until(() => JSON.stringify((mage.poolSnapshot?.() ?? []).map(p => p.value)) !== JSON.stringify(pools.get(mage.id))
          || JSON.stringify((hunter.poolSnapshot?.() ?? []).map(p => p.value)) !== JSON.stringify(pools.get(hunter.id)), "a target's pool drained");
        if (plan.forced?.on === "press") {
          await sleep(300);
          if (![mageTok, hunterTok].some(t => { const was = pos.get(t.id); return t.x !== was.x || t.y !== was.y; })) throw new Error("nobody was pushed at the press");
        }
        if (plan.zone) {
          const placeBtn = buttonsOf(card, '[data-action="placeArea"]')[0];
          if (!placeBtn) throw new Error("the card offers no Place area for its zone");
          const placing = CARD_ACTIONS.placeArea(placeBtn, game.messages.get(card.id));
          await answerPick({ x: mageTok.object.center.x, y: mageTok.object.center.y });
          await placing;
          const region = await until(() => scene.regions.find(r => r.getFlag(SCOPE, "cast") === flags.cast), "the zone's Region", 15000);
          const lasts = region.getFlag(SCOPE, "lasts") ?? {};
          if (plan.zone.lasts === "encounter" && lasts.encounter !== true) throw new Error("the zone does not last the encounter");
          if (plan.zone.lasts === "round" && lasts.endOfRound !== true) throw new Error("the zone does not end with the round");
          if ((plan.zone.damage || plan.zone.check) && !region.getFlag(SCOPE, "areaTick")) throw new Error("the zone carries no start-of-turn strike");
          if (plan.zone.difficult && !region.getFlag(SCOPE, "areaGround")?.difficult) throw new Error("the zone is not Difficult ground");
        }
        switch (plan.door) {
          case "relocateSelf":
          case "gyth": {
            await until(() => bossTok.x !== pos.get(bossTok.id).x || bossTok.y !== pos.get(bossTok.id).y, `${boss.name} moved`);
            await until(() => boss.effects.some(e => e.getFlag(SCOPE, MISS_NEXT_FLAG)), "the miss to come");
            // The next attack against it misses, whatever the die, and only the next.
            canvas.tokens.setTargets([bossTok.id]);
            await settle();
            const { npcAttackWithDialog } = await import("../applications/actions.mjs");
            const swung = untilHook("createChatMessage", 20000, m => m.speaker?.actor === hunter.id).then(([m]) => m);
            // Charged nothing (`budget: "none"`): whose turn the tracker stands on is not what this asks.
            await pinned(20, () => npcAttackWithDialog(hunter, 0, null, { budget: "none" }));
            const blow = await swung;
            if (blow.rolls?.[0]?.outcome?.success !== false) throw new Error("the next attack against it hit");
            if (boss.effects.some(e => e.getFlag(SCOPE, MISS_NEXT_FLAG))) throw new Error("the miss outlived the attack it took");
            break;
          }
          case "relocateTarget":
            await until(() => mageTok.x !== pos.get(mageTok.id).x || mageTok.y !== pos.get(mageTok.id).y, "the target put down elsewhere");
            break;
          case "away":
            await until(() => mageTok.x !== pos.get(mageTok.id).x && mage.effects.some(e => e.getFlag(SCOPE, AWAY_FLAG)), "the target sent away");
            if (!combat._bossTurnSkip(combat.combatants.find(c => c.tokenId === mageTok.id))) throw new Error("an absent creature's turn is not passed");
            break;
          case "selfLine":
            await until(() => bossTok.x !== pos.get(bossTok.id).x || bossTok.y !== pos.get(bossTok.id).y, `${boss.name} rode the line`);
            break;
          case "disengage":
            break;
          case "allyAttack":
            await until(() => game.messages.some(m => m.speaker?.actor === ally.id), "the ally's attack");
            break;
          case "marked":
            await until(() => hunter.effects.some(e => e.getFlag(SCOPE, EXPOSED_FLAG)?.side === "hostile"), "the named creature marked for the Boss's side");
            break;
          case "amaniFury":
            await until(() => boss.effects.some(e => e.getFlag(SCOPE, LAID_BOON_FLAG)) && boss.effects.some(e => e.getFlag(SCOPE, EXPOSED_FLAG)), "the Boss's Boons");
            break;
          case "classCall":
            await until(() => mage.effects.some(e => e.getFlag(SCOPE, LAID_BANE_FLAG)), "the Mage's Bane on Casting Tests");
            break;
          case "enfeeble":
            await until(() => hunter.effects.some(e => (e.system?.changes ?? []).some(c => c.key === "system.ap.body" && c.type === "override")), "Armor Points counted as 0");
            if ((hunter.system.ap?.body ?? 0) !== 0) throw new Error(`${hunter.name}'s Body AP reads ${hunter.system.ap?.body}`);
            break;
          case "copies":
            await until(() => scene.tokens.filter(t => t.actor?.getFlag(SCOPE, BOSS_COPY_FLAG) === boss.uuid).length === (plan.count ?? 2), "the copies", 20000);
            break;
          case "raise": {
            const entry = a.summon.entry;
            const want = plan.all ? corpses.length : 1;
            await until(() => scene.tokens.filter(t => t.actor?.name === entry).length >= want, `${want} ${entry} raised`, 20000);
            await until(() => corpses.filter(c => scene.tokens.has(c.id)).length === corpses.length - want, "the corpses raised gone", 15000);
            break;
          }
          default:
            break;
        }
        void allyTok;
      }
    });
  };
}

export const bossActionsBatch1 = bossActionsBatch(1);
export const bossActionsBatch2 = bossActionsBatch(2);
export const bossActionsBatch3 = bossActionsBatch(3);
export const bossActionsBatch4 = bossActionsBatch(4);

/** The economy: the points, their one writer, and its refusals in words. */
export function bossEconomyBatch(context) {
  const { describe, it, assert, after } = context;
  describe("14 §1's Boss Action economy (D-809)", function () {
    after(async function () { this.timeout(60000); await cleanup(); });

    it("spends a Use, an x2 and nothing more, refuses a short Boss and a second press after one turn in words, and refreshes at the fight's end", async function () {
      this.timeout(120000);
      const scene = await Scene.create({ name: "ZZ Boss Economy", width: 3000, height: 2000, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);
      await scene.view();
      await until(() => canvas.ready && canvas.scene?.id === scene.id, "the scene viewed", 20000);
      const boss = await worldCopy("Archaedas");
      const [tok] = await place(scene, [{ actor: boss, x: 1000, y: 800, side: "HOSTILE" }]);
      const max = boss.system.bossPoints.max;
      const w = game.system.azeroth.workflows;
      const index = name => boss.system.bossActions.findIndex(r => r.name === name);
      // Out of a fight it spends as in one (the lead's ruling on Q18), and two at once spend twice.
      const one = index("Stone Grip");
      canvas.tokens.setTargets([]);
      await Promise.all([w.useAbility({ actor: boss, list: "bossActions", index: one, targets: [] }), w.useAbility({ actor: boss, list: "bossActions", index: one, targets: [] })]);
      await until(() => boss.system.bossPoints.value === max - 2, "two presses, two points");
      // A short Boss is refused in words, with nothing spent and no card.
      const two = index("Wake the Guardians");
      const { result, said } = await saidDuring(() => w.useAbility({ actor: boss, list: "bossActions", index: two, targets: [] }));
      assert.isNull(result, "an x2 went through on one point");
      assert.isTrue(said.some(s => /2/.test(s) && /1/.test(s)), `the refusal did not name the cost and what is held: ${said.join(" | ")}`);
      assert.equal(boss.system.bossPoints.value, max - 2);
      // A repeated press id writes once.
      await refreshBossPoints(boss);
      await until(() => boss.system.bossPoints.value === max, "refreshed");
      const id = foundry.utils.randomID();
      await bossPointsQueryHandler({ actorUuid: boss.uuid, cost: 1, pressId: id }, { user: game.user });
      const again = await bossPointsQueryHandler({ actorUuid: boss.uuid, cost: 1, pressId: id }, { user: game.user });
      assert.isTrue(again.again === true, "a repeated id was not recognised");
      assert.equal(boss.system.bossPoints.value, max - 1, "a repeated press id spent twice");
      // A player who owns no Boss is refused; one who owns it is served. A ZZ player is made
      // where the world has none, so the branch always runs.
      let player = game.users.find(u => !u.isGM) ?? null;
      if (!player) {
        player = await User.create({ name: "ZZ Boss Player", role: CONST.USER_ROLES.PLAYER });
        made.push(player);
      }
      {
        let refused = false;
        try { await bossPointsQueryHandler({ actorUuid: boss.uuid, cost: 1, pressId: foundry.utils.randomID() }, { user: player }); } catch { refused = true; }
        assert.isTrue(refused, "a player who owns nothing spent a Boss's points");
        await boss.update({ [`ownership.${player.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
        const served = await bossPointsQueryHandler({ actorUuid: boss.uuid, cost: 1, pressId: foundry.utils.randomID() }, { user: player });
        assert.isTrue(served.ok, "the owning player was refused");
      }
      // In a fight: one Boss Action after each turn, a x2 the only two.
      await refreshBossPoints(boss);
      const combat = await Combat.create({ scene: scene.id });
      await combat.createEmbeddedDocuments("Combatant", [{ tokenId: tok.id, sceneId: scene.id, actorId: boss.id }]);
      await combat.activate();
      await combat.startCombat();
      await until(() => boss.system.bossPoints.value === max, "full at the fight's start");
      const posted = cardFrom(boss, "Wake the Guardians");
      await w.useAbility({ actor: boss, list: "bossActions", index: two, targets: [] });
      const card = await posted;
      await until(() => boss.system.bossPoints.value === max - 2, "an x2 spends two");
      const second = await saidDuring(() => w.useAbility({ actor: boss, list: "bossActions", index: one, targets: [] }));
      assert.isNull(second.result, "a second Boss Action after the same turn went through");
      assert.isTrue(second.said.length > 0, "the second press was refused in silence");
      assert.equal(boss.system.bossPoints.value, max - 2);
      assert.isTrue(card.flags[SCOPE].bossAction);
      // The Hex shuts every Boss Action (D-808).
      await refreshBossPoints(boss);
      const laid = await layForcedShape({ target: boss, kind: "hexed" });
      assert.isTrue(laid.laid, `the Hex was not laid: ${laid.reason}`);
      await until(() => boss.shape?.kind === "hexed", "the Boss hexed");
      {
        const hexed = await saidDuring(() => w.useAbility({ actor: boss, list: "bossActions", index: one, targets: [] }));
        assert.isNull(hexed.result, "a Hexed Boss took a Boss Action");
        assert.equal(boss.system.bossPoints.value, max, "a Hexed Boss spent a point");
        const ids = boss.effects.map(e => e.id);
        if (ids.length) await boss.deleteEmbeddedDocuments("ActiveEffect", ids);
      }
      // Spent, then the fight ends: full again (Q18).
      await w.useAbility({ actor: boss, list: "bossActions", index: one, targets: [] });
      await until(() => boss.system.bossPoints.value === max - 1, "a point spent");
      await combat.delete();
      await until(() => boss.system.bossPoints.value === max, "full again at the fight's end", 15000);
      await ChatMessage.deleteDocuments(game.messages.filter(m => m.speaker?.actor === boss.id).map(m => m.id));
    });
  });
}
