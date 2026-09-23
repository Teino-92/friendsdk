# Vault Island

A 3D floating island where your Rare Friend walks between five stations, plays
skill mini-games, decorates its own island, and cracks an RF vault.

Built with **FriendSDK v0.1.2** and three.js 0.169.0. All RF, keys, loot and
redemptions are **simulated**. Playing requires a wallet on Robinhood mainnet
(chain 4663) holding a hardwired Rare Friends Generations NFT (generation ≥ 1).
The SDK runtime handles wallet connection, Friend selection and ownership checks.

## Run it

From the FriendSDK root (Node.js 22+):

```sh
npm ci
npm i three@0.169.0 @types/three@0.169.0
npm run build
npm run dev:game -- games/vault-island
```

Open `http://localhost:4173`. Static build:
`node scripts/dev-game.mjs build games/vault-island`, then upload
`games/vault-island/.friendsdk/` to any HTTPS static host (GitHub Pages works).

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Walk | WASD or arrows, or click the ground | Tap the ground |
| Go to a station | Click its floating label | Tap its label |
| Use station | E | Tap the yellow prompt |
| Crystal Echo | Keys 1 to 4 | Tap crystals |
| Star Rain | A / D or arrows | Drag or tap |
| Vault Lock | Space or Enter | Tap Stop |
| Decorate: place | Click | Tap to aim, then Place |
| Decorate: rotate / exit | R / Esc | ⟳ / Done |

Walking uses A* pathfinding around trees, rocks and decorations. A ground
cursor follows the mouse: white on free ground, red when blocked, a gold ring
around a station, and a pulsing gold ring on the chosen destination.

Settings: sound (off by default), reduce motion, low graphics (no shadows,
lower resolution; on automatically in automated test browsers), demo clock,
and save code load.

## Two layers, kept separate

**RF layer (chance).** Keys cost RF. The vault outcome comes only from the
chance game. Skill never changes the amount. RF loot never expires.

**Stardust layer (skill).** Earned in mini-games. No RF value. It carries the
difficulty, the timers, the decorations and the reasons to come back.

## Stations

Each station has a floating label, always visible, with live status
(keys owned, "ready" or recharge time, vault charges).

| Station | What happens |
| --- | --- |
| Key merchant | Buy Vault Keys with RF |
| Crystal Echo | Memory game. Starts at 3 crystals, +1 per round, faster each round, a time limit per press. 10 base Stardust per round |
| Star Rain | 30 seconds. Catch stars, dodge rocks, 3 hits and out. Speed and rock rate rise over time. 4 base Stardust per star |
| The vault | Pick a 3-pin lock (faster cursor, smaller zone each pin), then the chance game reveals loot. +20 base Stardust. Failure jams the vault and keeps the key |
| Island workshop | Buy decorations and upgrades with Stardust. Create or load a save code |

## Decorations

Bought any number of times, then placed anywhere allowed, on a 0.25 grid, in
4 rotations. "Move" picks a placed decoration back up. Up to 40 per island.

| Decoration | Stardust |
| --- | --- |
| Flower patch | 15 |
| Round bush | 20 |
| Lantern | 25 |
| Bench | 30 |
| Cherry tree | 45 |
| Glow crystal | 60 |
| Fountain | 120 |

Placement rules, each with a visible reason: not over the edge, not on a path,
not next to a station, not on another object, not on the Friend, and never in
a spot that would cut the walking route to any station.

One-off upgrades: Sky islet (220) and Star trail behind the Friend (300).

## Anti-spam and retention rules

| Rule | Demo clock (default) | Real clock |
| --- | --- | --- |
| Day length | 5 minutes | 24 hours |
| Mini-game recharge | 60 s per station | 3 min per station |
| Vault jam after a failed lock | 45 s | 2 min |
| Vault charges | 5 per day | 5 per day |
| Streak bonus | +10% Stardust per consecutive day, max x2 | same |
| Skipped day | Streak resets. Unspent Stardust loses 25% per missed day | same |

Island level = Stardust spent / 100. Higher levels mean faster Echo playback
and shorter press time, more rocks in Star Rain, and a faster lock pick.

## Save codes

The SDK sandbox blocks localStorage and IndexedDB, so the island travels as a
password-style code (prefix `VI2`), created in the workshop or Settings. It
stores Stardust, streak, bests, cooldowns, last visit day, upgrades, unplaced
decorations and every placed decoration with its exact position and rotation.
It carries a checksum and is locked to one Friend ID. Loading a code applies
every day you skipped. Stardust has no RF value, so editing a code can only
change cosmetics. A real SDK storage API would replace this.

## Exact RF economy

| Rule | Value |
| --- | --- |
| Vault Key price | 1 RF (`1000000000000000000`) |
| Crystal dust | 55% / 5,500 bps · 0.2 RF |
| Silver coin | 30% / 3,000 bps · 1 RF |
| Gold bar | 11% / 1,100 bps · 2 RF |
| Ruby | 3.5% / 350 bps · 5 RF |
| Friend crown | 0.5% / 50 bps · 20 RF |
| Expected reward | 0.905 RF per key |
| Consumable | 1 key = 1 vault opening = 1 loot item |
| Backing | Each purchased or pending key reserves 20 RF; kept loot reserves its value |
| Redemption | Fixed value, no expiry |

## Assets

All 3D models are built in code from primitive shapes. Loot icons are original
8×8 pixel art. The Friend is its canonical 16×16 sprite from the SDK sprite
reader, unmodified, drawn on an upright billboard with a silhouette shadow.
Sounds come from the SDK sound kit. Dependency: three.js 0.169.0 (MIT).

## Known limits

- The RF ledger resets on reload (SDK v0.1 has no persistence). Stardust and
  the island survive through save codes.
- The Stardust clock trusts the device time.
- Tested in headless Chromium with software WebGL at 3 to 7 fps. Real GPU
  frame rate not yet measured.
