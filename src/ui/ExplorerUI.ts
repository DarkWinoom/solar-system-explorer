import {
  BODIES,
  BODY_BY_ID,
  isBodyId,
  type BodyId,
  type ViewId,
} from "../data/bodies";
import { AU_KM, type SolarState } from "../astronomy/ephemeris";
import { i18n } from "../i18n";
import { sunTimes, type ObserverContext } from "../geo/observer";
import type { AudioState } from "../audio/AmbientAudio";
import { VolumeSlider } from "./VolumeSlider";
import { icon } from "./icons";

interface UIOptions {
  observer: ObserverContext;
  onSelect: (view: ViewId) => void;
  onOrbits: (visible: boolean) => void;
  onLabels: (visible: boolean) => void;
  onAudio: () => void;
  onVolume: (volume: number) => void;
}

export class ExplorerUI {
  readonly element = document.createElement("div");
  readonly viewport: HTMLElement;
  readonly labels: HTMLElement;
  private selected: ViewId = "overview";
  private cardOpen = false;
  private readonly events = new AbortController();
  private readonly unsubscribe: () => void;
  private readonly slider: VolumeSlider;
  private lastSecond = -1;
  private lastSunDay = "";
  private currentState?: SolarState;
  private audioState: AudioState = {
    enabled: false,
    playing: false,
    loading: false,
    error: false,
    volume: 0.25,
  };
  private activePopover: string | null = null;
  private popoverTrigger?: HTMLButtonElement;

