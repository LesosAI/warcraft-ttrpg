import { pickPoint } from "../canvas/place.mjs";
import { feetToPoint } from "../canvas/footprints.mjs";
import { IMAGE_PROJECTION as SPEC } from "../rules/image-projection.mjs";

/** Review all five snapped footprints before the caller pays for the ability. */
export async function reviewImageProjectionPlacement({ actor, scene, sourceToken, prototype, chooseOption }) {
  const elevation = sourceToken.elevation ?? 0;
  const anchor = { x: sourceToken.x, y: sourceToken.y };
  const cellW = scene.grid.sizeX ?? scene.grid.size, cellH = scene.grid.sizeY ?? scene.grid.size;
  const width = (prototype.width ?? 1) * cellW, height = (prototype.height ?? 1) * cellH;
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) return null;
  const selected = [];
  const sourceValid = () => globalThis.canvas?.scene === scene && sourceToken.actor === actor
    && scene.tokens.get(sourceToken.id) === sourceToken && (sourceToken.elevation ?? 0) === elevation
    && sourceToken.x === anchor.x && sourceToken.y === anchor.y;
  const snapped = point => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
    const raw = { x: point.x - width / 2, y: point.y - height / 2 };
    try { return scene.grid.getSnappedPoint(raw, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER }); }
    catch { return raw; }
  };
  const overlaps = (at, other) => at.x < other.x + other.width && at.x + width > other.x
    && at.y < other.y + other.height && at.y + height > other.y;
  const validAt = (at, others) => {
    if (!sourceValid() || !Number.isFinite(at?.x) || !Number.isFinite(at?.y)) return false;
    const feet = feetToPoint(sourceToken, { x: at.x + width / 2, y: at.y + height / 2 });
    if (!Number.isFinite(feet) || feet < 0 || feet > SPEC.feet) return false;
    const board = scene.dimensions?.rect;
    if (board && (at.x < board.x || at.y < board.y || at.x + width > board.x + board.width || at.y + height > board.y + board.height)) return false;
    if ([...scene.tokens.values()].some(t => Math.abs((t.elevation ?? 0) - elevation) < 1
      && overlaps(at, { x: t.x, y: t.y, width: (t.width ?? 1) * cellW, height: (t.height ?? 1) * cellH }))) return false;
    return !others.some(other => overlaps(at, { ...other, width, height }));
  };
  const valid = () => selected.length === SPEC.count && selected.every((at, i) => validAt(at, selected.filter((_, j) => j !== i)));
  if (!sourceValid()) return null;
  for (let i = 0; i < SPEC.count; i++) {
    const point = await pickPoint({ sceneId: scene.id,
      hint: `Image Projection: choose empty space ${i + 1} of ${SPEC.count} within ${SPEC.feet} feet. Escape cancels the summon.`,
      accept: p => validAt(snapped(p), selected) });
    if (!point) return null;
    const at = snapped(point);
    if (!validAt(at, selected)) return null;
    selected.push(Object.freeze({ x: at.x, y: at.y, elevation }));
  }
  if (!valid()) return null;
  const choice = await chooseOption({ name: SPEC.name, actor, img: actor.img }, [{ key: "summon", name: "Summon five projections",
    description: "Spend an Action, 4 Mana and your use for this Short Rest. At the start of your next turn, each surviving projection restores 4 Health, then all five disappear." }], null);
  if (choice?.key !== "summon" || !valid()) return null;
  return { positions: Object.freeze([...selected]), valid };
}
