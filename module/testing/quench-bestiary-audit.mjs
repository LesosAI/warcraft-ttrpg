/**
 * MIGRATION 0.16.1.1 INSIDE A LIVE WORLD (D-1801 to D-1803): the 2026-11 bestiary audit on the
 * creatures a world already holds.
 *
 * The BEFORE table, the per-field plan over all 309 creatures and a walk over a stubbed world have
 * their Vitest (`migrations/0.16.1.1-bestiary-audit.test.mjs`). What none of it can reach is the
 * real document path: the rebuilt pack the migration reads, core's `_stats.compendiumSource` on a
 * copy made from the compendium, the NPC model cleaning what is written, a Ward map written
 * through `ForcedReplacement` (the old school must be GONE, not merged beside the new one), and an
 * unlinked token whose own delta holds the old number.
 *
 * **Stale it ON PURPOSE** (CLAUDE.md §15): a creature made from the rebuilt pack already holds the
 * new block. The table's short markers are the old values themselves, so the stale is written from
 * the table and never typed here. Every creature is a `ZZ` copy, deleted in `after`.
 */

import { forgetPacks } from "../migrations/walk.mjs";
import { BESTIARY_PACK, missingSentinels } from "../migrations/0.16.1.1-bestiary-audit-law.mjs";
import { BEFORE, migrate } from "../migrations/0.16.1.1-bestiary-audit.mjs";
import { cleanup, made } from "./fixtures.mjs";

/** Wait for a condition, or say what was being waited for. */
async function until(fn, what, ms = 20000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

/** The table's literal old value of one field of one creature. */
function oldValue(name, field) {
  const entry = Object.values(BEFORE.creatures).find(e => e.name === name);
  const marker = entry?.fields?.[field];
  if (marker === undefined || (marker && typeof marker === "object" && "#" in marker)) throw new Error(`no literal old ${field} for ${name}`);
  return marker;
}

export function bestiaryAuditBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Migration 0.16.1.1: the 2026-11 bestiary audit on a world's creatures (D-1801)", function () {
    after(async function () {
      this.timeout(120000);
      forgetPacks();
      await cleanup();
    });

    async function entry(name) {
      const pack = game.packs.get(BESTIARY_PACK);
      assert.ok(pack, `no pack ${BESTIARY_PACK}`);
      const found = (await pack.getIndex()).find(e => e.name === name);
      assert.ok(found, `${BESTIARY_PACK} holds no "${name}"`);
      return pack.getDocument(found._id);
    }

    /** A ZZ copy made the way a drag from the compendium makes one. */
    async function copyOf(name, extra = {}) {
      const doc = await entry(name);
      const data = game.actors.fromCompendium(doc, { clearFolder: true });
      data.name = `ZZ ${name} 0.16.1.1`;
      foundry.utils.mergeObject(data, extra);
      const actor = await Actor.create(data);
      made.push(actor);
      return { actor, doc };
    }

    it("reads a rebuilt pack: the audit's sentinels are in the compendium", async function () {
      this.timeout(30000);
      const pack = game.packs.get(BESTIARY_PACK);
      const byName = new Map((await pack.getDocuments()).map(d => [d.name, d.toObject().system]));
      assert.deepEqual(missingSentinels(byName), [], "the bestiary pack predates the audit: run packs:parse and packs:build");
    });

    it("restamps stale Initiative, Str and a Ward on world actors and an unlinked token, keeps a GM's Initiative and a bound creature's, and twice changes nothing", async function () {
      this.timeout(180000);
      const scene = await Scene.create({ name: "ZZ Bestiary Audit", width: 1200, height: 1200, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);

      const { actor: akumai, doc: akumaiDoc } = await copyOf("Aku'mai");
      assert.equal(akumai._stats.compendiumSource, akumaiDoc.uuid, "core did not record the entry the copy was made from");
      const { actor: infernal, doc: infernalDoc } = await copyOf("Infernal");
      const { actor: shade, doc: shadeDoc } = await copyOf("Shade");
      // A bound wolf: a real ZZ owner, so nothing that reads the bond meets a missing actor.
      const owner = await Actor.create({ name: "ZZ Ranger 0.16.1.1", type: "character" });
      made.push(owner);
      const { actor: wolf } = await copyOf("Wolf", { flags: { "azeroth-rpg": { bond: { ownerUuid: owner.uuid, ownerName: owner.name, kind: "companion", entryName: "Wolf" } } } });

      // An UNLINKED Shade token whose own delta holds the old Str, written while the world copy
      // still holds the pack's so core does not diff the write away.
      const [placed] = await scene.createEmbeddedDocuments("Token", [{ name: shade.name, actorId: shade.id, actorLink: false, x: 300, y: 300 }]);
      const token = () => scene.tokens.get(placed.id);
      await token().actor.update({ "system.abilities.str.value": oldValue("Shade", "abilities.str.value") });
      await until(() => token().actor._source.system.abilities.str.value === oldValue("Shade", "abilities.str.value"), "the token's stale Str");

      // The world copies staled from the table's own markers; the Infernal's Initiative a GM's own.
      const ward = foundry.data.operators.ForcedReplacement.create(oldValue("Aku'mai", "ward"));
      await akumai.update({ "system.initiative": oldValue("Aku'mai", "initiative"), "system.ward": ward,
        "system.abilities.str.value": oldValue("Aku'mai", "abilities.str.value") });
      await infernal.update({ "system.initiative": 25, "system.abilities.str.value": oldValue("Infernal", "abilities.str.value") });
      await wolf.update({ "system.initiative": oldValue("Wolf", "initiative") });
      await until(() => akumai._source.system.initiative === oldValue("Aku'mai", "initiative"), "Aku'mai's stale");
      assert.deepEqual(akumai._source.system.ward, oldValue("Aku'mai", "ward"), "the stale Ward did not take");

      forgetPacks();
      const logged = [];
      const touched = await migrate(line => logged.push(line));
      assert.isAtLeast(touched, 3, "the migration did not touch Aku'mai, the Infernal and the token");

      assert.equal(akumai._source.system.initiative, akumaiDoc.system.initiative, "Aku'mai's Initiative was not restamped");
      assert.equal(akumai._source.system.abilities.str.value, akumaiDoc.system.abilities.str.value);
      // ForcedReplacement: the old school is gone, not merged beside the new one.
      assert.deepEqual(akumai._source.system.ward, akumaiDoc.toObject().system.ward, "the Ward was merged rather than replaced");
      assert.equal(infernal._source.system.initiative, 25, "a GM's Initiative was overwritten");
      assert.equal(infernal._source.system.abilities.str.value, infernalDoc.system.abilities.str.value, "the Infernal's Str was not restamped");
      assert.ok(logged.some(l => l.includes(infernal.uuid) && l.includes("keeps its own initiative")), "the GM's field was kept and not logged");
      assert.equal(wolf._source.system.initiative, oldValue("Wolf", "initiative"), "a bound creature's stored Initiative was written");
      await until(() => token().actor._source.system.abilities.str.value === (shadeDoc.system.abilities.str.value ?? null), "the token's Str to be restamped");
      assert.isNull(token().actor.system.abilities.str.mod, "the Shade's Str dash still reads a modifier");

      forgetPacks();
      const second = [];
      await migrate(line => second.push(line));
      assert.notOk(second.some(l => l.includes("takes the bestiary audit") && [akumai, infernal, wolf].some(a => l.includes(a.uuid))),
        "a second run wrote the same creatures again");
    });
  });
}
