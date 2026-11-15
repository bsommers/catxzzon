# art-fx report
## What I built
src/art/fx.js: boom_small/boom_big (lumpy cheese splats with holes, drips, flung globs, crumb ring), crumb, spark, smoke, ring, field_post (spray can, nozzle up, frame 1 glowing), strand (opaque tile on #000, wavy glossy rope, drips, seamless 16px period), cheeseball. Test: test/art-fx.test.mjs.
## Verification evidence
`node tools/sheet.mjs fx --scale 4` prints OK (build ~15 ms). Node tests pass. Viewed sheet twice.
## Deviations from the contract
None.
## Mistakes I made and how I fixed them
Smoke/ring last frames had alpha <128 (flagged EMPTY); raised alpha. First big-boom frames clipped the 64px edge and read as fire; reduced radius, paler cheese palette, added holes/drips.
## Learnings for a future agent
Sheet validator counts alpha>=128 as present; keep fade alpha above that.
## Requests for other modules
None. Renderer: strand is opaque on #000 and uses mat.R (emit) as the glow.
