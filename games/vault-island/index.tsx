"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, spriteFrame, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import { createWorld, STATIONS, type StationId, type World, type Facing } from "./world.js";
import { CrystalEcho, StarRain, VaultLock } from "./minigames.js";
import { PixelIcon } from "./icons.js";
import { DECOR, MAX_DECOR, buyDecor, placeDecor, pickUpDecor, type DecorId, UPGRADES, COOLDOWN_MS, JAM_MS, VAULT_CHARGES, buyUpgrade, dayOf, decodeSave, earn, encodeSave, freshProgress, level, msToDawn,
  multiplier, rollover, switchClock, type Clock, type Progress, type UpgradeId } from "./progress.js";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

type Menu = StationId | "loot" | "settings" | "reward" | null;
type Mini = "echo" | "rain" | "lock" | null;
const rf = (v: bigint) => `${formatGameAmount(v, 18)} RF`;
const clockText = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const NAMES: Record<StationId, string> = { merchant: "Key merchant", workbench: "Island workshop", echo: "Crystal Echo", rain: "Star Rain", vault: "The vault" };
const MOVE_KEYS: Record<string, [number, number]> = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };

export default function VaultIsland({ friendId, client, paused }: GameComponentProps) {
  const definition = client.definition;
  const canvas = useRef<HTMLCanvasElement>(null), world = useRef<World | null>(null), sound = useRef<FriendSoundKit | null>(null);
  const sprites = useRef<GenerationSprites | null>(null), keys = useRef(new Set<string>()), epoch = useRef(0), locked = useRef(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [art, setArt] = useState<GenerationSprites | null>(null);
  const [progress, setProgress] = useState<Progress>(() => freshProgress(friendId, "demo", Date.now()));
  const [now, setNow] = useState(Date.now()), [near, setNear] = useState<StationId | null>(null);
  const [menu, setMenu] = useState<Menu>(null), [mini, setMini] = useState<Mini>(null), [result, setResult] = useState<GamePlay | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [toast, setToast] = useState<{ text: string; until: number } | null>(null), [loadError, setLoadError] = useState(""), [revision, setRevision] = useState(0);
  const [lowGfx, setLowGfx] = useState(() => navigator.webdriver === true), [muted, setMuted] = useState(true), [reducedMotion, setReducedMotion] = useState(false), [importText, setImportText] = useState(""), [saveCode, setSaveCode] = useState("");
  const live = useRef({ paused, menu, mini, reducedMotion }); live.current = { paused, menu, mini, reducedMotion };
  const cue = useCallback((c: FriendSoundCue) => sound.current?.play(c), []);
  const say = (text: string) => setToast({ text, until: Date.now() + 6000 });
  const [build, setBuild] = useState<{ type: DecorId | null; rot: number; pickup: boolean } | null>(null), [buildHint, setBuildHint] = useState("");
  const buildRef = useRef(build); buildRef.current = build;

  useEffect(() => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"); const f = () => setReducedMotion(q.matches); f(); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);

  /* Session: fresh island per Friend, canonical sprites + runtime snapshot. */
  useEffect(() => {
    const version = ++epoch.current; locked.current = false; sound.current = createFriendSoundKit({ muted: true });
    setSnapshot(null); setArt(null); setMenu(null); setMini(null); setResult(null); setError(""); setLoadError(""); setMuted(true); setToast(null); setBuild(null); seenDay.current = null;
    setProgress(freshProgress(friendId, "demo", Date.now()));
    void Promise.all([createFriendReader().read(friendId), client.read()]).then(([a, s]) => {
      if (version !== epoch.current) return; if (s.friendId !== friendId) throw new Error("Game session does not match the selected Friend.");
      sprites.current = a; setArt(a); setSnapshot(s);
    }).catch(e => { if (version === epoch.current) setLoadError(e instanceof Error ? e.message : "The island could not load."); });
    return () => { epoch.current++; sound.current?.dispose(); sound.current = null; };
  }, [client, friendId, revision]);

  /* Day clock: dawn refills vault charges; skipped days evaporate Stardust and reset the streak. */
  const progressRef = useRef(progress); progressRef.current = progress; const seenDay = useRef<number | null>(null);
  useEffect(() => { const id = window.setInterval(() => { const t = Date.now(); setNow(t);
    const p = progressRef.current, today = dayOf(p.clock, t), r = rollover(p, t);
    if (r.next !== p) { progressRef.current = r.next; setProgress(r.next); }
    if (seenDay.current !== null && today > seenDay.current) { const n = today - r.next.firstDay + 1;
      say(r.lost > 0 ? `Day ${n}. You missed ${r.missed} day${r.missed > 1 ? "s" : ""}: ${r.lost} Stardust evaporated, streak reset.` : `Day ${n}. The vault has ${VAULT_CHARGES} charges again.`); }
    seenDay.current = today; }, 1000);
    return () => window.clearInterval(id); }, []);

  /* 3D world lifecycle and render loop. */
  const ready = Boolean(snapshot && art);
  useEffect(() => {
    const node = canvas.current; if (!ready || !node) return;
    let w: World; try { w = createWorld(node, window.matchMedia("(pointer: coarse)").matches); } catch { setLoadError("This browser cannot start 3D graphics (WebGL). Try another browser or device."); return; }
    world.current = w; const fit = () => w.resize(node.clientWidth || 960, node.clientHeight || 640); fit();
    const ro = new ResizeObserver(fit); ro.observe(node);
    let raf = 0, prev = 0, lastNear: StationId | null = null, lastKey = "";
    const loop = (t: number) => { const dt = prev ? Math.min((t - prev) / 1000, 0.05) : 0; prev = t; const L = live.current;
      if (L.mini) { raf = requestAnimationFrame(loop); return; } // the island is hidden behind mini-games: skip rendering
      const active = !L.paused && !L.menu && !L.mini && !document.hidden;
      const k = keys.current, kx = Number(k.has("d") || k.has("arrowright")) - Number(k.has("a") || k.has("arrowleft")), ky = Number(k.has("w") || k.has("arrowup")) - Number(k.has("s") || k.has("arrowdown"));
      const r = w.step(dt, t, active ? kx : 0, active ? ky : 0, active, L.reducedMotion);
      if (sprites.current) { const frame = L.reducedMotion ? 0 : Math.floor(t / (r.moving ? 90 : 170)) % 8, id = `${r.facing}${r.moving}${frame}`;
        if (id !== lastKey) { lastKey = id; w.setFriendPixels(spriteFrame(sprites.current, r.facing as Facing, r.moving, frame, r.facing === "left" ? "left" : "right").frame.rows); } }
      if (r.near !== lastNear) { lastNear = r.near; setNear(r.near); }
      if (buildRef.current && Math.floor(t / 150) !== Math.floor((t - dt * 1000) / 150)) { const pv = w.buildPreview(); setBuildHint(h => { const n = pv ? pv.problem || (buildRef.current?.pickup ? "Click to pick it up" : "Click to place") : "Point at the ground"; return h.startsWith("!") ? h : n; }); }
      node.dataset.x = r.x.toFixed(2); node.dataset.z = r.z.toFixed(2); if (Math.floor(t / 250) !== Math.floor((t - dt * 1000) / 250)) node.dataset.stations = JSON.stringify(w.screenPoints(node.clientWidth, node.clientHeight)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const stop = () => { keys.current.clear(); w.stop(); }; window.addEventListener("blur", stop); document.addEventListener("visibilitychange", stop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop); w.dispose(); world.current = null; };
  }, [ready]);
  useEffect(() => { world.current?.setUpgrades(progress.upgrades); }, [progress.upgrades, ready]);
  useEffect(() => { world.current?.setDecor(progress.decor); }, [progress.decor, ready]);
  useEffect(() => { world.current?.setLowGraphics(lowGfx); }, [lowGfx, ready]);
  useEffect(() => { world.current?.setBuild(build); if (!build) setBuildHint(""); }, [build, ready]);
  useEffect(() => { const w = world.current; if (!w || !snapshot) return;
    const wait = (at: number) => at - now > 0 ? clockText(at - now) : "";
    const status: Record<StationId, string> = { merchant: `${snapshot.consumables.toString()} keys`, workbench: `✦ ${progress.stardust}`,
      echo: wait(progress.ready.echo) || "ready", rain: wait(progress.ready.rain) || "ready",
      vault: progress.charges <= 0 ? "closed" : wait(progress.jammedUntil) ? `jammed ${wait(progress.jammedUntil)}` : `${progress.charges}/${VAULT_CHARGES}` };
    (Object.keys(NAMES) as StationId[]).forEach(id => w.setLabel(id, `${NAMES[id]}|${status[id]}`, near === id)); });
  useEffect(() => { if (paused || menu || mini) { keys.current.clear(); world.current?.stop(); } }, [paused, menu, mini]);

  const openStation = (id: StationId | null) => { if (!id || busy || paused || mini) return; setError(""); setMenu(id); cue("select"); void sound.current?.unlock(); };
  useEffect(() => { const down = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); const L = live.current; if (L.menu || L.mini || L.paused) return;
      if (MOVE_KEYS[k]) { e.preventDefault(); keys.current.add(k); }
      if (buildRef.current) { if (k === "r" && !e.repeat) setBuild(b => b && { ...b, rot: (b.rot + 1) % 4 }); if (k === "escape") setBuild(null); return; }
      if (k === "e" && !e.repeat) openStation(nearRef.current); };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); }; });
  const nearRef = useRef<StationId | null>(null); nearRef.current = near;

  async function act(work: () => Promise<void>, sfx?: FriendSoundCue, after?: () => void) {
    if (locked.current || paused) return; const version = epoch.current; locked.current = true; setBusy(true); setError(""); void sound.current?.unlock();
    try { await work(); const v = await client.read(); if (version === epoch.current) { setSnapshot(v); if (sfx) cue(sfx); after?.(); } }
    catch (e) { if (version === epoch.current) setError(e instanceof Error ? e.message : "The preview action failed."); }
    finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }
  const pay = (base: number, label: string) => { if (base <= 0) { setProgress(p => earn(p, 0, Date.now()).next); say(`${label}: no Stardust this time. Today's visit still counts for your streak.`); return; }
    setProgress(p => { const r = earn(p, base, Date.now()); say(`${label}: +${r.gained} Stardust (x${multiplier(r.next).toFixed(1)} streak bonus).`); return r.next; }); };

  if (loadError) return <div className="vi-status" role="alert"><p>{loadError}</p><button type="button" disabled={paused} onClick={() => setRevision(v => v + 1)}>Retry</button></div>;
  if (!snapshot || !art) return <div className="vi-status" role="status"><p>Raising the island and waking your Friend…</p></div>;

  const maxPrize = maximumPrize(definition), pending = snapshot.plays.find(p => p.outcomeId === null);
  const canBuy = (n: bigint) => snapshot.rfBalance >= definition.price * n && snapshot.freeStake >= maxPrize * n;
  const outcome = result?.outcomeId ? definition.outcomes[result.outcomeId - 1] : null;
  const lvl = level(progress), cd = COOLDOWN_MS[progress.clock], owned = snapshot.inventory.reduce((a, b) => a + b, 0n);
  const waitFor = (id: StationId) => id === "echo" ? progress.ready.echo - now : id === "rain" ? progress.ready.rain - now : id === "vault" ? progress.jammedUntil - now : 0;
  const vaultBlock = pending ? "" : snapshot.consumables === 0n ? "You need a Vault Key from the merchant." : progress.charges <= 0 ? `No charges left today. Dawn in ${clockText(msToDawn(progress.clock, now))}.` : waitFor("vault") > 0 ? `The lock is jammed for ${clockText(waitFor("vault"))}.` : "";
  const startMini = (m: Exclude<Mini, null>) => { setMenu(null); setMini(m); cue("action-start"); void sound.current?.unlock(); };
  const openVault = () => act(async () => { const v = epoch.current; const play = pending ?? (await client.play(1n))[0]; const settled = await client.settle(play.id);
    if (v === epoch.current) setResult(settled); }, "anticipation", () => { world.current?.setChest(true); window.setTimeout(() => setMenu("reward"), reducedMotion ? 0 : 1100); });
  const closeReward = () => { world.current?.setChest(false); setMenu(null); setResult(null); };
  const refreshCode = () => setSaveCode(encodeSave(progress));
  const nextType = (stash: Record<DecorId, number>, prefer: DecorId | null) => prefer && stash[prefer] > 0 ? prefer : DECOR.find(d => stash[d.id] > 0)?.id ?? null;
  function placeHere() {
    const w = world.current, b = buildRef.current; if (!w || !b) return; const pv = w.buildPreview(); if (!pv) return;
    if (b.pickup) { if (pv.pick < 0) return; const item = progress.decor[pv.pick], next = pickUpDecor(progress, pv.pick); if (!next || !item) return;
      setProgress(next); setBuild({ type: item.t, rot: item.rot, pickup: false }); setBuildHint("Picked up. Click somewhere to place it again."); cue("select"); return; }
    if (!b.type) return; if (progress.decor.length >= MAX_DECOR) { setBuildHint(`!The island holds ${MAX_DECOR} decorations at most`); return; }
    const problem = w.validate(b.type, pv.x, pv.z); if (problem) { setBuildHint(`!${problem}`); window.setTimeout(() => setBuildHint(h => h.startsWith("!") ? "" : h), 1600); cue("impact"); return; }
    const next = placeDecor(progress, { t: b.type, x: pv.x, z: pv.z, rot: b.rot }); if (!next) return;
    setProgress(next); cue("purchase"); const t = nextType(next.stash, b.type); setBuild(t ? { ...b, type: t } : { ...b, type: null });
    if (!t) setBuildHint("Nothing left to place. Buy more at the workshop."); }
  const stock = DECOR.reduce((n, d) => n + progress.stash[d.id], 0);
  const startDecorate = () => { setMenu(null); setBuild({ type: nextType(progress.stash, null), rot: 0, pickup: stock === 0 }); };
  const saveSection = <>
        <h3 className="vi-h3">Save your island</h3>
        <p className="vi-small">This preview cannot store data, so your island travels as a code. It holds your Stardust, upgrades, streak and last visit, and is locked to Friend #{friendId.toString()}. Days you skipped are applied when you load it.</p>
        <div className="vi-row"><button type="button" onClick={refreshCode}>Create save code</button></div>
        {saveCode && <textarea className="vi-code" readOnly value={saveCode} onFocus={e => e.currentTarget.select()} aria-label="Your save code. Select and copy it." />}
        <textarea className="vi-code" value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste a save code to load an island" aria-label="Paste a save code" />
        <div className="vi-row"><button type="button" disabled={!importText.trim() || paused} onClick={() => { try { const loaded = decodeSave(importText, friendId), r = rollover(loaded, Date.now());
          setProgress(r.next); setImportText(""); setError(""); say(r.lost > 0 ? `Island loaded. You missed ${r.missed} day(s): ${r.lost} Stardust evaporated.` : "Island loaded. Welcome back."); setMenu(null); } catch (e) { setError(e instanceof Error ? e.message : "That code did not load."); } }}>Load island</button></div>
  </>;
  const prompt = near ? (() => { const w = waitFor(near); return `${NAMES[near]}${w > 0 ? ` · ${clockText(w)}` : ""}`; })() : "";

  return <section className="vi-game" aria-label="Vault Island" aria-busy={busy}>
    <div className="vi-stage" inert={Boolean(menu || mini) || paused || undefined}>
      <canvas ref={canvas} tabIndex={0} aria-label="Vault Island. WASD or arrows to walk, tap the ground to walk there, E to use a nearby station."
        onPointerDown={e => { if (paused || menu || mini) return; e.currentTarget.focus(); const rect = e.currentTarget.getBoundingClientRect();
          if (build) { world.current?.aim(e.clientX, e.clientY, rect); if (e.pointerType === "mouse") placeHere(); else setBuildHint("Adjust by tapping, then Place"); return; }
          keys.current.clear(); world.current?.pointTo(e.clientX, e.clientY, rect); }}
        onPointerMove={e => { if (e.pointerType === "mouse") world.current?.hover(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); }}
        onPointerLeave={() => world.current?.hover(null)} />
      <div className="vi-hud">
        <div className="vi-card"><b>{rf(snapshot.rfBalance)}</b> preview<br /><span>{snapshot.consumables.toString()} keys · vault {progress.charges}/{VAULT_CHARGES}</span></div>
        <div className="vi-card vi-dust"><b>✦ {progress.stardust}</b> Stardust<br /><span>Streak {progress.streak} · x{multiplier(progress).toFixed(1)} · island lv {lvl}</span></div>
        <div className="vi-card vi-clock"><b>Day {dayOf(progress.clock, now) - progress.firstDay + 1}</b><br /><span>dawn in {clockText(msToDawn(progress.clock, now))}</span></div>
        {!build && (stock > 0 || progress.decor.length > 0) && <button type="button" onClick={startDecorate}>Decorate</button>}
        <button type="button" onClick={() => setMenu("loot")}>Loot{owned > 0n ? ` ${owned}` : ""}</button>
        <button type="button" onClick={() => setMenu("settings")}>Settings</button>
      </div>
      {build ? <div className="vi-build" role="toolbar" aria-label="Decorate">
          <p className={`vi-build-hint ${buildHint.startsWith("!") ? "bad" : ""}`} role="status">{buildHint.replace(/^!/, "") || "Point at the ground"}</p>
          <div className="vi-build-bar">
            <div className="vi-build-items">{DECOR.map(d => <button key={d.id} type="button" aria-pressed={!build.pickup && build.type === d.id} disabled={progress.stash[d.id] === 0}
              onClick={() => setBuild({ ...build, type: d.id, pickup: false })}>{d.name} <b>{progress.stash[d.id]}</b></button>)}</div>
            <button type="button" aria-label="Rotate" style={{ whiteSpace: "nowrap" }} onClick={() => setBuild({ ...build, rot: (build.rot + 1) % 4 })}>⟳<small className="vi-desk"> R</small></button>
            <button type="button" aria-pressed={build.pickup} onClick={() => setBuild({ ...build, pickup: !build.pickup })}>Move</button>
            <button type="button" className="vi-touch-only" onClick={placeHere}>Place</button>
            <button type="button" className="vi-primary" onClick={() => setBuild(null)}>Done</button>
          </div>
        </div>
        : near ? <button type="button" className="vi-prompt" onClick={() => openStation(near)}>{prompt}<small className="vi-desk"> · E</small></button>
        : <p className="vi-hint"><span className="vi-desk">WASD / arrows to walk · </span>Tap the ground to walk · Visit the 5 stations</p>}
      {toast && now < toast.until && !menu && !mini && <p className="vi-toast" role="status">{toast.text}</p>}
    </div>

    {mini && <div className="vi-mini-layer">
      {mini === "echo" && <CrystalEcho level={lvl} paused={paused} still={reducedMotion} cue={cue} onDone={r => { setMini(null);
        setProgress(p => ({ ...p, bestEcho: Math.max(p.bestEcho, r), ready: { ...p.ready, echo: Date.now() + cd } })); pay(r * 10, `Crystal Echo, ${r} rounds`); }} />}
      {mini === "rain" && <StarRain level={lvl} paused={paused} still={reducedMotion} cue={cue} sprites={art} onDone={s => { setMini(null);
        setProgress(p => ({ ...p, bestRain: Math.max(p.bestRain, s), ready: { ...p.ready, rain: Date.now() + cd } })); pay(s * 4, `Star Rain, ${s} stars`); }} />}
      {mini === "lock" && <VaultLock level={lvl} paused={paused} still={reducedMotion} cue={cue} onDone={ok => { setMini(null);
        if (ok) { setProgress(p => ({ ...p, charges: p.charges - 1 })); pay(20, "Lock picked"); void openVault(); }
        else { setProgress(p => ({ ...p, jammedUntil: Date.now() + JAM_MS[p.clock] })); pay(0, "Lock jammed"); } }} />}
    </div>}

    {menu && <GameMenu title={menu === "loot" ? "Your loot" : menu === "settings" ? "Settings" : menu === "reward" ? "The vault opens" : NAMES[menu]}
      onClose={busy || menu === "reward" ? undefined : () => setMenu(null)}>
      {menu === "merchant" ? <>
        <p>A Vault Key lets you attempt the vault once you pick its lock. A failed lock keeps your key. Loot is decided by chance, never by skill.</p>
        <table className="vi-table"><thead><tr><th>Loot</th><th>Chance</th><th>Worth</th></tr></thead><tbody>
          {definition.outcomes.map(o => <tr key={o.name}><td><span className="vi-icon"><PixelIcon name={o.name} size={22} /></span>{o.name}</td><td>{o.chanceBps / 100}%</td><td>{rf(o.reward)}</td></tr>)}</tbody></table>
        <div className="vi-row"><button type="button" className="rf-frame-primary" disabled={!canBuy(1n) || busy || paused} onClick={() => void act(() => client.buy(1n), "purchase", () => say("1 simulated key bought."))}>Buy 1 · {rf(definition.price)}</button>
          <button type="button" disabled={!canBuy(3n) || busy || paused} onClick={() => void act(() => client.buy(3n), "purchase", () => say("3 simulated keys bought."))}>Buy 3 · {rf(definition.price * 3n)}</button></div>
        <p className="vi-small">Each key reserves {rf(maxPrize)} of backing. Expected value 0.905 RF per key.</p>
      </> : menu === "vault" ? <>
        <p>Pick a three-pin lock. Each pin is faster with a smaller target, and your island level makes it harder. Success spends one key and one of today's {VAULT_CHARGES} vault charges. Failure jams the vault for {Math.round(JAM_MS[progress.clock] / 1000)}s and keeps your key.</p>
        <p><b>{snapshot.consumables.toString()}</b> keys · <b>{progress.charges}</b> charges left today</p>
        {pending ? <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => { setMenu(null); void openVault(); }}>Finish opening (already unlocked)</button>
          : <button type="button" className="rf-frame-primary" disabled={Boolean(vaultBlock) || busy || paused} onClick={() => startMini("lock")}>Pick the lock</button>}
        {vaultBlock && <p className="vi-small">{vaultBlock}</p>}
      </> : menu === "echo" || menu === "rain" ? <>
        {menu === "echo" ? <p>Watch the crystals light up, then repeat the order with keys 1 to 4 or by tapping. Each round adds a crystal and speeds up. You have a few seconds per press. 10 base Stardust per round cleared. Best: {progress.bestEcho} rounds.</p>
          : <p>30 seconds on the star platform. Catch falling stars, dodge rocks, three hits and you are out. Move with A/D, arrows, or by dragging. 4 base Stardust per star. Best: {progress.bestRain} stars.</p>}
        <p className="vi-small">Streak bonus x{multiplier(progress).toFixed(1)}. Recharges {Math.round(cd / 1000)}s after each play. Difficulty grows with island level ({lvl}).</p>
        <button type="button" className="rf-frame-primary" disabled={waitFor(menu) > 0 || busy || paused} onClick={() => startMini(menu)}>{waitFor(menu) > 0 ? `Recharging · ${clockText(waitFor(menu))}` : "Play"}</button>
      </> : menu === "workbench" ? <>
        <p>Buy decorations, then place them wherever you like. Spent Stardust is safe. Unspent Stardust loses 25% for every day you skip. You have <b>✦ {progress.stardust}</b>.</p>
        {DECOR.map(d => <div className="vi-item" key={d.id}><span><strong>{d.name}</strong><small>{progress.stash[d.id]} to place · {progress.decor.filter(p => p.t === d.id).length} on the island</small></span>
          <button type="button" disabled={progress.stardust < d.cost || paused} onClick={() => { const next = buyDecor(progress, d.id); if (next) { setProgress(next); cue("purchase"); } }}>✦ {d.cost}</button></div>)}
        <div className="vi-row"><button type="button" className="rf-frame-primary" disabled={paused || (stock === 0 && progress.decor.length === 0)}
          onClick={startDecorate}>Decorate island ({stock} to place)</button></div>
        <p className="vi-small">{progress.decor.length} / {MAX_DECOR} decorations placed. Paths and station entrances must stay clear.</p>
        <h3 className="vi-h3">Island upgrades</h3>
        {UPGRADES.map(u => { const has = progress.upgrades.includes(u.id); return <div className="vi-item" key={u.id}><span><strong>{u.name}</strong><small>{u.note}</small></span>
          <button type="button" disabled={has || progress.stardust < u.cost || paused} onClick={() => { const next = buyUpgrade(progress, u.id as UpgradeId); if (next) { setProgress(next); cue("reward"); } }}>{has ? "Built" : `✦ ${u.cost}`}</button></div>; })}
        {saveSection}
      </> : menu === "reward" ? (outcome && result ? <div className="vi-reward">
        <div className={`vi-reveal ${reducedMotion ? "" : "vi-pop"}`}><PixelIcon name={outcome.name} size={104} /></div>
        <h3>{outcome.name}</h3><p><b>{rf(outcome.reward)}</b> · {outcome.chanceBps / 100}% drop</p>
        <p className="vi-small">RF loot never expires. It is stored with your Friend.</p>
        <div className="vi-row vi-center"><button type="button" disabled={busy || paused} onClick={closeReward}>Keep in loot bag</button>
          <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => void act(() => client.redeem(result.outcomeId!, 1n), "reward", () => { closeReward(); say(`Redeemed ${rf(outcome.reward)} (simulated).`); })}>Redeem · {rf(outcome.reward)}</button></div>
      </div> : <div className="vi-reward"><p>The vault is still sealing your loot.</p><button type="button" className="rf-frame-primary" disabled={busy || paused || !result} onClick={() => void act(async () => { if (result) setResult(await client.settle(result.id)); })}>Resume opening</button></div>)
      : menu === "loot" ? <>
        <p>RF loot keeps its fixed value with no expiry.</p>
        {definition.outcomes.map((o, i) => <div className="vi-item" key={o.name}><span className="vi-icon"><PixelIcon name={o.name} size={30} /></span>
          <span className="vi-grow"><strong>{o.name}</strong><small>{snapshot.inventory[i].toString()} owned · {rf(o.reward)} each</small></span>
          <button type="button" disabled={busy || paused || snapshot.inventory[i] === 0n} onClick={() => void act(() => client.redeem(i + 1, 1n), "reward")}>Redeem 1</button></div>)}
      </> : <>
        <button type="button" aria-pressed={!muted} onClick={() => { const n = !muted; setMuted(n); sound.current?.setMuted(n); if (!n) void sound.current?.unlock(); }}>{muted ? "Sound off" : "Sound on"}</button>
        <label className="vi-check"><input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} /> Reduce motion (still camera, no bobbing, clouds, trails or flashing)</label>
        <label className="vi-check"><input type="checkbox" checked={lowGfx} onChange={e => setLowGfx(e.target.checked)} /> Low graphics (no shadows, lower resolution, smoother on older phones)</label>
        <label className="vi-check"><input type="checkbox" checked={progress.clock === "demo"} onChange={e => { const c: Clock = e.target.checked ? "demo" : "real"; setProgress(p => switchClock(p, c, Date.now())); }} /> Demo clock: 1 day = 5 minutes, 60s recharges. Turn off for real days and 3 minute recharges. Switching resets the streak.</label>
        {saveSection}
        <p className="vi-small">RF, keys, loot and redemptions are simulated. Stardust has no RF value. Wallet and Friend ownership are verified by FriendSDK.</p>
      </>}
      {error && menu !== "reward" && <p className="vi-error" role="alert">{error}</p>}
      {busy && <p className="vi-small" role="status">Waiting for confirmation…</p>}
    </GameMenu>}
  </section>;
}
void STATIONS;
