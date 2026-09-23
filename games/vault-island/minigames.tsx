import { useEffect, useRef, useState } from "react";
import { spriteFrame, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import type { FriendSoundCue } from "@rarefriends/friendsdk/sounds";

type Common = { level: number; paused: boolean; still: boolean; cue: (c: FriendSoundCue) => void };
const rand = (n: number) => Math.floor(Math.random() * n);

/* ---------- Crystal Echo: repeat a growing, accelerating sequence ---------- */
const CRYSTALS = [{ name: "Rose", color: "#ef4d86", key: "1" }, { name: "Sky", color: "#46a8ff", key: "2" }, { name: "Moss", color: "#5ad66f", key: "3" }, { name: "Sun", color: "#ffc93a", key: "4" }];
export function CrystalEcho({ level, paused, still, cue, onDone }: Common & { onDone: (rounds: number) => void }) {
  const [seq, setSeq] = useState(() => [rand(4), rand(4), rand(4)]);
  const [lit, setLit] = useState<number | null>(null), [mode, setMode] = useState<"show" | "input" | "over">("show");
  const [cursor, setCursor] = useState(0), [timeLeft, setTimeLeft] = useState(1);
  const clock = useRef({ t: 0, i: 0, wait: 0 }), live = useRef({ paused, mode, seq, cursor }); live.current = { paused, mode, seq, cursor };
  const rounds = seq.length - 3;
  const onMs = Math.max(200, 560 - rounds * 32 - level * 22), gapMs = Math.max(90, 220 - rounds * 10), pressMs = Math.max(1400, 3000 - rounds * 120 - level * 100);
  useEffect(() => { clock.current = { t: 0, i: 0, wait: 700 }; }, [seq]);
  useEffect(() => {
    let raf = 0, prev = 0;
    const tick = (now: number) => {
      const dt = prev ? Math.min(now - prev, 50) : 0; prev = now; const c = clock.current, L = live.current;
      if (!L.paused && L.mode === "show") {
        if (c.wait > 0) c.wait -= dt;
        else { c.t += dt; const slot = onMs + gapMs, idx = Math.floor(c.t / slot);
          if (idx >= L.seq.length) { setLit(null); setMode("input"); setCursor(0); c.t = 0; }
          else { const on = c.t % slot < onMs; setLit(on ? L.seq[idx] : null); if (on && idx !== c.i - 1) { c.i = idx + 1; cue("select"); } } }
      }
      if (!L.paused && L.mode === "input") { c.t += dt; const left = 1 - c.t / pressMs; setTimeLeft(Math.max(0, left));
        if (left <= 0) { setMode("over"); cue("impact"); } }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [onMs, gapMs, pressMs, cue]);
  const press = (i: number) => {
    if (paused || mode !== "input") return;
    setLit(i); window.setTimeout(() => setLit(l => (l === i ? null : l)), 160); clock.current.t = 0;
    if (seq[cursor] !== i) { setMode("over"); cue("impact"); return; }
    if (cursor + 1 === seq.length) { cue("action-ready"); setMode("show"); setSeq(s => [...s, rand(4)]); }
    else { cue("select"); setCursor(cursor + 1); }
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { const i = CRYSTALS.findIndex(c => c.key === e.key); if (i >= 0) { e.preventDefault(); press(i); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });
  return <div className="vi-mini vi-echo">
    <header><h2>Crystal Echo</h2><span>Round {rounds + 1} · {seq.length} crystals</span></header>
    <p className="vi-mini-status" role="status">{mode === "show" ? "Watch the crystals…" : mode === "input" ? `Your turn: ${cursor} / ${seq.length}` : `Sequence broken. ${rounds} rounds cleared.`}</p>
    <div className="vi-echo-grid">{CRYSTALS.map((c, i) => <button key={c.name} type="button" aria-label={`${c.name} crystal, key ${c.key}`} disabled={mode !== "input"}
      className={`vi-crystal ${lit === i ? "lit" : ""} ${still ? "still" : ""}`} style={{ ["--c" as string]: c.color }} onPointerDown={e => { e.preventDefault(); press(i); }}><span>{c.key}</span></button>)}</div>
    <div className="vi-timer" aria-hidden="true"><i style={{ width: `${mode === "input" ? timeLeft * 100 : 100}%` }} /></div>
    {mode === "over" && <button type="button" className="vi-primary" onClick={() => onDone(rounds)}>Collect {rounds * 10} base Stardust</button>}
  </div>;
}

/* ---------- Star Rain: 30 seconds, catch stars, dodge rocks ---------- */
export function StarRain({ level, paused, still, cue, sprites, onDone }: Common & { sprites: GenerationSprites; onDone: (stars: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [result, setResult] = useState<number | null>(null);
  const input = useRef({ left: false, right: false, target: null as number | null }); const live = useRef({ paused, still }); live.current = { paused, still };
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    const W = 960, H = 640, FLOOR = 560, s = { x: W / 2, stars: 0, hearts: 3, time: 30, spawn: 0, hitUntil: 0, start: 1.5, done: false };
    type Drop = { x: number; y: number; v: number; rock: boolean }; let drops: Drop[] = []; let raf = 0, prev = 0;
    const loop = (now: number) => {
      const dt = prev ? Math.min((now - prev) / 1000, 0.05) : 0; prev = now; const L = live.current;
      if (!L.paused && !s.done) {
        if (s.start > 0) s.start -= dt;
        else {
          s.time -= dt; const i = input.current, dir = Number(i.right) - Number(i.left);
          if (dir) { i.target = null; s.x += dir * 560 * dt; } else if (i.target !== null) s.x += Math.sign(i.target - s.x) * Math.min(Math.abs(i.target - s.x), 560 * dt);
          s.x = Math.max(40, Math.min(W - 40, s.x));
          const heat = 1 - s.time / 30; s.spawn -= dt;
          if (s.spawn <= 0) { s.spawn = Math.max(0.22, 0.6 - heat * 0.3 - level * 0.03); drops.push({ x: 30 + Math.random() * (W - 60), y: -30, v: 200 + heat * 220 + level * 18 + Math.random() * 80, rock: Math.random() < 0.28 + heat * 0.22 + level * 0.02 }); }
          drops.forEach(d => { d.y += d.v * dt; }); const catchers = drops.filter(d => d.y > FLOOR - 80 && d.y < FLOOR && Math.abs(d.x - s.x) < 44);
          catchers.forEach(d => { if (d.rock) { if (now > s.hitUntil) { s.hearts--; s.hitUntil = now + 900; cue("impact"); } } else { s.stars++; cue("select"); } });
          drops = drops.filter(d => !catchers.includes(d) && d.y < H + 40);
          if (s.time <= 0 || s.hearts <= 0) { s.done = true; setResult(s.stars); cue(s.hearts > 0 ? "action-ready" : "impact"); }
        }
      }
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#3d3f9a"); g.addColorStop(1, "#d98bb0"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#57372a"; ctx.fillRect(0, FLOOR, W, H - FLOOR); ctx.fillStyle = "#78c265"; ctx.fillRect(0, FLOOR, W, 14);
      drops.forEach(d => { if (d.rock) { ctx.fillStyle = "#6d6690"; ctx.fillRect(d.x - 18, d.y - 14, 36, 28); ctx.fillStyle = "#9b93b8"; ctx.fillRect(d.x - 12, d.y - 14, 18, 8); }
        else { ctx.fillStyle = "#ffc93a"; ctx.fillRect(d.x - 4, d.y - 16, 8, 32); ctx.fillRect(d.x - 16, d.y - 4, 32, 8); ctx.fillRect(d.x - 8, d.y - 8, 16, 16); ctx.fillStyle = "#fff6c9"; ctx.fillRect(d.x - 3, d.y - 3, 6, 6); } });
      const blink = now < s.hitUntil && Math.floor(now / 90) % 2 === 0; ctx.globalAlpha = blink ? (L.still ? 0.5 : 0.15) : 1;
      const rows = spriteFrame(sprites, "down", s.start <= 0 && !s.done, L.still ? 0 : Math.floor(now / 90) % 8, "right").frame.rows, left = Math.round(s.x) - 32, top = FLOOR - 64;
      ctx.fillStyle = "#fff"; rows.forEach((r, y) => [...r].forEach((p, x) => { if (p === "#") ctx.fillRect(left + x * 4 - 4, top + y * 4 - 4, 12, 12); }));
      ctx.fillStyle = "#000"; rows.forEach((r, y) => [...r].forEach((p, x) => { if (p === "#") ctx.fillRect(left + x * 4, top + y * 4, 4, 4); })); ctx.globalAlpha = 1;
      ctx.font = "bold 26px ui-monospace, monospace"; ctx.textAlign = "left"; ctx.fillStyle = "#fff6e8";
      ctx.fillText(`★ ${s.stars}`, 28, 50); ctx.fillText(`${"♥".repeat(Math.max(0, s.hearts))}${"·".repeat(3 - Math.max(0, s.hearts))}`, 150, 50);
      ctx.textAlign = "right"; ctx.fillText(`${Math.max(0, s.time).toFixed(1)}s`, W - 28, 50);
      if (s.start > 0) { ctx.textAlign = "center"; ctx.font = "bold 72px ui-monospace, monospace"; ctx.fillText(String(Math.ceil(s.start)), W / 2, H / 2); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const key = (down: boolean) => (e: KeyboardEvent) => { const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") { input.current.left = down; e.preventDefault(); } if (k === "d" || k === "arrowright") { input.current.right = down; e.preventDefault(); } };
    const kd = key(true), ku = key(false); window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [level, sprites, cue]);
  const aim = (e: React.PointerEvent<HTMLCanvasElement>) => { if (e.buttons === 0 && e.type === "pointermove") return; const r = e.currentTarget.getBoundingClientRect(); input.current.target = (e.clientX - r.left) * 960 / r.width; };
  return <div className="vi-mini vi-rain">
    <canvas ref={canvas} width={960} height={640} aria-label="Star Rain. A and D or arrows to move. Drag or tap to move on touch." onPointerDown={aim} onPointerMove={aim} />
    {result !== null && <div className="vi-mini-end"><p>{result} stars caught.</p><button type="button" className="vi-primary" onClick={() => onDone(result)}>Collect {result * 4} base Stardust</button></div>}
  </div>;
}

/* ---------- Vault Lock: stop the cursor inside a shrinking zone, three pins ---------- */
export function VaultLock({ level, paused, cue, onDone }: Common & { onDone: (ok: boolean) => void }) {
  const PINS = [{ speed: 0.8, width: 0.2 }, { speed: 1.2, width: 0.14 }, { speed: 1.7, width: 0.09 }];
  const [pin, setPin] = useState(0), [zone, setZone] = useState(() => 0.1 + Math.random() * 0.6), [state, setState] = useState<"play" | "won" | "lost">("play");
  const cursor = useRef(0), dir = useRef(1), bar = useRef<HTMLElement>(null), live = useRef({ paused, state }); live.current = { paused, state };
  useEffect(() => { let raf = 0, prev = 0;
    const tick = (now: number) => { const dt = prev ? Math.min((now - prev) / 1000, 0.05) : 0; prev = now;
      if (!live.current.paused && live.current.state === "play") { cursor.current += dir.current * PINS[pin].speed * (1 + level * 0.07) * dt;
        if (cursor.current > 1) { cursor.current = 1; dir.current = -1; } if (cursor.current < 0) { cursor.current = 0; dir.current = 1; } }
      if (bar.current) bar.current.style.left = `${cursor.current * 100}%`; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [pin, level]);
  const stop = () => { if (paused || state !== "play") return; const w = PINS[pin].width;
    if (cursor.current >= zone && cursor.current <= zone + w) { cue("action-ready"); if (pin === 2) setState("won"); else { setPin(pin + 1); setZone(0.1 + Math.random() * (0.8 - PINS[pin + 1].width)); } }
    else { cue("impact"); setState("lost"); } };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) stop(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });
  return <div className="vi-mini vi-lock">
    <header><h2>Vault Lock</h2><span>Pin {Math.min(pin + 1, 3)} of 3</span></header>
    <div className="vi-pins" aria-hidden="true">{PINS.map((_, i) => <i key={i} className={i < pin || state === "won" ? "set" : ""} />)}</div>
    <div className="vi-lockbar" aria-hidden="true"><b style={{ left: `${zone * 100}%`, width: `${PINS[pin].width * 100}%` }} /><em ref={bar} /></div>
    <p className="vi-mini-status" role="status">{state === "play" ? "Stop the pick inside the gold zone. Space, Enter or tap." : state === "won" ? "Click. The vault is open." : "The pick slipped. The vault jams, your key is safe."}</p>
    {state === "play" ? <button type="button" className="vi-primary vi-stop" onPointerDown={e => { e.preventDefault(); stop(); }}>Stop</button>
      : <button type="button" className="vi-primary" onClick={() => onDone(state === "won")}>{state === "won" ? "Open the vault" : "Back to the island"}</button>}
  </div>;
}
