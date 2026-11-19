# Balance changelog (continued from CHANGELOG.md, which passed 500 lines)

## After update 3: L50 the hardest level, 3-star targets re-set (owner: "Yes, do both")

Supersedes "L50 the hardest: not met" at the end of CHANGELOG.md.

L50 (Tempest King, Storm Throne) was not the hardest level: L43 was. Probe (campaign upgrades from
`snapshots3.json`, Pip + Thunderclap: casual seeds 1-6, pro seeds 1-5) on `aeff36c`: L43 4/11 wins, L49 7/11,
L50 8/11 (pro 5/5). Tempest King hp `hpMul` 0.9 -> 1.13 (`BOSS_PLAN` in `src/data/levelgen.js`): L50 3/11 (casual
1/6, pro 2/5), the lowest of the levels probed (L31-50; in the star re-run below L50 also has the fewest wins of
L11-50: 2 of 6). Tried: 1.05 (Pip c 1/4 p 3/3 on fewer seeds), 1.1 (5/11), 1.15 (2/11, pro 1/5), 1.2 (0/11);
tougher L50 hordes (`LEVEL_TUNE` tough 0.6 / 1.0) hit Cinder far harder than Pip. Boss outcomes near these values
are noisy (close fights, the boss often dies or wins with < 15% hp left).

A strong pick vs the storm lord still wins: Cinder + Spectra pro 5/5 (~800 left). Cinder + Emberstorm (both weak
vs the Tempest King; Cinder's hero card now says so, like Pip's) loses with the campaign's upgrades (pro 0/5) and
wins 8/8 with full shop upgrades (squad 15, damage 20, rate 20, tier 3). L50 ELITE: Pip + Thunderclap 0/5 with
`U[50]`, 5/5 with full upgrades; Pip + Spectra and Cinder + Spectra 5/5 with `U[50]`. Boss Rush is unaffected
(it sets its own boss hp, `src/game/modes/bossrush.js`).

Tests: `foundation-campaign` lets the pro bot take up to 5 tries on L50 (PRO_FINAL); `w3-bosses-play` gives the pro
bot 5 tries on L50, reports Cinder + Emberstorm there (finalWeak) and requires Cinder + Spectra to win;
`w3-elite` checks L50 ELITE with Pip + Spectra.

3-star targets: the stage 3 rule (`scripts/balance/stars3.js`) re-run on L11-50 after the stage 6 toughness raise;
each level's [2 stars, 3 stars] became the lower of the old and the new value (never raised). 3 stars got easier
on 21 of the 40 levels, most on L11-14 (the Forge levels were still on [870, 970]-style targets), L16, L24, L27,
L32, L45, L49 and L50 (now [45, 75]). Forge levels via `HAND_STARS` in `src/data/harder.js`.

| level | old | new | | level | old | new |
|---|---|---|---|---|---|---|
| 11 | 870, 970 | 570, 575 | | 29 | 610, 700 | 560, 665 |
| 12 | 870, 970 | 795, 895 | | 32 | 135, 225 | 30, 105 |
| 13 | 870, 965 | 795, 895 | | 34 | 280, 365 | 185, 275 |
| 14 | 735, 820 | 645, 740 | | 39 | 280, 370 | 215, 325 |
| 15 | 770, 915 | 770, 895 | | 44 | 130, 265 | 100, 265 |
| 16 | 365, 420 | 255, 320 | | 45 | 700, 805 | 535, 640 |
| 18 | 510, 590 | 480, 555 | | 47 | 100, 345 | 100, 205 |
| 19 | 480, 610 | 480, 590 | | 49 | 425, 675 | 235, 645 |
| 23 | 345, 455 | 275, 425 | | 50 | 380, 510 | 45, 75 |
| 24 | 595, 645 | 460, 525 | | 35 | 795, 895 | 780, 895 |
| 26 | 195, 470 | 110, 360 | | 36 | 305, 350 | 260, 350 |
| 27 | 630, 720 | 510, 550 | | 17 | 265, 305 | 230, 305 |
| 28 | 695, 800 | 520, 665 | | | | |