  constructor(private readonly options: UIOptions) {
    this.element.id = "explorer";
    this.element.innerHTML = `
      <header class="topbar">
        <button class="brand" data-view="overview" aria-label="ORBITAL"><span class="brand-orbit">${icon("orbit")}</span><span>ORBITAL<small data-i18n="app.title"></small></span></button>
        <span class="header-status"><span class="live-dot"></span><span data-i18n="ui.live"></span></span>
        <div class="tools">
          <button class="tool toggle" data-action="orbits" aria-pressed="true">${icon("orbit")}<span data-i18n="ui.orbits"></span></button>
          <button class="tool toggle labels-tool" data-action="labels" aria-pressed="true">${icon("focus")}<span data-i18n="ui.labels"></span></button>
          <div class="popover-wrap"><button class="tool" id="audio-trigger" data-popover="audio-menu" aria-expanded="false" aria-controls="audio-menu">${icon("muted")}<span data-i18n="ui.audio"></span></button>
            <section class="popover audio-menu" id="audio-menu" hidden>
              <p class="eyebrow" data-i18n="ui.audio"></p>
              <button class="play-button" data-action="audio">${icon("sound")}<span></span></button>
              <div class="volume-heading"><span data-i18n="ui.volume"></span><output id="volume-value">25%</output></div><div id="slider-slot"></div>
              <p id="audio-hint" role="status"></p><a class="credit" href="https://opengameart.org/content/galactic-temple" target="_blank" rel="noreferrer" data-i18n="ui.soundCredit"></a>
            </section>
          </div>
          <div class="popover-wrap"><button class="tool language-tool" id="language-trigger" data-popover="language-menu" aria-haspopup="menu" aria-controls="language-menu" aria-expanded="false">${icon("globe")}<span id="language-label"></span>${icon("down")}</button><div class="popover language-menu" id="language-menu" role="menu" hidden></div></div>
          <div class="popover-wrap"><button class="tool help-tool" id="help-trigger" data-popover="help-menu" aria-expanded="false" aria-controls="help-menu">${icon("info")}</button><section class="popover help-menu" id="help-menu" hidden><p class="eyebrow" data-i18n="ui.help"></p><p data-i18n="ui.model"></p><p data-i18n="ui.precision"></p><p data-i18n="ui.unitsNote"></p><p data-i18n="ui.controls"></p></section></div>
        </div>
      </header>
      <nav class="navigation"><p class="eyebrow nav-caption" data-i18n="ui.destinations"></p><button class="nav-overview active" data-view="overview" aria-pressed="true">${icon("orbit")}<span data-i18n="ui.overview"></span>${icon("arrow")}</button><div class="nav-divider"></div><div id="body-list"></div><p class="nav-note"><span>+</span><span data-i18n="app.tagline"></span></p></nav>
      <main class="stage" id="stage">
        <div class="scene-heading"><p class="eyebrow" id="scene-kicker"></p><h1 id="scene-title"></h1><p id="scene-description"></p></div>
        <section class="system-summary" id="system-summary"><p class="eyebrow" data-i18n="ui.neighbors"></p><div class="counts"><div><strong>08</strong><span data-i18n="ui.planets"></span></div><div><strong>01</strong><span data-i18n="ui.star"></span></div><div><strong>01</strong><span data-i18n="ui.moonCount"></span></div></div><p data-i18n="ui.choose"></p></section>
        <div id="viewport" class="viewport"></div><div id="labels" class="label-layer"></div>
        <div class="scene-foot">${icon("focus")}<span data-i18n="ui.select"></span></div>
        <button class="reopen" id="reopen" data-action="details" hidden><span data-i18n="ui.details"></span>${icon("arrow")}</button>
        <div class="loading-state" id="loading-state" role="status"><span class="loader-orbit"></span><span data-i18n="ui.loading"></span></div>
        <div class="scene-message" id="scene-message" role="status" hidden></div>
        <section class="popover more-menu" id="more-menu" role="menu" hidden></section>
      </main>
      <aside class="body-card" id="body-card" aria-labelledby="card-title" hidden><div class="card-top"><span class="eyebrow" data-i18n="ui.profile"></span><button class="close" id="close-card" data-action="close">${icon("close")}</button></div><div id="card-content"></div><a class="source" id="card-source" target="_blank" rel="noreferrer"><span data-i18n="ui.source"></span>${icon("arrow")}</a><button class="back-overview" data-view="overview">${icon("orbit")}<span data-i18n="ui.back"></span>${icon("arrow")}</button></aside>
      <footer class="statusbar"><div class="time"><span class="live-dot"></span><div><span class="eyebrow" data-i18n="ui.localTime"></span><div class="clock-row"><time id="local-time"></time><span id="timezone"></span></div></div></div><p class="interaction-help" data-i18n="ui.controls"></p><button class="scale-note" data-action="help">${icon("info")}<span data-i18n="ui.scale"></span></button></footer>
      <span class="sr-only" id="selection-announcement" role="status" aria-live="polite"></span>`;
    this.viewport = this.find("viewport");
    this.labels = this.find("labels");
    this.slider = new VolumeSlider(options.onVolume);
    this.find("slider-slot").append(this.slider.element);
    const signal = this.events.signal;
    this.element.addEventListener("click", this.click, { signal });
    this.element.addEventListener("keydown", this.keydown, { signal });
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          this.activePopover &&
          event.target instanceof Element &&
          !event.target.closest(".popover-wrap, .more-menu, .more-destinations")
        )
          this.closePopover(false);
      },
      { signal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (this.activePopover) this.closePopover();
        else if (this.cardOpen) this.closeCard();
      },
      { signal },
    );
    this.unsubscribe = i18n.subscribe(() => this.translate());
    this.translate();
  }

  private find<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.element.querySelector<T>(`#${id}`)!;
  }

  private translate(): void {
    this.element
      .querySelectorAll<HTMLElement>("[data-i18n]")
      .forEach((element) => {
        element.textContent = i18n.t(element.dataset.i18n!);
      });
    document.title = `ORBITAL · ${i18n.t("app.title")}`;
    this.element
      .querySelector("nav")!
      .setAttribute("aria-label", i18n.t("ui.destinations"));
    this.find("language-trigger").setAttribute(
      "aria-label",
      i18n.t("ui.language"),
    );
    this.find("audio-trigger").setAttribute("aria-label", i18n.t("ui.audio"));
    this.find("help-trigger").setAttribute("aria-label", i18n.t("ui.help"));
    this.find("close-card").setAttribute("aria-label", i18n.t("ui.close"));
    this.viewport
      .querySelector("canvas")
      ?.setAttribute("aria-label", i18n.t("ui.canvas"));
    this.element
      .querySelector('[data-action="orbits"]')!
      .setAttribute("aria-label", i18n.t("ui.orbits"));
    this.element
      .querySelector('[data-action="labels"]')!
      .setAttribute("aria-label", i18n.t("ui.labels"));
    this.find("language-label").textContent = i18n.getLocaleMetadata(
      i18n.getLocale(),
    ).label;
    this.find("body-list").innerHTML = BODIES.map(
      (body) =>
        `<button class="body-option${this.selected === body.id ? " active" : ""}" data-view="${body.id}" aria-pressed="${this.selected === body.id}" style="--body-color:${body.color}"><span class="mini"></span><span data-name="${body.id}"></span><span class="body-number">${body.order}</span></button>`,
    ).join("");
    this.element
      .querySelectorAll<HTMLElement>("[data-name]")
      .forEach((element) => {
        element.textContent = i18n.t(`bodies.${element.dataset.name}.name`);
      });
    const menu = this.find("language-menu");
    menu.replaceChildren();
    for (const code of ["system", ...i18n.getAvailableLocales()]) {
      const button = document.createElement("button");
      button.className = "menu-option";
      button.dataset.locale = code;
      button.setAttribute("role", "menuitemradio");
      button.tabIndex = -1;
      const checked =
        code === "system"
          ? i18n.isFollowingSystem()
          : !i18n.isFollowingSystem() && code === i18n.getLocale();
      button.setAttribute("aria-checked", String(checked));
      const label = document.createElement("span");
      label.textContent =
        code === "system"
          ? i18n.t("ui.systemLanguage")
          : i18n.getLocaleMetadata(code).label;
      button.append(label);
      if (checked) button.insertAdjacentHTML("beforeend", icon("check"));
      menu.append(button);
    }
    this.slider.setLabel(i18n.t("ui.volume"));
    this.updateAudio(this.audioState);
    this.updateSelection();
    this.lastSecond = -1;
    this.lastSunDay = "";
    if (this.currentState) this.update(this.currentState);
  }

  setSelection(view: ViewId): void {
    this.selected = view;
    this.cardOpen = view !== "overview";
    this.closePopover(false);
    this.find("body-card").hidden = !this.cardOpen;
    this.element.classList.toggle("card-open", this.cardOpen);
    this.find("reopen").hidden = true;
    this.find("body-card").scrollTop = 0;
    this.lastSunDay = "";
    this.lastSecond = -1;
    this.updateSelection();
    this.find("selection-announcement").textContent =
      view === "overview"
        ? i18n.t("ui.overview")
        : i18n.t(`bodies.${view}.name`);
    if (this.currentState) this.update(this.currentState);
  }

  private updateSelection(): void {
    const overview = this.selected === "overview";
    this.element
      .querySelectorAll<HTMLButtonElement>("[data-view]")
      .forEach((button) => {
        const selected = button.dataset.view === this.selected;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    this.find("system-summary").hidden = !overview;
    this.find("scene-kicker").textContent = overview
      ? i18n.t("ui.overviewKicker")
      : `${i18n.t("ui.destination")} / ${BODY_BY_ID[this.selected as BodyId].order}`;
    this.find("scene-title").textContent = overview
      ? i18n.t("app.heading")
      : i18n.t(`bodies.${this.selected}.name`);
    this.find("scene-description").textContent = i18n.t(
      overview ? "app.intro" : "app.destination",
    );
    if (!overview) this.renderCard(this.selected as BodyId);
  }

  private number(value: number, digits = 0): string {
    return new Intl.NumberFormat(i18n.getLocale(), {
      maximumFractionDigits: digits,
    }).format(value);
  }

  private renderCard(id: BodyId): void {
    const body = BODY_BY_ID[id];
    const row = (key: string, value: string, unit: string, rowId = "") =>
      `<div class="fact-row"><dt>${i18n.t(key)}</dt><dd${rowId ? ` id="${rowId}"` : ""}>${value}<small>${unit}</small></dd></div>`;
    const orbit =
      body.orbitalDays === null
        ? i18n.t("ui.notApplicable")
        : this.number(
            body.orbitalDays < 1000
              ? body.orbitalDays
              : body.orbitalDays / 365.25,
            2,
          );
    const orbitUnit =
      body.orbitalDays === null
        ? ""
        : i18n.t(body.orbitalDays < 1000 ? "units.days" : "units.years");
    const days = Math.abs(body.rotationDays);
    const minutes = Math.round(days * 1440);
    const spin =
      days < 2
        ? `${this.number(Math.floor(minutes / 60))}${i18n.t("units.hours")} ${this.number(minutes % 60)}${i18n.t("units.minutes")}`
        : this.number(days, 2);
    const spinUnit = days < 2 ? "" : i18n.t("units.days");
    const extra =
      body.category === "gasGiant" || body.category === "iceGiant"
        ? "ui.giantNote"
        : id === "sun"
          ? "ui.sunNote"
          : id === "moon"
            ? "ui.moonNote"
            : "ui.factsNote";
    this.find("card-content").innerHTML =
      `<p class="card-index">${body.order} / <span id="card-category"></span></p><h2 id="card-title"></h2><p class="card-description" id="card-description"></p><dl class="facts">
      ${row(id === "sun" ? "facts.approxDiameter" : "facts.diameter", this.number(body.diameterKm), i18n.t("units.km"))}
      ${row(id === "moon" ? "facts.lunarOrbit" : "facts.orbitalPeriod", orbit, orbitUnit)}
      ${row(id === "sun" ? "facts.equatorialRotation" : "facts.rotation", spin, spinUnit)}
      ${body.rotationDays < 0 ? `<p class="rotation-note">${i18n.t("ui.retrograde")}</p>` : ""}
      ${id === "sun" ? "" : row(id === "moon" ? "facts.earthDistance" : "facts.sunDistance", "—", "", "live-distance")}
      </dl><p class="fact-note">${i18n.t(extra)}</p>${id === "earth" ? `<section class="earth-details"><h3>${i18n.t("ui.observingEarth")}</h3><p>${i18n.t(this.options.observer.approximate ? "ui.approximate" : "ui.manualLocation")}</p><p id="observer-zone"></p><dl>${row("ui.sunrise", "—", "", "sunrise")}${row("ui.sunset", "—", "", "sunset")}${row("ui.moonPhase", "—", "", "moon-phase")}</dl></section>` : ""}`;
    this.find("card-category").textContent = i18n.t(
      `categories.${body.category}`,
    );
    this.find("card-title").textContent = i18n.t(`bodies.${id}.name`);
    this.find("card-description").textContent = i18n.t(
      `bodies.${id}.description`,
    );
    this.find<HTMLAnchorElement>("card-source").href = body.source;
    if (id === "earth")
      this.find("observer-zone").textContent = this.options.observer.timeZone;
  }

  update(state: SolarState): void {
    this.currentState = state;
    const second = Math.floor(state.instant / 1000);
    if (second === this.lastSecond) return;
    this.lastSecond = second;
    const date = new Date(state.instant),
      timeZone = this.options.observer.timeZone;
    const clock = this.find<HTMLTimeElement>("local-time");
    clock.dateTime = date.toISOString();
    clock.textContent = new Intl.DateTimeFormat(i18n.getLocale(), {
      timeZone,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(date);
    this.find("timezone").textContent = timeZone;
    if (this.selected !== "overview" && this.selected !== "sun") {
      const body = state.bodies[this.selected];
      const moon = this.selected === "moon";
      const value = moon
        ? body.positionAU.distanceTo(state.bodies.earth.positionAU) * AU_KM
        : body.positionAU.length();
      const distance = this.find("live-distance");
      if (distance)
        distance.textContent = `${this.number(value, moon ? 0 : 3)} ${i18n.t(moon ? "units.km" : "units.au")}`;
    }
    if (this.selected === "earth") {
      this.find("moon-phase").textContent = new Intl.NumberFormat(
        i18n.getLocale(),
        { style: "percent", maximumFractionDigits: 1 },
      ).format(state.moonIllumination);
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
      if (day !== this.lastSunDay) {
        this.lastSunDay = day;
        const times = sunTimes(date, this.options.observer);
        const format = (value: Date | null) =>
          value
            ? new Intl.DateTimeFormat(i18n.getLocale(), {
                timeZone,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              }).format(value)
            : i18n.t("ui.noEvent");
        this.find("sunrise").textContent = format(times.sunrise);
        this.find("sunset").textContent = format(times.sunset);
      }
    }
  }

  updateAudio(state: AudioState): void {
    this.audioState = state;
    this.slider.setValue(state.volume);
    this.find("volume-value").textContent =
      `${Math.round(state.volume * 100)}%`;
    const play = this.element.querySelector<HTMLButtonElement>(".play-button")!;
    play.querySelector("span")!.textContent = i18n.t(
      state.enabled && state.volume > 0 ? "ui.mute" : "ui.play",
    );
    play.setAttribute(
      "aria-pressed",
      String(state.enabled && state.volume > 0),
    );
    const trigger = this.find("audio-trigger");
    trigger.querySelector("svg")!.outerHTML = icon(
      state.playing ? "sound" : "muted",
    );
    trigger.classList.toggle("is-playing", state.playing);
    this.find("audio-hint").textContent = i18n.t(
      state.error
        ? "ui.audioError"
        : state.loading
          ? "ui.audioLoading"
          : "ui.audioHint",
    );
  }

  showMore(ids: BodyId[]): void {
    const menu = this.find("more-menu");
    menu.replaceChildren();
    for (const id of ids) {
      const button = document.createElement("button");
      button.className = "menu-option";
      button.dataset.view = id;
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      button.textContent = i18n.t(`bodies.${id}.name`);
      menu.append(button);
    }
    this.openPopover(
      "more-menu",
      this.labels.querySelector<HTMLButtonElement>(".more-destinations")!,
    );
  }

  ready(): void {
    this.find("loading-state").hidden = true;
    this.viewport.dataset.ready = "true";
    this.translate();
  }
  message(key: string, fatal = false): void {
    const element = this.find("scene-message");
    element.hidden = false;
    element.replaceChildren();
    const description = document.createElement("span");
    description.dataset.i18n = key;
    description.textContent = i18n.t(key);
    element.append(description);
    if (fatal) {
      this.find("loading-state").hidden = true;
      element.classList.add("fatal");
      const button = document.createElement("button");
      button.className = "reload";
      button.dataset.i18n = "ui.reload";
      button.textContent = i18n.t("ui.reload");
      button.addEventListener("click", () => location.reload());
      element.append(button);
    }
  }

  private closeCard(): void {
    this.cardOpen = false;
    this.find("body-card").hidden = true;
    this.element.classList.remove("card-open");
    this.find("reopen").hidden = false;
    this.find("reopen").focus({ preventScroll: true });
    this.find("selection-announcement").textContent = i18n.t("ui.dismissed");
  }

  private click = (event: MouseEvent): void => {
    const target = (event.target as Element).closest<HTMLButtonElement>(
      "button",
    );
    if (!target) return;
    if (
      target.dataset.view &&
      (target.dataset.view === "overview" || isBodyId(target.dataset.view))
    ) {
      this.options.onSelect(target.dataset.view);
      return;
    }
    if (target.dataset.locale) {
      const url = new URL(location.href);
      url.searchParams.delete("lan");
      history.replaceState(null, "", url);
      if (target.dataset.locale === "system") i18n.followSystem();
      else i18n.setLocale(target.dataset.locale);
      this.closePopover();
      return;
    }
    if (target.dataset.popover) {
      if (this.activePopover === target.dataset.popover) this.closePopover();
      else this.openPopover(target.dataset.popover, target);
      return;
    }
    switch (target.dataset.action) {
      case "orbits":
      case "labels": {
        const enabled = target.getAttribute("aria-pressed") !== "true";
        target.setAttribute("aria-pressed", String(enabled));
        if (target.dataset.action === "orbits") this.options.onOrbits(enabled);
        else this.options.onLabels(enabled);
        break;
      }
      case "audio":
        this.options.onAudio();
        break;
      case "close":
        this.closeCard();
        break;
      case "details":
        this.cardOpen = true;
        this.find("body-card").hidden = false;
        this.find("body-card").scrollTop = 0;
        this.element.classList.add("card-open");
        this.find("reopen").hidden = true;
        this.find("close-card").focus({ preventScroll: true });
        break;
      case "help":
        this.openPopover(
          "help-menu",
          this.find<HTMLButtonElement>("help-trigger"),
        );
        break;
    }
  };

  private openPopover(id: string, trigger: HTMLButtonElement): void {
    this.closePopover(false);
    this.activePopover = id;
    this.popoverTrigger = trigger;
    this.find(id).hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    this.find(id)
      .querySelector<HTMLElement>(
        '[role="menuitemradio"], [role="menuitem"], button',
      )
      ?.focus({ preventScroll: true });
  }
  private closePopover(restoreFocus = true): void {
    if (!this.activePopover) return;
    this.find(this.activePopover).hidden = true;
    this.popoverTrigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.popoverTrigger?.focus({ preventScroll: true });
    this.activePopover = null;
  }
  private keydown = (event: KeyboardEvent): void => {
    if (!this.activePopover) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.closePopover();
      return;
    }
    const menu = this.find(this.activePopover);
    const items = [
      ...menu.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"], [role="menuitem"]',
      ),
    ];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next: Record<string, number> = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in next) {
      event.preventDefault();
      items[next[event.key]].focus();
    }
    if (event.key === "Tab") this.closePopover(false);
  };

  dispose(): void {
    this.events.abort();
    this.unsubscribe();
    this.slider.dispose();
    this.element.remove();
  }
}
