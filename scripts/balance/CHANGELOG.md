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

## Not met (needs code or a spec decision)

- Favours: every cell now wins first try, and arena squads sit at the 999 cap on L7-L9 and for most weapons on L14,
  so (attempts, arena squad) ties on L1, L7, L8 and cannot favour anyone on L14. The favoured weapons of L10
  (Void), L13 (Gearworks) and L14 (Emberstorm, Void) are chosen for the boss, but arena squad measures the run
  phase, where long-range weapons clear hordes before the ladder gates and snowball.
- Ability use: the bot's triggers in `src/game/autopilot2.js` (`abilityWanted`) gate it, not the recharge.
- Weapon gauntlets: the grunt flood is reach-limited (every good weapon loses 0, so clear time decides and the
  long-range weapons finish first); the bomber gauntlet saturates (ref loss 31% at any T >= 159, where no weapon
  can pop a bomber at range); Glacier's pierce goes straight through tank walls even at x0.5.
