/** Chiptune engine: looping 8-bit music and effects, synthesised in code. No files, no downloads. */
export type SongId = "island" | "rain" | "lock" | "echo";
export type Sfx = "step" | "arrive" | "place" | "deny" | "menu" | "coin" | "hit" | "tick" | "win" | "lose";

type Note = number | null; // semitones from A2 (110 Hz), null = rest
const HZ = (n: number) => 110 * 2 ** (n / 12);
const SONGS: Record<SongId, { bpm: number; lead: Note[]; bass: Note[]; drums: string }> = {
  island: { bpm: 104,
    lead: [16, null, 19, 16, 23, null, 21, 19, 16, null, 12, 16, 19, null, null, null, 21, null, 19, 16, 14, null, 12, 14, 16, null, null, 19, 16, null, null, null],
    bass: [4, null, 4, null, 9, null, 9, null, 11, null, 11, null, 7, null, 7, null, 4, null, 4, null, 9, null, 9, null, 2, null, 2, null, 7, null, 7, null],
    drums: "k...s...k...s...k..ks...k...s..." },
  rain: { bpm: 148,
    lead: [21, 24, 21, 19, 16, 19, 21, 24, 26, 24, 21, 19, 16, 19, 21, 19, 21, 24, 21, 19, 16, 19, 21, 24, 28, 26, 24, 21, 19, 16, 14, 16],
    bass: [9, 9, null, 9, 4, 4, null, 4, 11, 11, null, 11, 7, 7, null, 7, 9, 9, null, 9, 4, 4, null, 4, 2, 2, null, 2, 7, 7, 7, 7],
    drums: "k.s.k.s.k.s.k.skk.s.k.s.k.s.ksk" },
  lock: { bpm: 126,
    lead: [12, null, 13, null, 12, null, 11, null, 12, null, 15, null, 13, null, 12, null],
    bass: [0, 0, null, 0, 1, 1, null, 1, 0, 0, null, 0, 3, 3, 3, 3],
    drums: "k...k...k...k..s" },
  echo: { bpm: 92,
    lead: [19, null, null, 23, null, null, 26, null, 24, null, null, 21, null, null, 19, null],
    bass: [7, null, null, null, 11, null, null, null, 9, null, null, null, 4, null, null, null],
    drums: "k.......s......." },
};

export function createChiptune(options: { muted?: boolean; volume?: number } = {}) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, musicGain: GainNode | null = null;
  let muted = options.muted ?? true, volume = options.volume ?? 0.5;
  let song: SongId | null = null, step = 0, nextTime = 0, timer = 0, disposed = false;

  const ready = () => {
    if (disposed || ctx) return ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.34; musicGain.connect(master);
    return ctx;
  };
  /** Square/triangle/noise voice. */
  const voice = (freq: number, at: number, dur: number, kind: "square" | "triangle" | "noise", gain: number, out: GainNode) => {
    if (!ctx) return;
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur); env.connect(out);
    if (kind === "noise") {
      const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, Math.max(1, n), ctx.sampleRate), d = buf.getChannelData(0);
      let s = 1; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * (1 - i / n); }
      const src = ctx.createBufferSource(); src.buffer = buf; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = freq;
      src.connect(hp); hp.connect(env); src.start(at); src.stop(at + dur); return;
    }
    const osc = ctx.createOscillator(); osc.type = kind; osc.frequency.setValueAtTime(freq, at);
    osc.connect(env); osc.start(at); osc.stop(at + dur + 0.02);
  };
  /** 16th-note scheduler with lookahead, so the loop stays steady under load. */
  const tick = () => {
    if (!ctx || !musicGain || !song) return;
    const tune = SONGS[song], beat = 60 / tune.bpm / 4;
    while (nextTime < ctx.currentTime + 0.25) {
      const i = step % tune.lead.length;
      const lead = tune.lead[i], bass = tune.bass[i % tune.bass.length], drum = tune.drums[i % tune.drums.length];
      if (lead !== null && lead !== undefined) voice(HZ(lead + 12), nextTime, beat * 1.7, "square", 0.22, musicGain);
      if (bass !== null && bass !== undefined) voice(HZ(bass), nextTime, beat * 1.9, "triangle", 0.5, musicGain);
      if (drum === "k") voice(70, nextTime, 0.1, "triangle", 0.55, musicGain);
      if (drum === "s") voice(1400, nextTime, 0.08, "noise", 0.35, musicGain);
      nextTime += beat; step++;
    }
  };
  const start = () => { if (timer || !ctx) return; timer = window.setInterval(tick, 60); };

  return {
    /** Must run inside a user gesture. */
    async unlock() { const c = ready(); if (!c) return false; if (c.state === "suspended") { try { await c.resume(); } catch { return false; } } start(); return true; },
    setMuted(next: boolean) { muted = next; if (master && ctx) master.gain.setTargetAtTime(next ? 0 : volume, ctx.currentTime, 0.05); },
    setVolume(next: number) { volume = Math.max(0, Math.min(1, next)); if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05); },
    /** Switch the looping track, or null for silence. */
    setSong(next: SongId | null) { if (next === song) return; song = next; step = 0; if (ctx) nextTime = ctx.currentTime + 0.05; },
    sfx(name: Sfx) {
      const c = ready(); if (!c || !master || muted) return; const t = c.currentTime;
      const blip = (f: number, at: number, dur: number, gain = 0.3, kind: "square" | "triangle" | "noise" = "square") => voice(f, at, dur, kind, gain, master!);
      if (name === "step") blip(180 + Math.random() * 40, t, 0.05, 0.12, "triangle");
      if (name === "arrive") { blip(HZ(16), t, 0.09); blip(HZ(23), t + 0.08, 0.12); }
      if (name === "menu") blip(HZ(19), t, 0.07, 0.25);
      if (name === "place") { blip(HZ(12), t, 0.08, 0.28, "triangle"); blip(2000, t, 0.06, 0.18, "noise"); }
      if (name === "deny") { blip(HZ(6), t, 0.09, 0.3); blip(HZ(2), t + 0.08, 0.14, 0.3); }
      if (name === "coin") { blip(HZ(28), t, 0.05, 0.25); blip(HZ(33), t + 0.05, 0.09, 0.25); }
      if (name === "hit") { blip(HZ(5), t, 0.16, 0.35, "triangle"); blip(500, t, 0.14, 0.3, "noise"); }
      if (name === "tick") blip(HZ(24), t, 0.03, 0.18);
      if (name === "win") [16, 20, 23, 28].forEach((n, i) => blip(HZ(n + 12), t + i * 0.08, 0.16, 0.26));
      if (name === "lose") [16, 13, 9, 4].forEach((n, i) => blip(HZ(n), t + i * 0.1, 0.18, 0.26, "triangle"));
    },
    stop() { song = null; if (timer) { window.clearInterval(timer); timer = 0; } },
    dispose() { disposed = true; this.stop(); if (ctx) { try { void ctx.close(); } catch { /* already closed */ } } ctx = null; master = null; musicGain = null; },
  };
}
export type Chiptune = ReturnType<typeof createChiptune>;
