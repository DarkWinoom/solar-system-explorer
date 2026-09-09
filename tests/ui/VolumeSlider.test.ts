import { describe, expect, it, vi } from "vitest";
import { VolumeSlider } from "../../src/ui/VolumeSlider";

describe("custom volume control", () => {
  it("supports keyboard changes with accessible values", () => {
    const onChange = vi.fn(),
      slider = new VolumeSlider(onChange);
    slider.setLabel("Volume");
    slider.setValue(0.25);
    const key = (key: string) =>
      slider.element.dispatchEvent(
        new KeyboardEvent("keydown", { key, cancelable: true }),
      );
    key("ArrowRight");
    expect(onChange).toHaveBeenLastCalledWith(0.3);
    key("Home");
    expect(slider.element.getAttribute("aria-valuenow")).toBe("0");
    key("End");
    expect(onChange).toHaveBeenLastCalledWith(1);
    key("ArrowUp");
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(slider.element.getAttribute("aria-label")).toBe("Volume");
    expect(slider.element.getAttribute("role")).toBe("slider");
    expect(slider.element.querySelector("input")).toBeNull();
    slider.dispose();
  });
  it("does not trigger callbacks when synchronizing external state", () => {
    const changed = vi.fn(),
      slider = new VolumeSlider(changed);
    slider.setValue(0.8);
    expect(changed).not.toHaveBeenCalled();
    expect(slider.element.getAttribute("aria-valuetext")).toBe("80%");
    slider.dispose();
  });
});
