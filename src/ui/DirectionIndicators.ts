import { MathUtils, PerspectiveCamera } from "three";
import { BODIES, type BodyId, type ViewId } from "../data/bodies";
import { i18n } from "../i18n";
import type { SolarState } from "../astronomy/ephemeris";
import { icon } from "./icons";
import {
  occludedBySphere,
  projectTarget,
  separateIndicators,
} from "./projection";

interface Indicator {
  id: BodyId;
  x: number;
  y: number;
  angle: number;
  side: "left" | "right";
  behind: boolean;
}
interface Rectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}
const intersects = (a: Rectangle, b: Rectangle) =>
  a.x < b.x + b.w + 7 &&
  a.x + a.w + 7 > b.x &&
  a.y < b.y + b.h + 7 &&
  a.y + a.h + 7 > b.y;

export class DirectionIndicators {
  private readonly labels = new Map<BodyId, HTMLButtonElement>();
  private readonly arrows = new Map<BodyId, HTMLButtonElement>();
  private readonly more: HTMLButtonElement;
  private overflow: BodyId[] = [];
  private readonly unsubscribe: () => void;
  private labelsVisible = true;
  private readonly sizes = new Map<string, { width: number; height: number }>();
  private layout = "";

  constructor(
    private readonly layer: HTMLElement,
    private readonly onSelect: (id: BodyId) => void,
    private readonly onMore: (ids: BodyId[]) => void,
  ) {
    for (const body of BODIES) {
      const label = document.createElement("button");
      label.className = "planet-label";
      label.dataset.bodyLabel = body.id;
      label.style.setProperty("--body-color", body.color);
      label.addEventListener("click", () => onSelect(body.id));
      const arrow = document.createElement("button");
      arrow.className = "direction";
      arrow.dataset.direction = body.id;
      arrow.addEventListener("click", () => this.onSelect(body.id));
      this.labels.set(body.id, label);
      this.arrows.set(body.id, arrow);
      layer.append(label, arrow);
    }
    this.more = document.createElement("button");
    this.more.className = "more-destinations";
    this.more.hidden = true;
    this.more.addEventListener("click", () => this.onMore(this.overflow));
    layer.append(this.more);
    this.unsubscribe = i18n.subscribe(() => this.translate());
    this.translate();
  }

  setLabels(visible: boolean): void {
    this.labelsVisible = visible;
  }

  private translate(): void {
    this.sizes.clear();
    for (const { id } of BODIES) {
      const name = i18n.t(`bodies.${id}.name`);
      this.labels.get(id)!.innerHTML =
        '<span class="label-dot"></span><span class="label-name"></span>';
      this.labels.get(id)!.querySelector(".label-name")!.textContent = name;
      this.labels
        .get(id)!
        .setAttribute("aria-label", i18n.t("ui.navigate", { name }));
      const arrow = this.arrows.get(id)!;
      arrow.innerHTML = `${icon("chevron")}<span><span class="direction-name"></span><small></small></span>`;
      arrow.querySelector(".direction-name")!.textContent = name;
      arrow.setAttribute("aria-label", i18n.t("ui.navigate", { name }));
    }
  }

  update(state: SolarState, camera: PerspectiveCamera, selected: ViewId): void {
    const w = this.layer.clientWidth,
      h = this.layer.clientHeight;
    if (!w || !h) return;
    const layout = `${w},${h}`;
    if (layout !== this.layout) {
      this.layout = layout;
      this.sizes.clear();
    }
    const mobile = innerWidth <= 700;
    const safe = {
      left: 20,
      right: w - 20,
      top: mobile ? 160 : 150,
      bottom: h - 65,
    };
    const occupied: Rectangle[] = [];
    if (selected === "overview" && w > 800)
      occupied.push({ x: w - 265, y: 0, w: 265, h: 220 });
    const edges: Indicator[] = [];
    this.overflow = [];
    for (const definition of BODIES) {
      const { id } = definition,
        label = this.labels.get(id)!,
        arrow = this.arrows.get(id)!;
      label.hidden = true;
      arrow.hidden = true;
      if (id === selected) continue;
      const position = state.bodies[id].position;
      const projected = projectTarget(position, camera, w, h, safe);
      const occluded = BODIES.some(
        (other) =>
          other.id !== id &&
          occludedBySphere(
            position,
            camera.position,
            state.bodies[other.id].position,
            other.radius,
          ),
      );
      if (projected.visible && !occluded) {
        if (!this.labelsVisible) continue;
        label.hidden = false;
        const { width, height } = this.measure(`label-${id}`, label);
        const distance = position.distanceTo(camera.position);
        const pixels = Math.min(
          h / 3,
          ((definition.radius / distance) * h) /
            (2 * Math.tan(MathUtils.degToRad(camera.fov / 2))),
        );
        const gap = pixels + 9;
        const candidates = [
          { x: projected.x - width / 2, y: projected.y + gap },
          { x: projected.x - width / 2, y: projected.y - gap - height },
          { x: projected.x + gap, y: projected.y - height / 2 },
          { x: projected.x - gap - width, y: projected.y - height / 2 },
        ].map((p) => ({ ...p, w: width, h: height }));
        const place = candidates.find(
          (p) =>
            p.x >= 0 &&
            p.y >= safe.top - 20 &&
            p.x + width <= w &&
            p.y + height <= safe.bottom + 20 &&
            occupied.every((rect) => !intersects(p, rect)),
        );
        if (place) {
          label.style.transform = `translate(${place.x}px, ${place.y}px)`;
          occupied.push(place);
        } else {
          label.hidden = true;
          this.overflow.push(id);
        }
      } else {
        if (occluded && projected.visible) {
          this.overflow.push(id);
          continue;
        }
        edges.push({ id, ...projected });
      }
    }
    for (const side of ["left", "right"] as const) {
      const { placed, overflow } = separateIndicators(
        edges.filter((edge) => edge.side === side),
        safe.top + 35,
        safe.bottom - 25,
        64,
      );
      this.overflow.push(...overflow.map((item) => item.id));
      for (const item of placed) {
        const arrow = this.arrows.get(item.id)!;
        arrow.hidden = false;
        arrow.dataset.side = side;
        const caption = arrow.querySelector("small")!;
        const text = i18n.t(item.behind ? "ui.behind" : "ui.offscreen");
        if (caption.textContent !== text) caption.textContent = text;
        const x =
          side === "left"
            ? 0
            : w - this.measure(`arrow-${item.id}-${item.behind}`, arrow).width;
        arrow.style.transform = `translate(${x}px, ${item.y - 26}px)`;
        arrow.querySelector("svg")!.style.transform =
          `rotate(${item.angle}rad)`;
      }
    }
    this.more.hidden = this.overflow.length === 0;
    const moreText = `${i18n.t("ui.more")} · ${this.overflow.length}`;
    if (this.more.textContent !== moreText) this.more.textContent = moreText;
  }

  private measure(
    key: string,
    element: HTMLElement,
  ): { width: number; height: number } {
    let size = this.sizes.get(key);
    if (!size) {
      size = { width: element.offsetWidth, height: element.offsetHeight };
      this.sizes.set(key, size);
    }
    return size;
  }

  dispose(): void {
    this.unsubscribe();
    this.layer.replaceChildren();
  }
}
