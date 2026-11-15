# art-cat report (2026-11-15T23:53Z)

## What I built
- `src/art/cat.js` — `build()` returns all 8 `cat` manifest rows: `cat_ship` (10 frames, (bank+2)*2+anim), `cat_head` (2), `cat_portrait` (3: grin / worried / victorious), `hairball` (2), `yarn` (4), `nip` (4), `laser_dot` (4), `cat_aura` (4).
- Ship and portraits use a small in-module orthographic SDF ray-marcher (ellipsoids, round cones, smooth-min) with quantised 4-tone ramps (violet shadows -> warm highlights), Bayer dither, depth-break contour lines and a `#1a1420` outline. Ship uses the game's iso projection (sx=u+v, sy=(u-v)/2-h), light from upper-left, so it matches the world.
- Major Marmalade: orange tabby with back/leg/tail stripes, pointed ears with pink rims, brass+cyan aviator goggles, red scarf with fluttering tail, white-sock paws outstretched as wings, tail curling up into an emissive flame plume (flame length/wobble + scarf flutter differ per anim frame). Bank rolls the model about its forward axis with a slight yaw.
- Portraits: SDF bust + hand-placed features (slit-pupil green eyes, cocky half-lids + fang; worried round eyes, flattened ears, sweat drop; closed happy eyes, open grin, blush, sparkles). HUD head is a hand-drawn 14x14 pixel map; frame 1 greyscale.
- `test/art-cat.test.mjs` — manifest sizes/frames/no extras, transparency, determinism, <400 ms build, ship outline + distinct frames + emissive flame, grey HUD frame.

## Verification evidence
- `node tools/sheet.mjs cat --scale 4` -> "OK: all 8 manifest names present with correct sizes/frames." build ~130-200 ms.
- `node --test test/art-cat.test.mjs` -> 5 pass, 0 fail.
- Viewed `out/previews/cat.png` at x4 three times and iterated (see mistakes).

## Deviations from the contract
- `cat_aura` has no dark outline (it is a translucent emissive glow; an outline would look wrong). Uses alpha 30-230.
- `laser_dot` beam/glow and `hairball` trail pixels are semi-transparent emissive, outside the outline.
- Did not use `createRng`; all variation is `hash2`/analytic, so still deterministic.

## Mistakes I made and how I fixed them
- v1 ship: roll of 0.34 rad/step made bank -2 almost edge-on (iso camera sits on the +u side), and the head was tiny. Fixed: roll 0.2/step plus base roll -0.12 and nose-up pitch 0.22, larger head/ears, eye dot on the visible side.
- Then ears/flame clipped at sprite edges: measured opaque bboxes numerically, reduced scale to 0.98, moved centre down, shortened flame.
- v1 portrait: face features drawn ~6 px too low so whiskers/mouth ran over the scarf; goggles overlapped brows; bib was a hard rectangle. Moved features up, goggles up, elliptical bib.
- nip leaves merged into a green bell blob: each leaf now drawn and outlined in its own buffer before compositing. Aura bands were muddy: wider bands, higher alpha.

## Learnings for a future agent
- An SDF ray-marcher at sprite resolution is cheap (<40 ms per 48x40x10) and makes banking/rotations trivial; quantise to hand-picked ramps to keep it pixel-art.
- Measure bounding boxes numerically before spending an image view.
- In this iso, the view ray is (-1,1,-1) in (u,v,h); ray origin for a pixel at height h0: u=(X+2(Y+h0))/2, v=(X-2(Y+h0))/2.

## Requests for other modules
- render-scene: draw `cat_aura` behind `cat_ship` centred on the same anchor (aura 56x48 centre ~(27,25); ship 48x40 body centre ~(25,26)). The flame exits toward the lower-left of the ship sprite.
- No shared-library defects found in `pixbuf.js`.
