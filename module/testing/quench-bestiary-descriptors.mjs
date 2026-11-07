/**
 * MIGRATION 0.13.1 INSIDE A LIVE WORLD (D-807): the bestiary audit's descriptors on the creatures
 * a world already holds.
 *
 * The recorded old table, the pure plan and a walk over a stubbed world have their Vitest
 * (`migrations/0.13.1-bestiary-descriptors.test.mjs`). What none of it can reach is the real
 * document path: the rebuilt pack the migration reads, core's `_stats.compendiumSource` on a copy
 * made from the compendium (the record that finds a copy a GM renamed), the NPC model's
 * `migrateData` and schema cleaning what the migration writes, and an unlinked token whose own
 * delta holds the old descriptor.
 *
 * **Stale it ON PURPOSE** (CLAUDE.md §15): a creature made from the rebuilt pack already holds the
 * new descriptors, and a test that wrote nothing old would pass with the migration doing nothing.
 * Every creature here is a `ZZ` copy, deleted in `after`.
 */

import { cleanAutomation } from "../rules/ability-automation.mjs";
import { forgetPacks } from "../migrations/walk.mjs";
import { BESTIARY_PACK, OLD_DESCRIPTORS, migrate } from "../migrations/0.13.1-bestiary-descriptors.mjs";
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

/** Deep equality with key order ignored. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/** A row's stored descriptor, cleaned to the whole shape. */
const held = (actor, list, name) => cleanAutomation(actor._source.system[list].find(r => r.name === name)?.automation);

