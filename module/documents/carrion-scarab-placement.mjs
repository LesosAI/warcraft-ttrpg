import { pickPoint } from "../canvas/place.mjs";
import { feetToPoint } from "../canvas/footprints.mjs";
import { CARRION_SCARAB as SPEC } from "../rules/carrion-scarab.mjs";

/** Review the final snapped footprint, not merely the clicked pixel. The
 * source must stay on the viewed scene at the same elevation throughout. */
export async function reviewScarabPlacement({ actor, scene, sourceToken, prototype, chooseOption }) {
  const elevation = sourceToken.elevation ?? 0;
  const width = prototype.width ?? 1, height = prototype.height ?? 1;
  const cellW = scene.grid.sizeX ?? scene.grid.size, cellH = scene.grid.sizeY ?? scene.grid.size;
  const size = { width: width * cellW, height: height * cellH };
  const sourceValid = () => globalThis.canvas?.scene === scene && sourceToken.actor === actor
    && scene.tokens.get(sourceToken.id) === sourceToken && sourceToken.elevation === elevation;
  const position = point => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
    const raw = { x: point.x - size.width / 2, y: point.y - size.height / 2 };
    try { return scene.grid.getSnappedPoint(raw, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER }); }
    catch { return raw; }
  };
  const validAt = at => {
    if (!sourceValid() || !at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return false;
    const feet = feetToPoint(sourceToken, { x: at.x + size.width / 2, y: at.y + size.height / 2 });
    if (!Number.isFinite(feet) || feet > SPEC.within || feet < 0) return false;
    const board = scene.dimensions?.rect;
    if (board && (at.x < board.x || at.y < board.y || at.x + size.width > board.x + board.width || at.y + size.height > board.y + board.height)) return false;
    return ![...scene.tokens].some(t => Math.abs((t.elevation ?? 0) - elevation) < 1
      && at.x < t.x + (t.width ?? 1) * cellW && at.x + size.width > t.x
      && at.y < t.y + (t.height ?? 1) * cellH && at.y + size.height > t.y);
  };
  if (!sourceValid()) return null;
  const point = await pickPoint({ sceneId: scene.id,
    hint: "Carrion Scarab: choose an empty space within 5 feet. Escape cancels.", accept: p => validAt(position(p)) });
  if (!point) return null;
  const at = position(point);
  if (!validAt(at)) return null;
  const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img },
    [{ key: "plant", name: "Summon Carrion Scarab", description: "Spend an Action and one of your three uses for this Short Rest. The scarab lasts one minute, until destroyed, or until its summoner dies." }], null);
  if (choice?.key !== "plant" || !validAt(at)) return null;
  const frozen = Object.freeze({ x: Math.round(at.x), y: Math.round(at.y), elevation });
  return { ...frozen, valid: () => validAt(frozen) };
}
