type Cue =
  | "tap"
  | "discover"
  | "capture"
  | "miss"
  | "hit"
  | "victory"
  | "heal"
  | "level";

/** Original procedural score and feedback. Web Audio begins only after the first gesture. */
export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private mode: "explore" | "battle" = "explore";
  private volume = 0.45;
  start(volume: number) {
    this.volume = volume;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = volume * 0.22;
        this.master.connect(this.ctx.destination);
        this.timer = window.setInterval(() => this.tick(), 280);
      } catch {
        return;
      } // WebGL still playable on browsers without audio.
    }
    if (this.ctx.state === "suspended")
      void this.ctx.resume().catch(() => undefined);
    this.setVolume(volume);
  }
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(
        this.volume * 0.22,
        this.ctx.currentTime,
        0.08,
      );
  }
  setMode(mode: "explore" | "battle") {
    if (this.mode !== mode) {
      this.mode = mode;
      this.step = 0;
    }
  }
  private tone(
    frequency: number,
    duration: number,
    gain = 0.25,
    type: OscillatorType = "sine",
    when = 0,
  ) {
    if (!this.ctx || !this.master || !this.volume) return;
    const time = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), time + 0.025);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(time);
    osc.stop(time + duration + 0.03);
  }
  private tick() {
    if (!this.ctx || this.ctx.state !== "running" || !this.volume) return;
    const explore = [0, 7, 12, 9, 4, 7, 2, 9, 0, 7, 11, 7, 4, 9, 7, 2];
    const battle = [0, 3, 7, 10, 5, 3, 8, 7, 0, 3, 7, 12, 8, 5, 3, 7];
    const notes = this.mode === "battle" ? battle : explore;
    const root = this.mode === "battle" ? 164.81 : 196;
    const note = root * Math.pow(2, notes[this.step % 16] / 12);
    this.tone(
      note * 2,
      this.mode === "battle" ? 0.18 : 0.48,
      this.mode === "battle" ? 0.085 : 0.08,
      "sine",
    );
    if (this.step % 4 === 0) {
      this.tone(root / 2, 1.2, 0.11, "triangle");
      this.tone(
        root * Math.pow(2, (this.mode === "battle" ? 3 : 4) / 12),
        1,
        0.04,
        "sine",
      );
    }
    if (this.mode === "battle" && this.step % 2 === 0)
      this.tone(82.4, 0.08, 0.045, "triangle");
    if (this.mode === "explore" && this.step % 16 === 9)
      this.tone(880, 0.13, 0.025, "sine", 0.1);
    this.step++;
  }
  cue(type: Cue) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const notes: Record<Cue, [number, number, number]> = {
      tap: [510, 670, 0],
      discover: [440, 660, 880],
      capture: [440, 660, 990],
      miss: [350, 276, 0],
      hit: [185, 140, 0],
      victory: [392, 523, 784],
      heal: [392, 587, 784],
      level: [523, 659, 1047],
    };
    notes[type].forEach((n, i) => {
      if (n)
        this.tone(
          n,
          type === "victory" ? 0.48 : 0.23,
          0.16,
          i === 0 && type === "hit" ? "triangle" : "sine",
          i * 0.095,
        );
    });
  }
  suspend() {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }
  resume() {
    if (this.ctx?.state === "suspended")
      void this.ctx.resume().catch(() => undefined);
  }
  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    void this.ctx?.close();
  }
}
