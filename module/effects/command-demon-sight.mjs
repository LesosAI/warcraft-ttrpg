/** Read the caster's sight, never the viewer's combined visibility or GM view.
 * Verified against Foundry 14.367 Token#isVisible, CanvasVisibility's test
 * configuration, and DetectionMode#testVisibility. No canvas state is changed.
 */
export function commandDemonSightRefusal(source, target) {
  if (!source || !target || source.destroyed || target.destroyed
    || source.document?.parent?.id !== target.document?.parent?.id
    || source.document?.parent?.id !== globalThis.canvas?.scene?.id) {
    return "AZEROTH.CommandDemon.SightUnavailable";
  }
  if (target.document.hidden) return "AZEROTH.CommandDemon.CannotSee";
  const vision = source.vision;
  if (!vision || vision.object !== source || !vision.active) return "AZEROTH.CommandDemon.SightUnavailable";
  const sightType = foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT;
  const config = canvas.visibility._createVisibilityTestConfig(target.document.getVisibilityTestPoints(),
    { tolerance: 0, object: target });
  for (const [id, mode] of Object.entries(source.document.detectionModes ?? {})) {
    const detection = CONFIG.Canvas.detectionModes[id];
    if (!mode.enabled || detection?.type !== sightType) continue;
    if (detection.testVisibility(vision, mode, config) === true) return null;
  }
  return "AZEROTH.CommandDemon.CannotSee";
}
