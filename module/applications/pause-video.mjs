/**
 * A custom "Game Paused" animation in place of core's spinning icon.
 *
 * Verified against 14.367 (client/applications/ui/game-pause.mjs): GamePause
 * is an ApplicationV2 that renders <img src="ui/pause.svg"> inside
 * <figure id="pause">, replacing that figure's children on every render and
 * firing the "renderGamePause" hook afterward. An <img> cannot play video, so
 * the element is swapped for a <video> here instead of overriding the icon
 * path — this re-runs on every render, including the toggle back to unpaused.
 */
const PAUSE_VIDEO_SRC = "systems/azeroth-rpg/assets/ui/pause.webm";

export function registerPauseVideo() {
  Hooks.on("renderGamePause", (app, element) => {
    const img = element.querySelector("img");
    if (!img) return;
    const video = document.createElement("video");
    video.src = PAUSE_VIDEO_SRC;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    img.replaceWith(video);
  });
}
