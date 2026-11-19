# Balance changelog (update 2, SPEC2 §8)

The one documentation file SPEC2 §8.4 exempts. Every data change, why, and the matrix numbers before and
after it. Raw outputs are reproducible with the scripts in this folder:

```
node scripts/balance/run.mjs scripts/balance/campaign.js out-E.json "profs=casual,pro,novice"   # E + snapshots
node scripts/balance/runall.mjs out-AB.json 6 "m=A,Apro,B"                                      # matrices (sharded)
node scripts/balance/runall.mjs out-CDFG.json 6 "m=C,D,F,G"
node scripts/balance/run.mjs scripts/balance/calibrate.js out-cal.json                          # gauntlet T
node scripts/balance/run.mjs scripts/balance/distinct.js out-X.json                             # gauntlets + bosses
node scripts/balance/run.mjs scripts/balance/matrices.js det-low.json "m=Apro&quality=low"      # determinism
node scripts/balance/eval.mjs --m out-AB.json,out-CDFG.json --e out-E.json --x out-X.json --det det-low.json,det-high.json,det-high2.json
```

Method notes
- Snapshots (`snapshots.json`): casual bot, seed 1, Pip + Thunderclap, crates never, fresh save, greedy cheapest
  of damage / rate / squad / tier after each run (`campaign.js`, copied from the design probe). It never buys
  `tier`, so every matrix run starts at Mk I. The casual campaign clears every level first try both before and
  after balance, so the snapshots did not change and were not regenerated.
- A cell = one (hero, weapon, level, seed); attempts = runs until the first win, `tries + 1` when never won.
- Matrices run sharded (6 pages). One page playing ~1,500 runs slowed to a crawl (memory growth) and was
  stopped after 40 min; a shard plays ~250 runs in under a minute.
- Gauntlet ranks are tie-aware (a tie never helps or hurts by list order).
- Gauntlet bot: casual (the pro bot has no dice, so seeds 1-3 would be one run three times).

## Baseline (HEAD 59805aa data)

| criterion | result |
|---|---|
| A (7 weapons x Pip, casual s1-3, <= 4) | FAIL 310/315; attempts 362 (Void 84, Ember 51, others 45-46). Never won: Void L6 s3, L9 s2, L10 s2, L14 s2, L14 s3 |
| A-pro | FAIL Void 12/15 first try (L8, L10, L11 lost twice); others 15/15 |
| B (heroes x Thunderclap) | FAIL 264/270; attempts 309. Never won: L15 Cinder s1, Bonbon s1/s3, Vex s1-s3 (Tempest King x0.55) |
| C (heroes x favourite) | FAIL 268/270; Vex + Void L9 s1, L14 s3 |
| D (42 loadouts, L4/8/12/15) | FAIL 327/336; attempts 408 (Void L8/L12, Thunderclap L15) |
| E campaign | PASS pro 15/15 first, casual 15/15 first, novice clears L1-4 |
| F novice L1-4 | PASS 28/28 (32 attempts) |
| G crates always | PASS 252/252 (262 attempts) |
| spread +-25% | FAIL Void 84 vs median 46 |
| single best <= 6 | PASS |
| favours >= 10/15 | FAIL 9/15 (helped by Void losing on levels it is not favoured on) |
| abilities >= 2 / level | FAIL pip 1.24, cinder 1.96, rime 1.06, bonbon 0.95, bolt 1.62, vex 1.02 |
| Vex +6, Bonbon +25%, hero attempts / arena / ability share, effects > 0 | PASS |
| weapon gauntlets | FAIL 10 ok, 10 failing (first calibration) |
| hero gauntlets | FAIL 9 ok, 7 failing |
| bosses (Spectra fastest, Ember slow, Gearworks on Ironhorn, Thunderclap on Tempest King, <= 75 s) | PASS (max 14.4 s) |

## Round 1: Void Siphon could not finish L6-L14; heroes without a Thunderclap bonus lost L15

| file | change | limit |
|---|---|---|
| matchups | voidsiphon grunt 1.2 -> 1.4, runner 1.2 -> 1.4, tank 0.6 -> 0.7, shield 1.0 -> 1.2, bomber 1.0 -> 1.2 | knob 1; strong >= 1.2 / weak <= 0.85 kept |
| weapons | voidsiphon dmg x1.25 (K 0.75 -> 0.9375), coreR x1.3, pullR x1.15, range 26 -> 32 | +-30% |
| weapons | voidsiphon visualCap 12 -> 15, mergeR 3 -> 2.4 (more, smaller holes; `holeMax` is hard-coded 6 in zones.js, so it stayed) | +-30% |
| weapons | voidsiphon orb speed 16 -> 20.8, range 32 -> 33.8 | +-30% |
| matchups | thunderclap vs tempestking 0.55 -> 0.7 (still weak; 0.75 would tie Sugar Rush, so 0.7 keeps Thunderclap 2nd slowest) | knob 1 |
| heroes | Meteor Drop recharge 24 -> 18 s, Deploy Fortress 28 -> 20 s; HERO_BAR_MAX.recharge 20 -> 18 | +-30% |

Tried and reverted in this round: Rally 20 -> 14 s, Whiteout 30 -> 21 s, Sugar Shield 26 -> 18 s, Shockwave 22 -> 16 s
(uses per level moved only 1.24 -> 1.33, 1.06 -> 1.3, 0.95 -> 1.0, 1.02 -> 1.06: the bot's triggers, not the
recharge, limit them; see "Not met").

Void-only check after each step (A + A-pro + D for Void): attempts 84 -> 60 -> 56 -> 51 -> 46; A-pro 12 -> 14 -> 15/15.
Full run after round 1: A PASS 315/315 (323 attempts), A-pro PASS, B PASS 270/270 (282), C PASS (272), D PASS (348),
F PASS, G PASS (254), E PASS, spread PASS (median 45, Void 46, Ember 51), favours 8/15, abilities cinder 2.0 / bolt 2.02.

## Round 2: crowd weapons and the gauntlets

| file | change | limit |
|---|---|---|
| weapons | emberstorm gameplay range x1.4 (22-30 -> 31-42; the visible cone column is unchanged; cut back in round 5), flame speed 30 -> 39 | range +-60%, speed +-30% |
| weapons | sugarrush lobTime 0.8 -> 0.4 s (0.5 s in round 5), throw x1.3 (18-26 -> 23-34), jitter 0.6 -> 0.78, splashR x1.25 | lob / throw +-60%, others +-30% |
| weapons | voidsiphon holeTime x0.7, pullR to x1.3 of the start values | +-30% |
| matchups | emberstorm grunt 1.2 -> 1.6, bomber 1.3 -> 1.6; sugarrush grunt 1.2 -> 1.5, shield 1.2 -> 1.6, bomber 1.2 -> 1.5; spectra tank 1.4 -> 1.7, shield 1.0 -> 0.9; gearworks shield 1.0 -> 1.6; thunderclap shield 1.0 -> 0.9; glacier tank 0.75 -> 0.5 | knob 1 |

