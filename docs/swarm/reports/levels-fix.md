# levels-fix report

## What changed
- `src/levels/util.js`: `reach()` is now physical: only free-flight time counts, `((rows-1)*16 - bodyDepth)/speed` (bodyDepth = playerBox.d - 1.8). Rows 1-2 apart allow no lateral shift (~6 units of flight in round 1); `safe` factor 0.7 (30% slack) in the generator, 1.0 in the validator DP.
- `tools/validate-level.mjs`: cell DP uses the physical reach; new second check `auditLevel()` = `autopilot.auditStage(stage, speed, slack)` with slack 0.75 (r1) .. 0.90 (r4+). Failures print `AUDIT unfair window(s)`.
- `src/levels/fortress.js`: double walls are nested funnels (2nd gap inside 1st); zig search up to 7 rows; mouse slot is 2 cells wide except round>=3 and late; no turrets/pads in the approach (-300/+90 units) of any one-cell-wide gap/slot/slit; loose tins are lined up with the next wall gap as a low+high pair (one is in the line of fire whichever side of the gap you hug); alley tins unchanged; tin spacing still <=680.
- `test/levels.test.mjs`: +2 tests (reach model, audit).

## Evidence
- `validate-level --seeds 300`: 4800 stages, 0 failures (includes audit). `npm test`: 161/161.
- botplay stage 0 r1 seeds 1..8: 7/8 clear, 0 LEVEL-UNFAIR windows (was 0/8). Seeds 1..24: 21/24. Stage 2 seeds 1..8: 7/8. Fuel deaths: 2/24 (was ~8 of 24).
- Stage 0 round 4 seeds 1..8: 4/8 (bot-limited, see below).

## Remaining deaths are bot behaviour, not impossible windows
- Bot flies lazily (hugs gap edge, shifts late) and its hazard dodge pulls it out of corridors: stage0 r1 seed 23 y~1999 (sits at z 122 while target z 102, 3 deaths), seed 13 y~2623, r4 seed 2 y~652 (target z 42 but a 1-cell-high hole needs z<=25).
- Bot assumes ground-level tins (descends to zMin+2); floating tins aligned with gaps work better only with the low+high pair.

## Requests (not my files)
- qa-bot: planner should commit to the chain's tightest row earlier (use full lookahead for 1-cell holes) and not let hazard dodging override a committed gap path when the gap is 1 cell; refuelQuest/tin cost should consider tin z. Respawn at the area start repeats the same spot 3x.
- render: `check-imports` GROUND_ROWS_AHEAD (from qa-bot) still open.
