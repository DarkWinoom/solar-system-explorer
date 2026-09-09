import { PerspectiveCamera, Vector3 } from "three";

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface ProjectedTarget {
  visible: boolean;
  behind: boolean;
  x: number;
  y: number;
  angle: number;
  side: "left" | "right";
}

export function projectTarget(
  position: Vector3,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  safe: Bounds,
): ProjectedTarget {
  const local = position.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = position.clone().project(camera);
  const behind = local.z >= 0;
  const x = ((projected.x + 1) * width) / 2;
  const y = ((1 - projected.y) * height) / 2;
  const visible =
    !behind &&
    projected.z >= -1 &&
    projected.z <= 1 &&
    x >= safe.left &&
    x <= safe.right &&
    y >= safe.top &&
    y <= safe.bottom;
  let dx = behind ? local.x : x - width / 2;
  const dy = behind ? -local.y : y - height / 2;
  if (Math.abs(dx) < 1e-8) dx = 1e-8;
  const side = dx < 0 ? "left" : "right";
  const edgeX = side === "left" ? safe.left : safe.right;
  const edgeY = Math.max(
    safe.top,
    Math.min(
      safe.bottom,
      height / 2 + (dy * Math.abs(edgeX - width / 2)) / Math.abs(dx),
    ),
  );
  return {
    visible,
    behind,
    x: visible ? x : edgeX,
    y: visible ? y : edgeY,
    angle: Math.atan2(dy, dx),
    side,
  };
}

export function separateIndicators<T extends { y: number }>(
  items: T[],
  top: number,
  bottom: number,
  gap = 60,
): { placed: T[]; overflow: T[] } {
  const capacity = Math.max(0, Math.floor((bottom - top) / gap) + 1);
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const placed = sorted.slice(0, capacity).map((item) => ({ ...item }));
  let previous = top - gap;
  for (const item of placed) {
    item.y = Math.max(item.y, previous + gap, top);
    previous = item.y;
  }
  for (let i = placed.length - 1; i >= 0; i--)
    placed[i].y = Math.min(placed[i].y, bottom - (placed.length - 1 - i) * gap);
  return { placed, overflow: sorted.slice(capacity) };
}

export function occludedBySphere(
  target: Vector3,
  camera: Vector3,
  center: Vector3,
  radius: number,
): boolean {
  const toTarget = target.clone().sub(camera);
  const distance = toTarget.length();
  const direction = toTarget.divideScalar(distance);
  const toCenter = center.clone().sub(camera);
  const along = toCenter.dot(direction);
  return (
    along > 0 &&
    along < distance &&
    toCenter.lengthSq() - along * along < radius * radius
  );
}