Why the lob: every bomb from a lane band aims at that band's nearest enemy, so with a 0.8 s flight ~95 bombs
in the air all landed on the same few targets (grunt gauntlet: Sugar Rush lost 23 of 60 where Thunderclap lost 0).
At 0.4 s it lost 0-2.
After round 2: A PASS (318 attempts), all win matrices PASS, favours 7/15, weapon gauntlets 12 ok / 8 failing.

## Round 3: Emberstorm and Void Siphon still trailed on L10-L14

| file | change | limit |
|---|---|---|
| weapons | emberstorm dmg x1.15 (K 0.85 -> 0.9775) | +-30% |
| weapons | voidsiphon dmg to x1.3 of start (K 0.975) | +-30% (at the limit) |
| matchups | voidsiphon grunt 1.4 -> 1.6, runner 1.4 -> 1.6 | knob 1 |

After round 3: A PASS 315/315 with 315 attempts (every cell first try), spread PASS (all 45), favours 6/15.
Emberstorm is still the slowest or 2nd slowest boss killer on all 5 bosses.

## Round 4: reach, a few gauntlet cells, hero lists, calibration

| file | change | limit |
|---|---|---|
| weapons | gearworks gear speed 36 -> 46.8, range 42 -> 54.6 (it lost the ladder gates on L13 because hordes were still alive) | +-30% |
| matchups | glacier grunt 1.0 -> 0.9 (not a listed matchup); sugarrush runner 0.75 -> 0.6 (weak: the 0.4 s lob made runners easy); gearworks shield 1.6 -> 2.0 | knob 1 |
| heroes | strong / weak lists edited to the hero gauntlet ranks (SPEC2 §8.3 allows this), see below | - |
| gauntlets.json | recalibrated with a grid rule (below) | - |

Tried and reverted: emberstorm range x1.6 (no criterion moved); voidsiphon tank 0.85 / shield 1.5 (Void L10 got worse).

Hero list edits (hero gauntlets: Thunderclap, ability on, Mk III, squad 60 + start bonus):
- Pip weak: tank -> tempestking ("its favourite, Thunderclap, is weak against the storm lord"). Pip ranked top 3
  on every gauntlet (Steady Aim +10% rate), so no enemy type is a measured weakness.
