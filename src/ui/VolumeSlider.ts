export class VolumeSlider {
  readonly element = document.createElement("div");
  private readonly events = new AbortController();
  private value = 0.25;
  private dragging = false;

  constructor(private readonly onChange: (value: number) => void) {
    const element = this.element;
    element.className = "volume-slider";
    element.tabIndex = 0;
    element.setAttribute("role", "slider");
    element.setAttribute("aria-valuemin", "0");
    element.setAttribute("aria-valuemax", "100");
    element.innerHTML =
      '<span class="slider-track"><span class="slider-fill"></span><span class="slider-thumb"></span></span>';
    const signal = this.events.signal;
    element.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        this.dragging = true;
        element.setPointerCapture(event.pointerId);
        element.focus();
        this.fromPointer(event);
      },
      { signal },
    );
    element.addEventListener(
      "pointermove",
      (event) => {
        if (this.dragging) this.fromPointer(event);
      },
      { signal },
    );
    element.addEventListener(
      "pointerup",
      () => {
        this.dragging = false;
      },
      { signal },
    );
    element.addEventListener(
      "pointercancel",
      () => {
        this.dragging = false;
      },
      { signal },
    );
    element.addEventListener(
      "keydown",
      (event) => {
        const values: Record<string, number> = {
          ArrowRight: this.value + 0.05,
          ArrowUp: this.value + 0.05,
          ArrowLeft: this.value - 0.05,
          ArrowDown: this.value - 0.05,
          Home: 0,
          End: 1,
          PageUp: this.value + 0.1,
          PageDown: this.value - 0.1,
        };
        if (!(event.key in values)) return;
        event.preventDefault();
        this.change(values[event.key]);
      },
      { signal },
    );
    this.setValue(this.value);
  }
  setLabel(label: string): void {
    this.element.setAttribute("aria-label", label);
  }
  setValue(value: number): void {
    this.value = Math.max(0, Math.min(1, value));
    const percentage = Math.round(this.value * 100);
    this.element.style.setProperty("--volume", `${percentage}%`);
    this.element.setAttribute("aria-valuenow", String(percentage));
    this.element.setAttribute("aria-valuetext", `${percentage}%`);
  }
  private change(value: number): void {
    this.setValue(value);
    this.onChange(this.value);
  }
  private fromPointer(event: PointerEvent): void {
    const bounds = this.element.getBoundingClientRect();
    this.change((event.clientX - bounds.left - 10) / (bounds.width - 20));
  }
  dispose(): void {
    this.events.abort();
  }
}
