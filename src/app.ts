import { buildLocale } from "./i18n/buildLocale";
import { i18n } from "./i18n";
import { observerContext } from "./geo/observer";
import { solarState } from "./astronomy/ephemeris";
import { ExplorerUI } from "./ui/ExplorerUI";
import { DirectionIndicators } from "./ui/DirectionIndicators";
import { AmbientAudio } from "./audio/AmbientAudio";
import type { SolarSystemScene } from "./scene/SolarSystemScene";
import type { ViewId } from "./data/bodies";

export async function initApp(): Promise<() => void> {
  const root = document.getElementById("app")!;
  buildLocale();
  let scene: SolarSystemScene | undefined;
  let selected: ViewId = "overview";
  let showOrbits = true;
  const observer = observerContext();
  const ui = new ExplorerUI({
    observer,
    onSelect: (view) => {
      selected = view;
      ui.setSelection(view);
      scene?.select(view);
    },
    onOrbits: (visible) => {
      showOrbits = visible;
      scene?.setOrbits(visible);
    },
    onLabels: (visible) => directions.setLabels(visible),
    onAudio: () => {
      void audio.toggle();
    },
    onVolume: (volume) => audio.setVolume(volume),
  });
  root.replaceChildren(ui.element);
  const directions = new DirectionIndicators(
    ui.labels,
    (id) => {
      selected = id;
      ui.setSelection(id);
      scene?.select(id);
    },
    (ids) => ui.showMore(ids),
  );
  const audio = new AmbientAudio((state) => ui.updateAudio(state));
  ui.updateAudio(audio.state);
  ui.update(solarState(new Date()));
  const languageChanged = () => i18n.refreshSystem();
  window.addEventListener("languagechange", languageChanged);
  try {
    const { SolarSystemScene } = await import("./scene/SolarSystemScene");
    scene = new SolarSystemScene({
      container: ui.viewport,
      location: observer,
      onSelect: (id) => {
        selected = id;
        ui.setSelection(id);
        scene?.select(id);
      },
      onFrame: (state, camera) => {
        ui.update(state);
        directions.update(state, camera, selected);
      },
      onTextureError: () => ui.message("ui.textureError"),
      onContextLost: () => ui.message("ui.contextLost", true),
    });
    await scene.start();
    ui.ready();
    scene.setOrbits(showOrbits);
    if (selected !== "overview") scene.select(selected);
  } catch (error) {
    console.error("[orbital]", error);
    scene?.dispose();
    ui.message("ui.webglError", true);
  }
  return () => {
    window.removeEventListener("languagechange", languageChanged);
    scene?.dispose();
    directions.dispose();
    audio.dispose();
    ui.dispose();
  };
}