- Rime strong: runner (#4) -> grunt (#1) + shield (#2), keeps oculon; weak: grunt (#1) -> bomber (#6).
- Bonbon strong: bomber (#5), shield (#5) -> mothermurk ("Sugar Shield blocks the goo puddles"); Bonbon is
  5th-6th on every gauntlet, its strength is coins.
- Bolt strong: tank (#5) -> bomber (#3 tie); keeps ironhorn.
- Vex weak: runner (#1) -> grunt (slowest clear, 6th); keeps oculon.

Gauntlet calibration: the ref loss is step-shaped in T (hits-to-kill thresholds), so several T fit 30-50%.
`calibrate.js` scans 40 log-spaced T in [0.3, 400], takes the T whose ref loss is closest to 40% (the largest
on a tie) and bisects when a step jumps over the band. Result: grunt 0.908 (ref 36.7%), runner 10.954 (41.2%),
shield 36.342 (45.5%), tank 17.374 (41.7%), bomber 400 (31.2%; ref loss saturates at ~31% from T 159 up).

## Round 5: two acceptance tests pinned values

`npm run test:u2` after round 4 failed two weapon scenarios because of balance values:
- `weapons-emberstorm.js` checks that an enemy 32 u ahead is never hit at Mk III. Emberstorm gameplay range
  31-42 -> 25, 27, 29, 31, 34 (x1.12 of the start values; Mk III 29).
- `weapons-sugarrush.js` checks that one landing splashes all 5 enemies inside the splash. The 0.4 s lob missed
  one (0.6 s too; 0.5 s and 0.8 s pass). lobTime 0.4 -> 0.5 s (-37.5%, within +-60%).

| criterion | round 4 | round 5 |
|---|---|---|
| A attempts | 317 | 320 |
| F attempts | 37 | 43 (Emberstorm L4 s1 needs 5, the limit) |
| spread | median 45, max 47 | median 45, max 49 (Sugar Rush) |
| favours | 6/15 | 9/15 (11/15 with boss seconds as a third key) |
| weapon gauntlets | 15 ok, 5 failing | 15 ok, 5 failing (Sugar Rush grunt now passes, Emberstorm grunt fails again) |

## Final (round 5 data; `results.json`)

| criterion | result |
|---|---|
| A | PASS 315/315; attempts 320 (Emberstorm L10 s2: 2, Sugar Rush L2 s1: 2, L2 s2: 3, L14 s3: 2) |
| A-pro | PASS 15/15 first try for every weapon |
| B | PASS 270/270; attempts 278 |
| C | PASS 270/270; attempts 273 |
| D | PASS 336/336; attempts 340 |
| E | PASS pro 15/15 first; casual 15/15 first; novice clears L1-4 (L10 2, L12 3) |
| F | PASS 28/28; attempts 43 (Emberstorm L4 5 tries, Sugar Rush L2 4) |
| G | PASS 252/252; attempts 253 |
| spread +-25% | PASS median 45; Sugar Rush 49, Emberstorm 46, others 45 |
| single best <= 6/15 | PASS max 2 (Sugar Rush, Gearworks) |
| favours >= 10/15 | FAIL 9/15 (11/15 with boss seconds as a third key, information only) |
| abilities >= 2 / level | FAIL pip 1.13, cinder 2.02, rime 1.07, bonbon 0.89, bolt 2.02, vex 0.85 |
| Vex +6 | PASS |
| Bonbon +25% | PASS (paid / result coins 1.25 vs Pip 1.00) |
| hero attempts <= 1.5x median | PASS median 46, max 49 (Cinder) |
| hero arena squad <= 1.5x median | PASS median 778.5, max 853 (Vex) |
| ability share of kills <= 35% | PASS max 2% (Bolt) |
| every ability effect > 0 | PASS rally +910, meteor 92 kills, whiteout 4,495 frozen, shield 43 blocked, fortress 1,519 kills, shockwave 1,519 pushed |
| weapon gauntlets | FAIL 15 ok; failing: Emberstorm strong grunt (#4), Glacier strong shield (#4), Glacier weak tank (3rd from the bottom is needed, it is 4th), Sugar Rush strong bomber (#5), Void strong grunt (#5) |
| hero gauntlets | PASS 14/14 (after the list edits) |
| bosses | PASS Spectra fastest 5/5; Ember slowest / 2nd 5/5; Gearworks 2nd on Ironhorn (6.2 s vs Spectra 6.0); Thunderclap 2nd slowest on Tempest King (12.3 vs Ember 12.6); max 13.5 s |
| determinism | PASS A-pro identical on Low, High and High again (fresh pages) |

Void Siphon boss damage re-measured (Grawlstone, Mk III, 30 raiders, squad invulnerable, 6 s): 180.7 / s vs sheet
181.2 (ratio 1.00). Spectra 1.00, Glacier 1.00, Sugar Rush 0.99, Emberstorm 0.99, Gearworks 1.10 (mini turrets),
Thunderclap 1.15 (Pip's favourite +15%).

## Round 6 (fix pass after review): Emberstorm on floods, strong / weak lists match the gauntlets

Review found five weapon gauntlet cells that contradict the Armory (`results.json` round 5). The grunt, shield and
bomber cells are reach- or saturation-limited, so only one could be moved with a knob:
- `VS.emberstorm.grunt` 1.6 -> 1.8 (knob 1). Emberstorm on the 400-grunt flood: lost 1.7 / 6.6 s (#4) -> 0 / 6.5 s
  (#3). Tried 2.0 (0 / 6.2 s, but matrix F failed: novice Emberstorm L4 s1 not won in 5) and 2.2 (0.3 lost).
- Probes that did not move a rank (reverted): `VS.voidsiphon.grunt` 1.6 -> 2.0 (Void #5 -> #4, clear 7.1 s is
  orb-flight limited), `VS.glacier.shield` 1.0 -> 1.3 (2.3 -> 2.7 lost), `VS.sugarrush.bomber` 1.5 -> 1.9 (24.7 lost
  both: the bomber gauntlet saturates), `VS.sugarrush.grunt` 1.5 -> 2.1 (7.5 s both: lob limited).
- List edits instead (data only; no gameplay change): Glacier strong drops Shieldbearer (#4) and weak swaps Bulwark
  (#3 best) for Fizzbomb (#7, "one shard at a time cannot stop a Fizzbomb pack"); Sugar Rush strong drops Murkling
  (now #4 behind Emberstorm) and Fizzbomb (#5) and keeps Shieldbearer; Void Siphon strong swaps Murkling (#5) for
  Shieldbearer (#1, "the crush goes straight through shields").
- Also in this pass (not balance data, but they change runs): an ability can no longer be used while a beaten boss
  plays its death animation (`HeroSystem.usable()`).

| criterion | round 5 | round 6 |
|---|---|---|
| A attempts | 320 | 320 (Emberstorm L10 s2: 2) |
| F attempts | 43 | 41 (Emberstorm L4 s1: 3) |
| B / C / D / G | 278 / 273 / 340 / 253 | 278 / 273 / 340 / 253 |
| E | pass | pass (unchanged) |
| spread | median 45, max 49 | median 45, max 49 (Sugar Rush), Emberstorm 46 |
| single best | max 2 | max 2 |
| favours >= 10/15 | FAIL 9/15 | FAIL 9/15 (11/15 with boss seconds) |
| abilities >= 2 / level | FAIL | FAIL (pip 1.13, cinder 1.98, rime 1.0, bonbon 0.85, bolt 2.02, vex 0.85) |
| weapon gauntlets | FAIL, 5 failing | PASS 17 ok, none failing |
| hero gauntlets | PASS 14/14 | PASS 14/14 |
| bosses | PASS | PASS (unchanged) |
| determinism | PASS | PASS |

What the gauntlets and matrices say, plainly: with the snapshot upgrades every weapon wins every level (pro bot first
try everywhere, casual 315/315 cells). The weapon pick changes how fast a fight goes and how many raiders are lost,
not whether a level can be won.

## Not met (needs code or a spec decision)

- Favours: every cell now wins first try, and arena squads sit at the 999 cap on L7-L9 and for most weapons on L14,
  so (attempts, arena squad) ties on L1, L7, L8 and cannot favour anyone on L14. The favoured weapons of L10
  (Void), L13 (Gearworks) and L14 (Emberstorm, Void) are chosen for the boss, but arena squad measures the run
  phase, where long-range weapons clear hordes before the ladder gates and snowball.
- Ability use: the bot's triggers in `src/game/autopilot2.js` (`abilityWanted`) gate it, not the recharge.
- Weapon gauntlets: the grunt flood is reach-limited (every good weapon loses 0, so clear time decides and the
  long-range weapons finish first); the bomber gauntlet saturates (ref loss 31% at any T >= 159, where no weapon
  can pop a bomber at range); Glacier's pierce goes straight through tank walls even at x0.5.

# Update 3 (stage 3 "make it harder", quick autopilot check)

Base: the integrated stage 3 build (enemies + levels, `ffbb8d7`). REQUEST3 asks for a QUICK check only: 4 levels per
world (3 6 9 10 / 13 16 19 20 / 23 26 29 30 / 33 36 39 40 / 43 46 49 50), 3 loadouts (Pip + Thunderclap, Cinder +
Emberstorm, Titan Vex + Void Siphon), bot seeds 1-3, up to 5 attempts (attempt k = seed + 100 k). Tools:

```
node scripts/balance/run.mjs scripts/balance/campaign3.js out.json "profs=casual"   # 50-level campaign + U[L] (snapshots3.json)
node scripts/balance/run.mjs scripts/balance/quick3.js out.json "profs=casual,pro&seed=1"         # the 20-level matrix
node scripts/balance/run.mjs scripts/balance/quick3.js out.json "profs=novice,casual&ups=none&levels=3,6,9,10,13,16,19,20,23,26,29,30"
node scripts/balance/run.mjs scripts/balance/stars3.js out.json "from=16&to=50"     # star thresholds
```

Upgrades ("camp"): `snapshots3.json` = the upgrades the casual campaign (foundation-campaign seeds and shop rule)
owns before each level. "none" = no upgrades. Shop UPGRADES data, weapons and heroes are untouched.

## What the before numbers showed

The game was far too easy: every bot cleared nearly every sampled level first try, a novice with no upgrades
cleared most of worlds 2-3, and the only walls were L46 (casual) and L50 (pro). Probing why horde toughness
barely mattered found three things that made difficulty knobs useless, plus three autopilot faults:
1. A shield (8 s power token or shield barrel) right before the final rush made every rush enemy die on
   contact (L36: 572 rush kills, 0 losses). Toughness then changes nothing.
2. Horde contact kills one member per enemy, so above a point more hp changes nothing; horde size (capped at
   560 / 600 a horde) and multi-kill enemies (Bulwark 3, Fizzbomb 4, Boomling 8) are the real levers.
3. A world-wide toughness multiplier also hit the first hordes, which meet a 20-30 squad: L43 pro died at 108 u.
4. Pro bot: identical on every seed (jitter 0, react 0), so "pro in 1-3 tries" could only mean first try or
   never (L50 pro lost 3 / 3 with a few % boss hp left).
5. Pro bot: lined up 24 u before every hazard and left its gate / horde line too early on the hazard-dense
   worlds (L22 pro 1 / 4 vs casual 5 / 5, mostly gap and push-off-road losses).
6. Both bots: any danger zone overruled the gate they had picked; on L36 a gumball (kills <= ~24) made them
   give up a x4 gate (~900 members) for +104.

## Changes (data + bot only)

- `src/data/levelgen.js` (levels 16-50):
  - Late toughness ramp `lateTough`: horde toughness x (1 + (W - 1) x progress^1.5), so the early hordes stay as
    they were and the late hordes (and the final rush, progress 1) get the world's full extra toughness. W per
    world: `WORLD_TOUGH` [10, 9, 26, 10] (Forge, Frost, Candy, Citadel); boss / mini levels use `BOSS_TOUGH`
    [1.35, 1.65, 2.5, 2.6] (their boss is the test); intro levels get 15 %; a normal level gets 40 % of the extra
    at the start of its world rising to 100 % at its end (`ramp(i)`).
  - Horde size x `WORLD_COUNT` [1.3, 1.2, 1.5, 1.35] (`BOSS_COUNT` [1.1, 1.15, 1.3, 1.35]) with the same ramp.
  - Expected late squad (gate / barrel sizes) x `WORLD_SMAX` [1, 0.9, 0.55, 0.9]: the Candy Kingdom's ladder rows
    and x2 gates made its squads hit the 999 cap.
  - Extra Bulwark share `WORLD_TANK` [0, 0, 0.12, 0.02].
  - No shield within 130 u before the final rush (power token -> rapid fire, shield barrel -> turret barrel; same
    lane and spot; bossless levels only).
  - L40 Candy Queen hp x0.8 (`BOSS_PLAN` `hpMul`): with the smaller Candy Kingdom squads the pro bot lost
    Cinder + Emberstorm 3 / 3 in w3-bosses-play (boss left at 23-30 %).
  - Stars re-derived (`STARS`, `stars3.js`): 2 stars = casual median finish squad, 3 stars = max(pro median,
    1.3 x that); L46 (no win in the 5 star runs) set by hand next to L47-48.
- `src/data/harder.js`: elite share worlds 4-5 up (`eliteShare` base 0.02 -> 0.04 Candy, 0.05 -> 0.07 Citadel,
  cap 0.15 -> 0.18).
- `src/game/autopilot.js` (test bot only, no game change):
  - pro `jitter` 0 -> 0.1 (a pro retry is not an exact replay), pro hazard look-ahead 24 -> 15 u
    (`PRO_HAZ_LOOK`; L22-29 pro wins 14 / 20 -> 20 / 20, L33-49 9 / 20 -> 14 / 20, L4-19 26 / 28 -> 28 / 28);
  - pro also faces a horde it clearly outnumbers (headcount rule, like casual);
  - a lined-up gate is kept when the only danger in the way is a capped zone (goo shot, gumball) that costs
    less than half the gate's lead over the other gate; gaps / blades / other zones still win;
  - no raise hits are counted for a gate with more than 24 enemies between the squad and its row.
- `src/game/hazards/candy.js`: a gumball's danger zone carries `cap: 24` (the most it kills rolling through).

## Before / after

BEFORE = integrated stage 3 build; AFTER = this commit's data (the star table does not change wins). Each matrix
cell is the number of attempts to win for bot seeds 1 / 2 / 3. BEFORE the pro bot had no seed effect (jitter 0),
so its three digits are always equal.

**BEFORE** (attempts to win, 5 max, X = not won in 5; three digits = bot seeds 1 / 2 / 3)

| bot / loadout | ups | 3 | 6 | 9 | 10 | 13 | 16 | 19 | 20 | 23 | 26 | 29 | 30 | 33 | 36 | 39 | 40 | 43 | 46 | 49 | 50 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual pip/thunderclap | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | XXX | 111 | 111 |
| casual cinder/emberstorm | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | X14 | 111 | 33X |
| casual vex/voidsiphon | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 112 | 111 | 111 | 111 | 111 | 111 | 113 | 111 | 225 |
| pro pip/thunderclap | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | XXX |
| pro cinder/emberstorm | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | XXX |
| pro vex/voidsiphon | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 |
| novice pip/thunderclap | camp | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | X | 1 | 1 |
| novice cinder/emberstorm | camp | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | X | 1 | 5 |
| novice pip/thunderclap | none | 1 | 1 | 1 | 3 | X | 1 | 1 | 2 | 2 | 2 | 1 | X |  |  |  |  |  |  |  |  |
| novice cinder/emberstorm | none | 1 | 1 | 1 | 5 | 1 | 1 | 1 | X | 1 | 1 | 1 | X |  |  |  |  |  |  |  |  |
| casual pip/thunderclap | none | 1 | 1 | 1 | 1 | 3 | 1 | 1 | 1 | 1 | 1 | 1 | X |  |  |  |  |  |  |  |  |
| casual cinder/emberstorm | none | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 2 | 1 | 1 | X |  |  |  |  |  |  |  |  |

| campaign (Pip + Thunderclap, shop rule) | attempts per level 1-50 |
|---|---|
| casual | 1:1 2:1 3:1 4:1 5:1 6:1 7:1 8:1 9:1 10:1 11:1 12:1 13:1 14:1 15:1 16:1 17:1 18:1 19:1 20:1 21:1 22:1 23:1 24:1 25:1 26:1 27:1 28:1 29:1 30:3 31:1 32:1 33:1 34:1 35:1 36:1 37:1 38:1 39:1 40:1 41:1 42:1 43:1 44:1 45:1 46:2 47:1 48:1 49:1 50:1 |
| pro | 1:1 2:1 3:1 4:1 5:1 6:1 7:1 8:1 9:1 10:1 11:1 12:1 13:1 14:1 15:1 16:1 17:1 18:1 19:1 20:1 21:1 22:1 23:1 24:1 25:1 26:1 27:1 28:1 29:1 30:1 31:1 32:1 33:1 34:1 35:1 36:1 37:1 38:1 39:1 40:1 41:1 42:1 43:1 44:1 45:1 46:1 47:1 48:1 49:1 50:X |

**AFTER** (attempts to win, 5 max, X = not won in 5; three digits = bot seeds 1 / 2 / 3)

| bot / loadout | ups | 3 | 6 | 9 | 10 | 13 | 16 | 19 | 20 | 23 | 26 | 29 | 30 | 33 | 36 | 39 | 40 | 43 | 46 | 49 | 50 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual pip/thunderclap | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 212 | 111 | 111 | 111 | 111 | 412 | XXX | 211 | XXX |
| casual cinder/emberstorm | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 113 | 111 | 221 | 111 | 113 | 111 | X15 | 121 | XXX |
| casual vex/voidsiphon | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | XXX | 111 | 111 | 111 | 122 | 111 | 113 | 121 | XXX |
| pro pip/thunderclap | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 321 | 111 | 311 |
| pro cinder/emberstorm | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 212 | 111 | 111 | 111 | 121 | 111 | 111 | 511 | 111 | 111 | 111 | X22 |
| pro vex/voidsiphon | camp | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 112 | 111 | 111 | 111 | 11X | 111 | 111 | 211 | 22X |
| novice pip/thunderclap | camp | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 3 | 2 | 1 | 1 | 1 | 1 | 2 | X | 1 | X |
| novice cinder/emberstorm | camp | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | X | 2 | X |
| novice pip/thunderclap | none | 1 | 1 | 1 | 3 | X | 1 | 2 | 2 | 3 | 5 | X | X |  |  |  |  |  |  |  |  |
| novice cinder/emberstorm | none | 1 | 1 | 1 | 5 | 1 | 1 | 1 | X | X | 3 | X | X |  |  |  |  |  |  |  |  |
| casual pip/thunderclap | none | 1 | 1 | 1 | 1 | 3 | 1 | 1 | 1 | 3 | 1 | 1 | X |  |  |  |  |  |  |  |  |
| casual cinder/emberstorm | none | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | X | 1 | 1 | X |  |  |  |  |  |  |  |  |

| campaign (Pip + Thunderclap, shop rule) | attempts per level 1-50 |
|---|---|
| casual | 1:1 2:1 3:1 4:1 5:1 6:1 7:1 8:1 9:1 10:1 11:1 12:1 13:1 14:1 15:1 16:1 17:1 18:1 19:1 20:1 21:1 22:1 23:1 24:1 25:1 26:1 27:1 28:1 29:1 30:1 31:1 32:1 33:1 34:2 35:1 36:1 37:1 38:1 39:1 40:1 41:1 42:1 43:X 44:2 45:1 46:X 47:1 48:1 49:1 50:X |
| pro | 1:1 2:1 3:1 4:1 5:1 6:1 7:1 8:1 9:1 10:1 11:1 12:1 13:1 14:1 15:1 16:1 17:1 18:1 19:1 20:1 21:1 22:1 23:1 24:1 25:1 26:1 27:1 28:1 29:1 30:1 31:1 32:1 33:1 34:X 35:1 36:1 37:1 38:1 39:1 40:1 41:1 42:X 43:1 44:1 45:1 46:1 47:3 48:1 49:1 50:4 |
| novice | 1:1 2:1 3:1 4:1 5:1 6:1 7:1 8:1 9:1 10:1 11:1 12:1 13:1 14:1 15:1 16:1 17:1 18:1 19:1 20:1 21:1 22:1 23:1 24:1 25:2 26:1 27:2 28:3 29:3 30:2 31:1 32:1 33:1 34:2 35:1 36:1 37:1 38:1 39:1 40:1 41:1 42:1 43:2 44:1 45:X 46:X 47:2 48:X 49:2 50:X |

## Against the targets (AFTER)

| target | result |
|---|---|
| W1: novice clears most levels in 1-2 tries, casual always first try | met: novice 1-2 on every sampled level (L10 2); casual 1 everywhere |
| W2-3: novice fails without upgrades | partly: novice without upgrades loses L13, L20, L23, L29, L30 (and needs 3-5 on L10 / L26); it still clears L16 / L19 |
| W2-3: casual needs some upgrades; with them clears in 1-3 | partly: with campaign upgrades 1-3 everywhere except L30 Vex + Void (XXX); without upgrades casual still clears most of L13-29 (L23 3 / X, L30 X) |
| W2-3: pro first try | met except L23 Cinder (2 / 1 / 2) and L30 Vex (1 / 1 / 2) |
| W4-5: casual with upgrades 2-5 tries, sometimes stalls | partly: the stalls are there (L46, L50; campaign L43 / L46 / L50), L40 / L43 / L49 need 1-4 on some seeds, but L33 / L36 / L39 are still mostly first try |
| W4-5: pro clears in 1-3 | mostly: L40 (Vex) and L50 (Cinder, Vex) have one seed of three not won in 5, L40 Cinder needs 5 on one seed; the pro campaign stalls on L34 and L42 (the casual campaign clears both) |
| L50 the hardest | met: casual never clears it; pro needs 1-4 |

Not met, and why (needs a spec or bot decision):
- The pro and casual bots end up about equally strong on worlds 4-5: on the same level the pro wins about as
  often as the casual bot (ablation of every profile field on L33 / L36 / L43 / L46 / L49 found no single
  handicap that makes casual systematically worse there). A level that is "2-5 tries" for casual is then also
  "1-5" for pro, so the two W4-5 targets cannot both be hit with these bots; I tuned W4-5 for the pro target.
- L46 stalls casual on every seed: its first hazard (a moving platform across the whole road at 60 u, squad
  ~30) drops the whole squad; pro clears it. It is hazard placement (hazardplan.js), not toughness.
- Without upgrades the casual bot still clears most W2-3 levels: horde hp saturates (contact kills 1 member per
  enemy), so more toughness only bites through horde size, which is capped at 560 / 600 per horde (and at 900
  live enemies for phone smoothness). The remaining lever is fewer + gates in W2-3, not tried in this quick pass.
- Not re-checked: ELITE mode (eliteDef scales on top of these numbers), endless / practice (unchanged data).

## Tests whose expectations moved

- `foundation-campaign`: L1-15 rules unchanged (pro <= 2, baseline + 1). L16-30 must still be cleared within 5 by
  both bots, but a stall in L31-50 no longer ends the campaign: casual may stall on <= 5 of them, pro on <= 3,
  and each of L31-50 must be cleared by at least one bot (now: casual stalls L43 / L46 / L50, pro L34 / L42).
- `w3-bosses-play`: pro must still win every boss level within 3; for L40 / L45 / L50 the casual bot is
  reported (`casualHard`) instead of failing the test (the Candy Kingdom / Storm Citadel bosses are meant to beat it).
- `w3-hazards-cc-play`: the four campaigns go on after a stall in L31-50 (pro <= 3, casual <= 5 stalls each), and
  each of L31-50 must be won by at least one of them.
- `w3-hazards-cc-levels`: "pro wiped by the hazards" now fails only when the hazards took >= 60 members; the
  pro bot can lose L46 to its final rush, which is not a hazard failure.
- `w3-harder-levels`: elite share bound 0.15 -> 0.18 (the new world 5 cap).

## Update 3 review (stage 3 fixer, after two independent reviews of `d492a88`)

Corrections to the "Update 3" section above: its claim that the late ramp "keeps the early hordes as they were"
was false at `d492a88` (L33's first horde went 73 x hp 13 -> 92 x hp 27: the x26 ramp still gave p ~0.1 x1.8,
and `WORLD_COUNT` applied to every horde); "horde size is the real lever" did not hold for the late hordes either
(see 1). Both are fixed below.

### What the reviews found (verified) and what changed

1. **Hordes were cut, not played.** `horde.spawnWave` clamped a level horde to `900 - alive`, so with near-unkillable
   late hordes the next horde arrived cut short (L33 rush: 149 of 600; L36: ~310 of 600), and a squad that thinned the
   previous horde met a *bigger* rush. Now (`src/game/horde.js` + `hordewaves.js` `queueOverflow` / `spawnOverflow`)
   the rest waits and comes in as extra blobs as soon as room exists (a horde with hardly any room waits whole and
   keeps its waves). A remainder that would only appear in the last 25 u before the finish is dropped. The final rush
   stays capped at 600 (`RUSH_MAX`): bigger rushes were tried (up to 1000) but could not be played in full - the field
   is still full of the last horde and the rush's held waves until the finish.
2. **Guns stopped mattering at the climax.** Measured (casual seed 1, Pip + Thunderclap, campaign upgrades, from 60 u
   before the final rush): at `d492a88` contact did nearly all the killing (weapon kills L16 83/745, L26 0/750, L36
   13/745, L49 0/538; rush hp L36 25,612). Two causes: the x9-x26 late ramp, and - found here - a packed horde with
   more than ~1 in 30 Fizzbombs + Boomlings is a powder keg (one shot bomb chains through the whole blob), which is
   why toughness had to go so high before it bit at all. Now: `WORLD_TOUGH` [8, 3.5, 9, 6.5] with per-level
   `LEVEL_TUNE`, the explosive share of hordes >= 150 is capped at 3.5% (`capExplosives`), and the opening hordes stay
   close to the old ones: the count factor ramps in from p 0.15 to 0.5 and the late ramp gives p ~0.1 ~3% of its
   extra (first horde, count x hp, at `ffbb8d7` / `d492a88` / now: L33 73 x 13 / 92 x 27 / 61 x 16, L36 64 x 12 /
   88 x 26 / 59 x 16; short levels' hordes are a little smaller, see 7). Result (same probe): killed by something other
   than contact (bullets + the blasts they set off + abilities + helpers) L16 53%, L26 59%, L36 53%, L46 54%
   (`tests/u2/w3-balance-rush.js` keeps it >= 30%); rush hp L36 ~10,000 (was 25,612), L16 ~4,100. Bullet kills
   alone are 2-13% of the window (most of the rest is shot-off blast chains). Upgrades matter again: with no
   upgrades casual and pro lose almost every sampled W4-5 level (L36 / L43 / L46 0 of 6), with campaign upgrades they
   win them.
3. **ELITE stacked on top** (x1.5 count, x1.4 hp, +20% elites, boss x1.5): pro with the end-of-campaign upgrades
   lost elite L33 / L36 / L43 / L50. `src/data/elite.js` is now per world: count x1.5 / 1.5 / 1.45 / 1.15 / 1.15
   (ramping in after the opening hordes, never below normal), hp x1.4 / 1.4 / 1.35 / 1.1 / 1.1, elites +20 / 20 /
   18 / 8 / 6%, boss hp x1.5 / 1.5 / 1.4 / 1.15 / 1.1. Elite runs, U[50] upgrades, Pip + Thunderclap, one try per
   bot seed: pro L16 3/3, L26 3/3, L33 2/3, L36 4/5, L40 3/3, L43 3/3, L46 2/3, L50 2/3; casual L16 2/3, L26 2/3,
   L33 3/3, L36 5/5, L40 3/3, L43 2/3, L46 1/3, L50 3/3. `w3-elite` now checks that pro wins L36 / L40 / L50 ELITE
   within 3 tries.
4. **Stars.** `stars3.js` rule: 2 stars = the LOWER of the casual and pro median finish (the strongest bot's typical
   win earns 2 stars), 3 stars = the 75th percentile of all wins (>= 2 stars + 15%, never above the best sampled
   win, >= 10% of the expected late squad), caps 0.8 / 0.9 x 999. It reports `check.proTwo` / `check.anyThree`
   (all true for L16-50). Medians of an even count are now the mean of the middle two. The table was derived before
   the last L34 / L40 / L43 eases (their stars may be a little generous now); L36 was re-derived by hand after its
   ease ([305, 350]).
   Tooling note: about one smoke-harness run in 30 (scripts/smoke.mjs, many in parallel) never returned; the same
   scenario with the same seeds finished in a streaming runner that pauses the debugger on a stall, so no game loop
   was found. The scratch drivers kill and retry such runs.
5. **L46 platform.** A full-road moving platform (not a lesson) never comes before 130 u (`hazardplan.js`
   `PLATFORM_MIN`); L46's moved from 60 u to 171 u, where the squad is ~100-150 instead of ~30. Casual L46 (Pip,
   campaign upgrades) no longer falls off on every seed: quick matrix 1 / 2 / 2 tries (was X X X); one probe seed still
   fell just after the platform (191 u), the others reached the final rush.
6. **Bot fixes** (`src/game/autopilot.js`, test bot only): the gumball cap is in drawn members (`capDrawn`) and the
   keep-the-gate rule compares real members (x count / drawn); the pro headcount rule counts held waves; a screening
   horde shrinks the raise window by half the time it takes to shoot through it instead of zeroing it.
7. **Level data**: the last gate row of a bossless level sized itself on "no growth left" and offered +3 against a
   raisable ÷2 (the pro bot took the +3 and lost L22 3 of 3); it now sizes like p 0.84. Short levels pack their late
   hordes closer, so their counts scale with (length / 720)^0.6 (L42 met ~1,700 enemies in 100 u). L30 Glacius hp
   x0.9, L40 Candy Queen x0.75, L50 Tempest King x0.75.
8. **HUD**: the "INCOMING!" line moves below a MK UP / NEW WEAPON banner while it shows (it was hidden under it).

### After (this commit; attempts to win, 5 max, X = not won in 5; three digits = bot seeds 1 / 2 / 3)

Campaign upgrades (snapshots3.json re-run with these levels):

| bot / loadout | 3 | 6 | 9 | 10 | 13 | 16 | 19 | 20 | 23 | 26 | 29 | 30 | 33 | 34 | 36 | 39 | 40 | 42 | 43 | 46 | 49 | 50 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual pip/thunderclap | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 141 | 111 | 122 | 111 | 111 |
| casual cinder/emberstorm | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 121 | 111 | 111 | 121* | 111* | 111 | 121* | 5X4 | 114* | XXX | 1X1 | 232 |
| casual vex/voidsiphon | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 121 | 111 | 121 | 21X | 111 | 221* | 111* | 111 | 5X2* | 421 | X5X* | 512 | 121 | 121 |
| pro pip/thunderclap | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 121 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 |
| pro cinder/emberstorm | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 112 | 111 | 111 | 111 | 111 | 43X* | 141* | 111 | 121* | 333 | 2X5* | 111 | 111 | 233 |
| pro vex/voidsiphon | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 222 | 111 | 111 | 312 | 111 | 11X* | 114* | 111 | 2X1* | 311 | 124* | 211 | 111 | 323 |

\* L34 / L40 / L43 were eased once more after this matrix (`LEVEL_TUNE` 0.65 / 0.6 / 0.55 -> 0.4 / 0.45 / 0.4);
re-check (Cinder, Vex): casual L34 111 / 121, L36 111 / 111, L40 111 / X12, L43 133 / X1X; pro L34 411 / 111,
L36 141 / 114, L40 112 / 411, L43 251 / 141. Then L36 1.15 -> 0.9 (the pro bot lost its ELITE version 3 of 3):
one try per seed, L36 Pip casual 5/5, pro 5/5; Cinder casual 3/3, pro 3/3; Vex casual 2/3, pro 2/3.

No upgrades, worlds 1-3 (attempts, 5 max):

| bot / loadout | 3 | 6 | 9 | 10 | 13 | 16 | 19 | 20 | 23 | 26 | 29 | 30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice pip/thunderclap | 111 | 111 | 111 | 34X | XX5 | 111 | 112 | 22X | XXX | 221 | XXX | XXX |
| novice cinder/emberstorm | 111 | 111 | 111 | 513 | 1X1 | 111 | 142 | XXX | XXX | 211 | XXX | XXX |
| casual pip/thunderclap | 111 | 111 | 111 | 111 | 341 | 111 | 111 | 122 | 21X | 111 | 231 | XXX |
| casual cinder/emberstorm | 111 | 111 | 111 | 113 | 21X | 111 | 111 | 11X | XXX | 111 | X3X | XXX |

Campaign (Pip + Thunderclap, shop rule; tries per level, only levels not won first try listed): casual - none;
pro - L42 2; novice - L23 3, L25 5, L34 2, L36 3, L42 3, L45 5, L46-48 X.

### Against the targets (after)

| target | result |
|---|---|
| W1: novice 1-2 tries, casual first try | met (unchanged levels) |
| W2-3: novice fails without upgrades | mostly met: novice without upgrades never clears L23 / L29 / L30, rarely L13 / L20; still clears L16 / L19 / L26 |
| W2-3: casual needs some upgrades, with them 1-3 | partly: with campaign upgrades 1-2 everywhere except L30 Vex (21X); without upgrades casual never clears L30, needs 2-3 or stalls on L13 / L20 / L23 / L29, still clears L16 / L19 / L26 first try |
| W2-3: pro first try | mostly: L23 Cinder / Vex and L30 Vex need 2-3 on some seeds |
| W4-5: casual 2-5 tries, sometimes stalls | partly: Pip + Thunderclap casual is first try almost everywhere (L42 / L46 need 2-4 on one seed); Cinder and Vex need 2-5 and stall on L42 / L43 / L46 / L49 / L40 seeds |
| W4-5: pro 1-3 | mostly: Pip always 1-2; Cinder / Vex have single seeds at 4-5 or X on L34 / L36 / L40 / L43 (noise-level, see the re-check) |
| L50 the hardest | not met as a wall: L50 is 1-3 for every bot (the Tempest King fight is decided by the arena squad: Cinder pro lost 3/3 with a ~325 arena squad and won 3/3 with ~600) |

### Not met / needs a decision

- **The bots are about equally strong on worlds 4-5** (the pro bot is no better at surviving a rush than casual;
  ablating every profile field gave no clean handicap). "Casual 2-5 tries" and "pro 1-3 tries" then cannot both
  hold for the same loadout; this pass keeps pro inside 1-3 and lets the weaker loadouts carry the "2-5 and stalls".
  Pip + Thunderclap (the campaign loadout) is clearly the strongest loadout, so its campaign is first try nearly
  everywhere. Options: make the casual bot weaker on rushes, or accept "hard" = "hard for most loadouts".
- **Bullet kills alone** stay low at the climax (2-13% of the window); counting the blasts the guns set off it is
  53-59%. A reviewer's "guns kill 30-50%" reading needs either softer late hordes (the game gets easy again: with
  `WORLD_TOUGH` 1.5 everything in W2-5 was first try with 800+ squads) or a change to how blasts treat tough enemies.
- **ELITE has no spec target**; this pass uses "pro with end-of-campaign upgrades wins L36 / L40 / L50 elite in 3".
- **Stall budgets** (tests): pro 0 on L31-50 in `foundation-campaign` and `w3-hazards-cc-play` (plus <= 3 tries per
  level in `foundation-campaign`), casual <= 2. Both campaigns currently stall nowhere.
- Not re-run: the frame-time perf gates (integrator). The overflow keeps the 900 live-enemy cap, so the worst case
  per frame is unchanged; late levels spend more time near the cap.

### Tests whose expectations moved (review)

- `foundation-campaign`: L31-50 pro stall budget 3 -> 0 and pro <= 3 tries per level; casual 5 -> 2.
- `w3-hazards-cc-play`: stall budgets pro 3 -> 0, casual 5 -> 2 per campaign.
- `w3-elite`: per-world multipliers; opening hordes keep their size; ELITE winnability check (pro, U[50]).
- `w3-integrate`: elite fraction from `eliteMuls(def)`.
- `w3-hazards-cc-levels`: a wipe fails when hazards took half of the members lost or the squad was gone before the
  last hazard (relative + positional); a run that ended early replays with Guard on so every hazard must spawn.
- `w3-harder-levels`: float tolerance on the cursed-barrel ratio (12/10 vs 0.8 x 15/10).
- New `w3-balance-rush`: climax kills >= 30% non-contact on L16 / L26 / L36 / L46, every horde spawned at its data
  size (within 2%, the rush >= 94%).

## Stage 6 review (fixer): harder again after the stage 4-5 helpers

The stage 4-5 additions (LINE formation +12% vs the horde by default, combo up to x1.3, dodge, Medic, Heavy
Gunner) made worlds 2-5 easier than the stage 3 pass left them, and no balance pass ran after them. Quick check
on `b6780ab` (casual Pip + Thunderclap, one try per bot seed, X = lost, digits = stars, (squad left)):
no upgrades L13 4/4, L16 2/4, L19 4/4, L20 4/4, L23 1/4, L26 4/4, L29 4/4, L30 0/4; campaign upgrades
(snapshots3 U[id]) L33 / L36 / L40 / L46 / L50 4/4 (mostly 3 stars), L43 2/4, L49 4/4; pro L50 3/3.

What changed (data only, `src/data/levelgen.js`, `src/data/harder.js`, `src/data/levels.js`):
- `WORLD_HP` [2.2, 2.2, 1.9, 1.9]: every horde of a generated bossless level past the opening (ramping in from
  p 0.1 to 0.35, the final rush included) is that much tougher; `LEVEL_TUNE.hp` scales the extra per level (L43 0:
  already the hard spot; L36 0.5 and L46 0.6: the pro bot's ELITE / small squads). Intro levels and boss / mini
  levels are untouched (with the extra, `w3-bosses-play` lost L25 / L40 / L50 with Cinder + Emberstorm and
  `w3-elite` lost L36 / L40 ELITE).
- L20 Ironhorn hp x1.4 (casual with no upgrades beat it 4 of 4); L50 Tempest King hp x0.75 -> x0.9.
- Hand-made Forge levels: `HAND_TOUGH` L12 x2, L13 x2.2, L14 x1.4, L15 x1.6 on `tough`.
- L11 is now a short lesson (430 u, 14 beats: its first 11 beats, the big x2 blade row, one horde, helpers).
- Red gates rise world by world (`redTop`, own Rng: cursed barrels / hidden gates stay put): share of gates that
  are -N or ÷: W1 33%, W2 37%, W3 41%, W4 44%, W5 43% (was 33 / 32 / 33 / 40 / 39). W5 is short of free rows;
  + / × rows (where chain gates start, `w4-road` wants >= 20 chains) are used last.

Tried and dropped: `WORLD_SMAX` 0.42 / 0.45 for worlds 2-3 (smaller gates): casual with upgrades then lost
L16 3 of 3 and L25 2 of 3 while L19 / L26 without upgrades did not change; L50 boss x1.0 with W5 hp x1.6:
pro and casual lost L50 7 of 7.

After (this commit; same bot, one try per seed):

| | L12 | L13 | L14 | L15 | L16 | L19 | L20 | L23 | L25 | L26 | L29 | L30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual, no upgrades | 4/4 | 2/4 | 4/4 | 4/4 | 0/4 | 4/4 | 3/4 | 0/4 | 0/4 | 4/4 | 2/4 | 0/4 |
| casual, campaign upgrades | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 | 2/3 |

(L12 / L14 / L15 / L19 / L23 / L26 no-upgrade and L12-L15 / L19 / L26 upgrade numbers from the run before the
last W4-5 / hand-level touch-up, which does not change world 2-3 generated levels; L12 / L14 were x2.2 / x2
there.)

| casual, campaign upgrades | L33 | L34 | L36 | L39 | L40 | L43 | L46 | L49 | L50 |
|---|---|---|---|---|---|---|---|---|---|
| wins | 3/4 | 3/4 | 4/4 | 4/4 | 4/4 | 2/4 | 4/4 | 2/4 | 3/4 |
| pro (seeds 1-3) | 3/3 | - | 3/3 | - | - | 1/3 | 3/3 | - | 3/3 |

(L20 / L25 / L30 / L36 / L40 / L50 re-run with the final boss-level rule: L20 no upgrades 3/4, L25 / L30 0/4;
with upgrades L20 / L25 3/3, L30 2/3; L36 casual 4/4, pro 3/3; L40 casual 4/4 (squads 869-999: easy again);
L50 casual 3/4, pro 3/3.)

Against the targets:
- W2-3, casual without upgrades usually fails: partly. It now loses L16 / L23 / L25 / L30 every time and L13 /
  L20 / L29 about half the time (was: only L23 / L30). L12 / L14 / L15 / L19 / L26 are still won: their squad
  hits the 999 cap mid-level and most late enemies die on contact, so tougher hordes barely change the result
  (L19 ends at ~500-590 whatever the toughness or the gate sizes). Fixing those needs a layout change (fewer
  growth gates), not a number.
- W2-3 with upgrades: still cleared (L29 2 of 3 first try).
- W4-5, casual with upgrades needs retries: partly. About 80% of first tries win (was ~90%), with smaller squads
  and fewer stars; L43 / L49 are about a coin flip, L50 3 of 4, L40 is easy. Pro with upgrades: L43 1 of 3, so
  `foundation-campaign` (pro <= 3 tries per level on L31-50) is the limit on going further: the bots are about
  equally strong (see "Not met / needs a decision" above).
- L50 the hardest: not met. Boss hp x0.9 (was x0.75) makes it one of the harder levels, but L43 / L49 are harder,
  and `w3-bosses-play` (pro Cinder + Emberstorm must win L40 / L50 within 3) caps the boss levels.
