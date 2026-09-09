import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmbientAudio } from "../../src/audio/AmbientAudio";

class FakeAudio {
  static instances: FakeAudio[] = [];
  paused = true;
  src = "";
  loop = false;
  preload = "";
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  removeAttribute = vi.fn();
  canPlayType = () => "probably";
  constructor() {
    FakeAudio.instances.push(this);
  }
}
class FakeContext {
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  suspend = vi.fn(async () => {});
  close = vi.fn(async () => {});
  gain = { gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn() };
  createGain = () => this.gain;
  createMediaElementSource = () => ({ connect: () => this.gain });
}
let player: AmbientAudio;
beforeEach(() => {
  localStorage.clear();
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", FakeContext);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  player = new AmbientAudio(vi.fn());
});
afterEach(() => {
  player.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ambient audio", () => {
  it("does not fetch or play music until explicitly enabled", () => {
    expect(FakeAudio.instances[0].src).toBe("");
    expect(FakeAudio.instances[0].play).not.toHaveBeenCalled();
    expect(player.state.playing).toBe(false);
  });
  it("plays on request and mutes without losing the volume", async () => {
    player.setVolume(0.6);
    await player.toggle();
    expect(player.state.playing).toBe(true);
    await player.toggle();
    expect(player.state.playing).toBe(false);
    expect(player.state.volume).toBe(0.6);
    expect(localStorage.getItem("orbital.volume")).toBe("0.6");
  });
  it("restores the last nonzero volume after a zero-volume setting", async () => {
    player.setVolume(0.7);
    await player.toggle();
    player.setVolume(0);
    expect(player.state.playing).toBe(false);
    await player.toggle();
    expect(player.state.volume).toBe(0.7);
    expect(player.state.playing).toBe(true);
  });
  it("uses browser-compatible MP3", async () => {
    FakeAudio.instances[0].canPlayType = () => "";
    await player.toggle();
    expect(FakeAudio.instances[0].src).toContain(
      "adrift-among-infinite-stars.mp3",
    );
  });
  it("reports playback rejection without crashing the application", async () => {
    FakeAudio.instances[0].play.mockRejectedValueOnce(
      new Error("NotAllowedError"),
    );
    await player.toggle();
    expect(player.state).toMatchObject({
      enabled: false,
      playing: false,
      error: true,
      loading: false,
    });
  });
  it("pauses in the background and resumes only if previously enabled", async () => {
    await player.toggle();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(FakeAudio.instances[0].paused).toBe(true);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(player.state.playing).toBe(true));
  });
  it("keeps a late playback promise from restarting after mute", async () => {
    let resolve!: () => void;
    FakeAudio.instances[0].play.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const play = player.toggle();
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    await player.toggle();
    resolve();
    await play;
    expect(player.state.enabled).toBe(false);
    expect(FakeAudio.instances[0].paused).toBe(true);
  });
});
