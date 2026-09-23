/** Stardust progression: skill currency with NO RF value. Pure functions, easy to test. */
/** Decorations: bought any number of times, then placed anywhere the island allows. */
export const DECOR = [
  { id: "flowers", name: "Flower patch", cost: 15, r: 0.35 },
  { id: "bush", name: "Round bush", cost: 20, r: 0.4 },
  { id: "lantern", name: "Lantern", cost: 25, r: 0.25 },
  { id: "bench", name: "Bench", cost: 30, r: 0.5 },
  { id: "cherry", name: "Cherry tree", cost: 45, r: 0.45 },
  { id: "crystal", name: "Glow crystal", cost: 60, r: 0.35 },
  { id: "fountain", name: "Fountain", cost: 120, r: 0.85 },
] as const;
export type DecorId = typeof DECOR[number]["id"];
export type Placed = Readonly<{ t: DecorId; x: number; z: number; rot: number }>;
export const MAX_DECOR = 40;
/** One-off island upgrades that are not placed. */
export const UPGRADES = [
  { id: "islet", name: "Sky islet", cost: 220, note: "A small floating islet joins your sky." },
  { id: "trail", name: "Star trail", cost: 300, note: "Your Friend leaves stars wherever it walks." },
] as const;
export type UpgradeId = typeof UPGRADES[number]["id"];
export type Clock = "demo" | "real";

export const DAY_MS: Record<Clock, number> = { demo: 5 * 60_000, real: 86_400_000 };
export const COOLDOWN_MS: Record<Clock, number> = { demo: 60_000, real: 180_000 };
export const JAM_MS: Record<Clock, number> = { demo: 45_000, real: 120_000 };
export const VAULT_CHARGES = 5, EVAPORATION = 0.25, MAX_STREAK_BONUS = 10;

export type Progress = Readonly<{
  v: 2; friend: string; name: string; clock: Clock; stardust: number; streak: number; lastPlayDay: number | null;
  upgrades: readonly UpgradeId[]; decor: readonly Placed[]; stash: Readonly<Record<DecorId, number>>; spent: number; bestEcho: number; bestRain: number;
  charges: number; chargesDay: number; firstDay: number; ready: Readonly<{ echo: number; rain: number }>; jammedUntil: number;
}>;

export const dayOf = (clock: Clock, now: number) => Math.floor(now / DAY_MS[clock]);
export const msToDawn = (clock: Clock, now: number) => DAY_MS[clock] - (now % DAY_MS[clock]);
export const multiplier = (p: Progress) => 1 + 0.1 * Math.min(p.streak, MAX_STREAK_BONUS);
export const level = (p: Progress) => Math.floor(p.spent / 100);
const emptyStash = () => Object.fromEntries(DECOR.map(d => [d.id, 0])) as Record<DecorId, number>;

export function freshProgress(friend: bigint, clock: Clock, now: number): Progress {
  return { v: 2, friend: friend.toString(), name: "", clock, stardust: 0, streak: 0, lastPlayDay: null, upgrades: [], decor: [], stash: emptyStash(), spent: 0, bestEcho: 0, bestRain: 0,
    charges: VAULT_CHARGES, chargesDay: dayOf(clock, now), firstDay: dayOf(clock, now), ready: { echo: 0, rain: 0 }, jammedUntil: 0 };
}

/** New day: refill vault charges. Skipped days: streak resets and unspent Stardust evaporates 25% per missed day. */
export function rollover(p: Progress, now: number): { next: Progress; lost: number; missed: number; streakLost: number } {
  const today = dayOf(p.clock, now); let next: Progress = p; let lost = 0, missed = 0, streakLost = 0;
  if (p.chargesDay !== today) next = { ...next, charges: VAULT_CHARGES, chargesDay: today };
  if (p.lastPlayDay !== null && today - p.lastPlayDay >= 2) {
    missed = today - p.lastPlayDay - 1;
    const keep = Math.floor(p.stardust * (1 - EVAPORATION) ** missed);
    lost = p.stardust - keep; streakLost = p.streak;
    next = { ...next, stardust: keep, streak: 0, lastPlayDay: today - 1 };
  }
  return { next, lost, missed, streakLost };
}

/** Any finished mini-game counts as today's visit, then Stardust is paid with the streak multiplier. */
export function earn(p: Progress, base: number, now: number): { next: Progress; gained: number } {
  const today = dayOf(p.clock, now);
  const streak = p.lastPlayDay === today ? p.streak : p.lastPlayDay === today - 1 ? p.streak + 1 : 1;
  const counted: Progress = { ...p, streak, lastPlayDay: today };
  const gained = Math.round(base * multiplier(counted));
  return { next: { ...counted, stardust: counted.stardust + gained }, gained };
}

