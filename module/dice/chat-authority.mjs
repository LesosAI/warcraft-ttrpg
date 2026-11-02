/** Recovery controls depend on the active GM, which can change without a
 * ChatMessage update. Redraw rendered system cards on that change.
 * V14 ChatLog.updateMessage also refreshes notifications and its popout. */
export function registerChatAuthorityHooks() {
  let activeId = game.users?.activeGM?.id;
  Hooks.once('ready', () => { activeId = game.users.activeGM?.id; });
  const refresh = () => {
    if (!game.ready) return;
    const nextId = game.users.activeGM?.id;
    if (nextId === activeId) return;
    activeId = nextId;
    const ids = new Set(Array.from(document.querySelectorAll('.message[data-message-id]'),
      element => element.dataset.messageId));
    for (const id of ids) {
      const message = game.messages.get(id);
      if (!message?.flags?.['azeroth-rpg']) continue;
      void ui.chat.updateMessage(message).catch(error =>
        console.warn('azeroth-rpg | Chat authority refresh', error));
    }
  };
  Hooks.on('userConnected', refresh);
  Hooks.on('updateUser', refresh);
}