export function bestiaryDescriptorsBatch(context) {
  const { describe, it, assert, after } = context;

  describe("Migration 0.13.1: the bestiary audit's descriptors on a world's creatures (D-807)", function () {
    after(async function () {
      this.timeout(120000);
      forgetPacks();
      await cleanup();
    });

    /** A pack entry, by name. */
    async function entry(name) {
      const pack = game.packs.get(BESTIARY_PACK);
      assert.ok(pack, `no pack ${BESTIARY_PACK}`);
      const index = await pack.getIndex();
      const found = index.find(e => e.name === name);
      assert.ok(found, `${BESTIARY_PACK} holds no "${name}"`);
      return pack.getDocument(found._id);
    }

    /** The pack's own descriptor for a row, cleaned. */
    const fresh = (doc, list, name) => cleanAutomation(doc.system[list].find(r => r.name === name)?.automation);

    /**
     * A ZZ copy made the way a drag from the compendium makes one: core records the entry it came
     * from, which is what finds a copy a GM renamed.
     */
    async function copyOf(name) {
      const doc = await entry(name);
      // The entry's compendium folder is no world folder.
      const data = game.actors.fromCompendium(doc, { clearFolder: true });
      data.name = `ZZ ${name} 0.13.1`;
      const actor = await Actor.create(data);
      made.push(actor);
      return { actor, doc };
    }

    /** Write a row's old pack descriptor, and a GM's own touch where one is given. */
    async function writeOld(actor, slug, list, name, touch = null) {
      const rows = foundry.utils.deepClone(actor._source.system[list]);
      const row = rows.find(r => r.name === name);
      assert.ok(row, `${actor.name} holds no ${list} row ${name}`);
      row.automation = cleanAutomation(OLD_DESCRIPTORS[slug][list][name]);
      touch?.(row.automation);
      await actor.update({ [`system.${list}`]: rows });
      const want = cleanAutomation(row.automation);
      await until(() => same(held(actor, list, name), want), `${actor.name}'s ${name} to hold what was written`);
    }

    it("reads a rebuilt pack: the audit's descriptors are in the compendium", async function () {
      this.timeout(30000);
      // Said first, in words: off a pack compiled before the audit the migration stamps nothing,
      // and every test below would be measuring nothing.
      const baron = await entry("Baron Rivendare");
      // The audit made it an announcement; D-809 gave it its door (`allyAttack`), so the
      // rebuilt pack carries the door - and never the Boss's own attack the audit took off.
      const unholy = fresh(baron, "bossActions", "Unholy Command");
      assert.notEqual(unholy.kind, "attack", "the bestiary pack carries the old Unholy Command: it was not rebuilt from packs-src");
      assert.equal(unholy.plan?.door, "allyAttack", "the bestiary pack predates D-809: it was not rebuilt from packs-src");
      const otter = await entry("Lordamere Otter");
      const swimmer = fresh(otter, "creatureAbilities", "Strong Swimmer");
      assert.equal(swimmer.kind, "passive", "the bestiary pack carries the old Strong Swimmer: it was not rebuilt from packs-src");
      assert.isNull(swimmer.inflicts.condition, "Strong Swimmer still lays Slowed in the pack");
    });

    it("restamps a stale Unholy Command and Strong Swimmer on world actors and an unlinked token, keeps a spent use and a GM's own row, and twice changes nothing", async function () {
      this.timeout(180000);
      // A scene of its own, never viewed, made first so it is deleted first.
      const scene = await Scene.create({ name: "ZZ Bestiary Descriptors", width: 1200, height: 1200, grid: { size: 100, distance: 5, units: "ft" } });
      made.push(scene);

      const { actor: baron, doc: baronDoc } = await copyOf("Baron Rivendare");
      assert.equal(baron._stats.compendiumSource, baronDoc.uuid, "core did not record the entry the copy was made from");
      const { actor: otter, doc: otterDoc } = await copyOf("Lordamere Otter");
      const { actor: knight, doc: knightDoc } = await copyOf("Scarlet Knight");
      const { actor: captain, doc: captainDoc } = await copyOf("Warband Captain");

      // An UNLINKED token of the otter whose OWN delta holds the old Strong Swimmer. It is written
      // while the world otter still holds the pack's, or core would diff the write away and the
      // token would only ever reflect its base.
      const [placed] = await scene.createEmbeddedDocuments("Token", [{ name: otter.name, actorId: otter.id, actorLink: false, x: 300, y: 300 }]);
      const token = () => scene.tokens.get(placed.id);
      assert.isFalse(token().actorLink, "the token is linked");
      await writeOld(token().actor, "lordamere-otter", "creatureAbilities", "Strong Swimmer");
      assert.ok(token().delta?._source?.system?.creatureAbilities, "the old Strong Swimmer is not in the token's own delta");

      // The world actors, staled the same way.
      await writeOld(baron, "baron-rivendare", "bossActions", "Unholy Command");
      await writeOld(otter, "lordamere-otter", "creatureAbilities", "Strong Swimmer");
      // A spent use is play, not an edit.
      await writeOld(knight, "scarlet-knight", "creatureAbilities", "Righteous Fury", a => { a.uses.value = 0; });
      // The captain's Orders is the old pack copy; its Reads the Field is a GM's own.
      await writeOld(captain, "warband-captain", "creatureAbilities", "Orders");
      await writeOld(captain, "warband-captain", "creatureAbilities", "Reads the Field", a => { a.note = "ZZ the GM's own."; });
      const gmOwn = held(captain, "creatureAbilities", "Reads the Field");
      assert.equal(held(baron, "bossActions", "Unholy Command").kind, "attack", "the stale did not take");
      assert.equal(held(token().actor, "creatureAbilities", "Strong Swimmer").inflicts.condition, "slowed", "the token's stale did not take");

      forgetPacks();
      const logged = [];
      const touched = await migrate(line => logged.push(line));
      // Five: four world actors and the token. Any other stale creature the test world holds is counted too.
      assert.isAtLeast(touched, 5, "the migration did not touch the four creatures and the token");

      // The renamed Boss is found by the entry it was dragged from, and its Use comes off.
      assert.isTrue(same(held(baron, "bossActions", "Unholy Command"), fresh(baronDoc, "bossActions", "Unholy Command")),
        "Unholy Command was not restamped from the pack");
      // Its Use is the door D-809 built, never the Boss's own attack.
      assert.equal(baron.system.bossActions.find(r => r.name === "Unholy Command").automation.plan?.door, "allyAttack");
      // The otter, on the world actor and on the token's own delta.
      assert.isTrue(same(held(otter, "creatureAbilities", "Strong Swimmer"), fresh(otterDoc, "creatureAbilities", "Strong Swimmer")),
        "the world otter's Strong Swimmer was not restamped");
      await until(() => same(held(token().actor, "creatureAbilities", "Strong Swimmer"), fresh(otterDoc, "creatureAbilities", "Strong Swimmer")),
        "the token's own Strong Swimmer to be restamped");
      assert.isNull(token().actor.system.creatureAbilities.find(r => r.name === "Strong Swimmer").automation.inflicts.condition,
        "the token's otter still lays Slowed");
      assert.ok(logged.some(l => l.includes(token().actor.uuid)), "the token was touched and not logged");
      // The knight takes the pack's Righteous Fury with its spent use kept.
      const fury = held(knight, "creatureAbilities", "Righteous Fury");
      assert.isNull(fury.inflicts.condition, "Righteous Fury still lays Frightened");
      assert.equal(fury.reason, "aura");
      assert.deepEqual(fury.uses, { max: 1, value: 0, per: "encounter" }, "the spent use was refilled or lost");
      assert.isTrue(same({ ...fury, uses: null }, { ...fresh(knightDoc, "creatureAbilities", "Righteous Fury"), uses: null }),
        "Righteous Fury differs from the pack's beyond its spent use");
      // The captain: the old Orders restamped, the GM's own Reads the Field kept and named.
      assert.isTrue(same(held(captain, "creatureAbilities", "Orders"), fresh(captainDoc, "creatureAbilities", "Orders")),
        "Orders was not restamped");
      assert.isTrue(same(held(captain, "creatureAbilities", "Reads the Field"), gmOwn), "a GM's own descriptor was overwritten");
      assert.ok(logged.some(l => l.includes(captain.uuid) && l.includes("keeps its own descriptor for Reads the Field")),
        "the GM's own row was kept and not logged");

      // IDEMPOTENT: a second run has nothing left to do, here or anywhere.
      forgetPacks();
      assert.equal(await migrate(() => {}), 0, "a second run touched documents again");
    });
  });
}