export function buyUpgrade(p: Progress, id: UpgradeId): Progress | null {
  const item = UPGRADES.find(u => u.id === id);
  if (!item || p.upgrades.includes(id) || p.stardust < item.cost) return null;
  return { ...p, stardust: p.stardust - item.cost, spent: p.spent + item.cost, upgrades: [...p.upgrades, id] };
}
export function buyDecor(p: Progress, id: DecorId): Progress | null {
  const item = DECOR.find(d => d.id === id); if (!item || p.stardust < item.cost) return null;
  return { ...p, stardust: p.stardust - item.cost, spent: p.spent + item.cost, stash: { ...p.stash, [id]: p.stash[id] + 1 } };
}
export function placeDecor(p: Progress, item: Placed): Progress | null {
  if (p.stash[item.t] <= 0 || p.decor.length >= MAX_DECOR) return null;
  return { ...p, stash: { ...p.stash, [item.t]: p.stash[item.t] - 1 }, decor: [...p.decor, item] };
}
export function pickUpDecor(p: Progress, index: number): Progress | null {
  const item = p.decor[index]; if (!item) return null;
  return { ...p, stash: { ...p.stash, [item.t]: p.stash[item.t] + 1 }, decor: p.decor.filter((_, i) => i !== index) };
}

export function switchClock(p: Progress, clock: Clock, now: number): Progress {
  return { ...p, clock, lastPlayDay: null, streak: 0, charges: VAULT_CHARGES, chargesDay: dayOf(clock, now), firstDay: dayOf(clock, now) };
}

/* ---------- Save code: the sandbox has no storage, so the player keeps a password-style code ---------- */
function checksum(text: string) {
  let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
export function encodeSave(p: Progress): string {
  const json = JSON.stringify({ ...p, decor: p.decor.map(d => [DECOR.findIndex(x => x.id === d.t), Math.round(d.x * 4), Math.round(d.z * 4), d.rot]),
    stash: DECOR.map(d => p.stash[d.id]) }); const body = btoa(unescape(encodeURIComponent(json)));
  return `VI2.${body}.${checksum(json)}`;
}
export function decodeSave(code: string, friend: bigint): Progress {
  const [tag, body, sum] = code.trim().split(".");
  if (tag !== "VI2" || !body || !sum) throw new Error("That is not a Vault Island save code (this version uses codes starting with VI2).");
  let json: string; try { json = decodeURIComponent(escape(atob(body))); } catch { throw new Error("The save code is damaged."); }
  if (checksum(json) !== sum) throw new Error("The save code is damaged or was edited.");
  const packed = JSON.parse(json) as Omit<Partial<Progress>, "decor" | "stash"> & { decor?: unknown; stash?: unknown };
  const decor = Array.isArray(packed.decor) && packed.decor.length <= MAX_DECOR && packed.decor.every(d => Array.isArray(d) && d.length === 4 && d.every(n => Number.isInteger(n)) &&
    DECOR[d[0]] !== undefined && Math.abs(d[1]) <= 48 && Math.abs(d[2]) <= 48 && d[3] >= 0 && d[3] < 4)
    ? (packed.decor as number[][]).map(([i, x, z, rot]) => ({ t: DECOR[i].id, x: x / 4, z: z / 4, rot })) : null;
  const stash = Array.isArray(packed.stash) && packed.stash.length === DECOR.length && packed.stash.every(n => Number.isInteger(n) && n >= 0 && n < 1000)
    ? Object.fromEntries(DECOR.map((d, i) => [d.id, (packed.stash as number[])[i]])) as Record<DecorId, number> : null;
  if (!decor || !stash) throw new Error("The save code is incomplete.");
  const name = typeof packed.name === "string" ? packed.name.slice(0, 16) : "";
  const raw = { ...packed, decor, stash, name } as Partial<Progress>;
  const ids = new Set<string>(UPGRADES.map(u => u.id));
  const ok = raw.v === 2 && typeof raw.friend === "string" && (raw.clock === "demo" || raw.clock === "real") &&
    [raw.stardust, raw.streak, raw.bestEcho, raw.bestRain, raw.charges, raw.chargesDay, raw.firstDay, raw.jammedUntil, raw.spent].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) &&
    (raw.lastPlayDay === null || typeof raw.lastPlayDay === "number") && Array.isArray(raw.upgrades) && raw.upgrades.every(u => ids.has(u)) &&
    typeof raw.ready?.echo === "number" && typeof raw.ready?.rain === "number";
  if (!ok) throw new Error("The save code is incomplete.");
  if (raw.friend !== friend.toString()) throw new Error(`This island belongs to Friend #${raw.friend}. Select that Friend to load it.`);
  return raw as Progress;
}

export const MAX_NAME = 16;
/** Local nickname only: the NFT and its artwork are never modified. */
export function renameFriend(p: Progress, name: string): Progress {
  return { ...p, name: name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) };
}
