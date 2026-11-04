/** GM settings window for the browser-held private spell key.
 * Backup text is shown only after an explicit click and is never written to a
 * world document, chat message, file, or console by this application. */
import { createPrivateSpellKey, exportPrivateSpellKey, importPrivateSpellKey,
  privateSpellKeyStatus } from "../effects/private-spell-records.mjs";

const ApplicationV2 = foundry.applications.api.ApplicationV2;

export class PrivateSpellKeyMenu extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "azeroth-private-spell-keys",
    tag: "div",
    classes: ["azeroth", "azeroth-roll-dialog", "standard-form"],
    window: { title: "Private Spell Keys", resizable: true },
    position: { width: 560, height: 430 },
    actions: {
      createKey: PrivateSpellKeyMenu.#create,
      showBackup: PrivateSpellKeyMenu.#backup,
      restoreKey: PrivateSpellKeyMenu.#restore
    }
  };

  #backupText = "";
  #notice = "";

  async _prepareContext() {
    if (!game.user?.isGM) throw new Error("Only a GM may manage private spell keys.");
    return { status: privateSpellKeyStatus() };
  }

  async _renderHTML({ status }) {
    const body = document.createElement("section");
    body.className = "standard-form";
    const heading = document.createElement("h2");
    heading.textContent = "Private spell records";
    body.append(heading);

    const state = document.createElement("p");
    state.textContent = `Encrypted records: ${status.encryptedRecords}. Key on this browser: ${status.localKey ? "present" : "missing"}. WebCrypto: ${status.secureContext ? "available" : "unavailable"}.`;
    body.append(state);
    const note = document.createElement("p");
    note.textContent = "This browser-held key is required for encrypted spell records. A world backup does not include it. Save the key so you can restore access on another GM browser. A missing key cannot be regenerated while encrypted records exist.";
    body.append(note);

    const controls = document.createElement("div");
    controls.className = "form-group";
    const create = document.createElement("button");
    create.type = "button";
    create.dataset.action = "createKey";
    create.textContent = "Create key";
    create.disabled = status.localKey || status.encryptedRecords > 0 || !status.secureContext;
    const backup = document.createElement("button");
    backup.type = "button";
    backup.dataset.action = "showBackup";
    backup.textContent = "Show backup key";
    backup.disabled = !status.localKey || !status.secureContext;
    controls.append(create, backup);
    body.append(controls);

    const label = document.createElement("label");
    label.textContent = "Backup key to copy or restore";
    const input = document.createElement("textarea");
    input.name = "backupKey";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.rows = 4;
    input.value = this.#backupText;
    label.append(input);
    body.append(label);

    const restore = document.createElement("button");
    restore.type = "button";
    restore.dataset.action = "restoreKey";
    restore.textContent = "Restore key from text";
    restore.disabled = !status.secureContext;
    body.append(restore);
    const feedback = document.createElement("p");
    feedback.setAttribute("role", "status");
    feedback.textContent = this.#notice;
    body.append(feedback);
    return body;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static async #create(_event, _target) {
    try {
      await createPrivateSpellKey();
      this.#notice = "Key created on this GM browser. Show and save its backup so another GM browser can restore access.";
    } catch (error) { this.#notice = error.message; }
    await this.render({ force: true });
  }

  static async #backup(_event, _target) {
    try {
      this.#backupText = await exportPrivateSpellKey();
      this.#notice = "Copy this backup to your secure storage. The system will not save a second copy for you.";
    } catch (error) { this.#notice = error.message; }
    await this.render({ force: true });
  }

  static async #restore(_event, _target) {
    const value = this.element?.querySelector('textarea[name="backupKey"]')?.value?.trim();
    try {
      await importPrivateSpellKey(value);
      this.#backupText = "";
      this.#notice = "Key restored on this GM browser. Stored encrypted records remain readable.";
    } catch (error) {
      this.#backupText = "";
      this.#notice = error.message;
    }
    await this.render({ force: true });
  }
}

export function registerPrivateSpellKeyMenu() {
  const key = "azeroth-rpg.privateSpellKeys";
  if (game.settings.menus.has(key)) return;
  game.settings.registerMenu("azeroth-rpg", "privateSpellKeys", {
    name: "Private Spell Keys",
    label: "Manage private spell keys",
    hint: "Create, back up, or restore the GM browser key used for private spell records.",
    icon: "fa-solid fa-key",
    type: PrivateSpellKeyMenu,
    restricted: true
  });
}
