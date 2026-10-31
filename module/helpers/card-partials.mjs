/**
 * **A CARD'S CONTROL IS DRAWN FROM ITS PARTIAL** (the lead's option A,
 * 2026-10-31; CLAUDE.md §7: chat cards render from the templates in
 * `templates/chat/`). Fourteen of `dice/chat.mjs`'s `CARD_ACTIONS` had their
 * buttons built in the render hook with `createElement`, so no chat template
 * carried them and `module/actions.test.mjs` could not tell a live handler from
 * a dead one. Their markup lives in `templates/chat/partials/` now, preloaded
 * with every other partial (`helpers/handlebars.mjs`), and the show function
 * that built each one draws it here instead - at the same place, under the same
 * conditions and AFTER the hook's audience strip, exactly as the hand-built
 * element was, so who sees it is unchanged. They are drawn at render time
 * rather than stored in the card because what decides them is read then: the
 * active GM, a claim's stage, the creatures a triggered trap caught.
 *
 * Synchronous: the render hook wires every `[data-action]` it finds as it
 * ends, so a control appended later would never answer a click. Core registers
 * a preloaded template as a compiled partial under its own path
 * (`foundry.applications.handlebars.getTemplate`), which is what is read here.
 *
 * Reads `Handlebars`, `document`, `foundry`, `game` and `ui` only when called,
 * so the pure half stays importable under Vitest.
 */

/** Core's `renderTemplate` options, so a partial resolves what a card template does. */
const RENDER = Object.freeze({ allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });

/** Partial path -> ids of the messages drawn before it had loaded. */
const waiting = new Map();

/**
 * The partial's HTML, or null where it is not registered yet.
 *
 * @param {string} path  `systems/azeroth-rpg/templates/chat/partials/...`
 * @param {object} [data]
 * @returns {string|null}
 */
export function cardPartialHTML(path, data = {}) {
  const template = globalThis.Handlebars?.partials?.[path];
  return typeof template === "function" ? template(data, RENDER) : null;
}

/**
 * The partial's first element, ready to append, or null.
 *
 * **A card drawn before the preload has landed draws the control again once it
 * has** rather than printing nothing until the next update: `preloadTemplates`
 * runs in the `setup` hook, which core does not await, and the chat log renders
 * straight after it. The message is re-rendered through `ui.chat`, which runs
 * this hook again with the partial in place. A template that fails to load
 * leaves the control off in silence; `module/dice/card-partials.test.mjs` holds
 * every path to a file on disk and to the preload list.
 *
 * @param {string} path
 * @param {object} [data]
 * @param {ChatMessage|null} [message]  the card being drawn, to draw again
 * @returns {HTMLElement|null}
 */
export function drawCardPartial(path, data = {}, message = null) {
  const html = cardPartialHTML(path, data);
  if (html === null) {
    redrawWhenLoaded(path, message);
    return null;
  }
  const holder = document.createElement("template");
  holder.innerHTML = html.trim();
  return holder.content.firstElementChild;
}

function redrawWhenLoaded(path, message) {
  let ids = waiting.get(path);
  if (!ids) {
    ids = new Set();
    waiting.set(path, ids);
    const loaded = globalThis.foundry?.applications?.handlebars?.getTemplate?.(path);
    if (!loaded) {
      waiting.delete(path);
      return;
    }
    loaded.then(() => {
      waiting.delete(path);
      for (const id of ids) {
        const drawn = game.messages?.get(id);
        if (drawn) ui.chat?.updateMessage?.(drawn);
      }
    }, () => waiting.delete(path));
  }
  if (message?.id) ids.add(message.id);
}
