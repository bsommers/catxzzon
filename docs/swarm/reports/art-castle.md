# art-castle report

## What I built
`src/art/castle.js`: 9 iso cubes (cheddar, swiss, crown with 4 mini-cube merlons, window, mousehole, rind, flag, gold, cracker), 3 ground tile sets x4 variants (cracker, gouda, keep), decals (crater x3, hole x2, rune x2). Exports `faceAt/topMask/cubeMask` geometry helpers. Cube: top diamond rows 0..15, left face x<16, right x>=16, 16px vertical edge, shading top > left > right, 1px #1a1420 outline.
`test/art-castle.test.mjs`: 17 tests (diamond lattice tiling exact, cube silhouettes/opacity/outline/shading order, stacking, tile periodicity and rim equality across variants, decals, determinism, build time).

## Verification evidence
`node tools/sheet.mjs castle --scale 4` prints OK; `node --test test/art-castle.test.mjs` 17/17 pass; build ~15 ms. Viewed sheet at x4-x6 three times.

## Deviations from the contract
- defs says ground tiles are "transparent outside the diamond" but tools/sheet.mjs requires tiles fully opaque. I followed the checker: pixels outside the diamond hold the lattice-wrapped colour (same-variant lattices are paint-order independent), but they are NOT harmless against a different neighbouring variant, since a tile's corners lie on neighbours' cores. Renderer should clip tiles to the diamond (`topMask` in castle.js, or lattice-diamond test |dx|/16+|dy|/8<=1 at pixel centres).
- Diamond edge rims (m>0.9) are variant-independent so any variants meet seamlessly.
- blk_flag pennant intentionally pokes outside the cube mask (above the top diamond).

## Mistakes I made and how I fixed them
- Assumed corner pixels of a diamond tile wrap to a tile-internal pixel; they are neighbours' centres. Reworked the test to same-variant periodicity + rim equality.
- Stack test used the wrong offset sign; fixed.

## Learnings for a future agent
Pixel centres give no ties for the diamond test (|dx|+2|dy| is half-integer), so lattice tiling is exact. Face coordinate v = floor(y+.5-yTop) gives clean 2:1 brick staircases.

## Requests for other modules
- render-scene: clip ground tiles to the diamond (or draw only the diamond pixels). Cube anchoring: sprites fill 32x32; stack offsets (+16,+8),(+16,-8),(0,-16).
- orchestrator: reconcile defs tile description (transparent corners) with sheet.mjs (opaque tiles).
