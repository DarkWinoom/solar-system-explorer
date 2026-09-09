import { readPreference, savePreference } from "../utils/storage";

export interface AudioState {
  playing: boolean;
  enabled: boolean;
  volume: number;
  loading: boolean;
  error: boolean;
}

export class AmbientAudio {
  private readonly audio = new Audio();
  private context?: AudioContext;
  private gain?: GainNode;
  private enabled = false;
  private loading = false;
  private error = false;
  private disposed = false;
  private version = 0;
  private volume: number;
  private lastVolume: number;
  private readonly events = new AbortController();

  constructor(private readonly onChange: (state: AudioState) => void) {
    const saved = Number(readPreference("volume") ?? ".25");
    this.volume = Number.isFinite(saved)
      ? Math.max(0, Math.min(1, saved))
      : 0.25;
    this.lastVolume = this.volume || 0.25;
    this.audio.loop = true;
    this.audio.preload = "none";
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          this.audio.pause();
          void this.context?.suspend();
          this.emit();
        } else if (this.enabled) void this.play();
      },
      { signal: this.events.signal },
    );
  }

  get state(): AudioState {
    return {
      playing:
        this.enabled &&
        this.volume > 0 &&
        !this.audio.paused &&
        !document.hidden,
      enabled: this.enabled,
      volume: this.volume,
      loading: this.loading,
      error: this.error,
    };
  }

  async toggle(): Promise<void> {
    if (this.enabled && this.volume > 0) {
      this.version++;
      this.enabled = false;
      this.loading = false;
      this.audio.pause();
      this.emit();
    } else {
      if (!this.volume) this.setVolume(this.lastVolume);
      this.enabled = true;
      await this.play();
    }
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.volume > 0) this.lastVolume = this.volume;
    savePreference("volume", String(this.volume));
    if (this.gain && this.context)
      this.gain.gain.setTargetAtTime(
        this.volume,
        this.context.currentTime,
        0.05,
      );
    this.emit();
  }

  private async play(): Promise<void> {
    const version = ++this.version;
    this.error = false;
    this.loading = true;
    this.emit();
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.volume;
        this.context
          .createMediaElementSource(this.audio)
          .connect(this.gain)
          .connect(this.context.destination);
        const file = "adrift-among-infinite-stars.mp3";
        this.audio.src = `${import.meta.env.BASE_URL}audio/${file}`;
      }
      await this.context.resume();
      if (this.disposed || version !== this.version || document.hidden) return;
      await this.audio.play();
      if (this.disposed || version !== this.version || document.hidden)
        this.audio.pause();
    } catch {
      if (version === this.version && !this.disposed) {
        this.error = true;
        this.enabled = false;
      }
    } finally {
      if (!this.disposed && version === this.version) {
        this.loading = false;
        this.emit();
      }
    }
  }

  private emit(): void {
    if (!this.disposed) this.onChange(this.state);
  }
  dispose(): void {
    this.disposed = true;
    this.version++;
    this.events.abort();
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    void this.context?.close();
  }
}
