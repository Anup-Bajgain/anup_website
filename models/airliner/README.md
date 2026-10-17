# Homepage aircraft

`airliner.stl` is the actual geometry loaded by the homepage Three.js scene. It is an original generic narrow-body airliner, not a replica of a named aircraft. Coordinates are in metres: +X forward, +Y span, +Z up.

Regenerate with `python scripts/build_airliner.py`. The binary STL contains display components, including overlapping surfaces; it is not intended as a watertight manufacturing model. `materials.json` maps triangle ranges to scene materials because standard STL has no material system. Regenerate these two files together.

Regenerate the fallback with `python scripts/render_airliner_preview.py` (NumPy and Matplotlib).

`preview.png` is a static rendering of the same mesh, shown if WebGL is unavailable. Airflow is an illustrative animation, not CFD data. Serve the website over HTTP (for example, `python -m http.server 8000`) so ES modules and STL loading work.

Renderer: Three.js 0.179.1, vendored under `js/vendor/three` with its MIT license. Sources: https://github.com/mrdoob/three.js/tree/r179

The horizontal tail uses a symmetric airfoil with shallow dihedral and a continuous root. Its dimensions are exported in `materials.json` and reused by `js/flight-flow.js`. The scene animates short dashes along those paths, with a 2.5-metre dash length and spacing of 22 / 1.2 metres (20% denser than the earlier dashed effect). These are geometric illustrations, not a CFD/trim calculation.

The homepage and navigation transition share `js/airliner-model.js`, so the STL is parsed once per document. The wing flow uses closer paths and extra contrast over the white wing surfaces.

`js/flight-airport.js` builds inert copies of the current page's hero as text, image, and glass scenery layers. Each layer is projected through the STL scene's camera onto a vertical world-space plane beyond the runway, above a 3D terminal foundation. Different depths create parallax during takeoff and approach. The scenery uses a compact landscape arrangement on desktop and mobile so it stays above the runway. Departure uses the source hero even if the visitor has scrolled down; arrival uses the destination hero. The scenery fades out into open sky for cruise and returns on approach. Hero text and images stay in sync with the actual page without maintaining screenshots. The homepage uses its existing static STL preview inside this backdrop instead of starting another WebGL scene.

`js/flight-transition.js` animates takeoff, cruise, and landing only when navigating to another supported local HTML page. Links between sections on the same page scroll normally. Change `CRUISE_DURATION_SECONDS` near the top of that file to adjust the cruise duration (default `4.5` seconds; `0` skips cruise). Takeoff and landing keep their own durations, and progress and the safety timeout adapt automatically. The camera follows the STL aircraft during cruise. Separate-page arrivals use a short-lived sessionStorage ticket and `flight-transition-boot.js` to cover the navigation handoff. Skip/Escape completes navigation immediately; reduced-motion preferences and unavailable WebGL use normal navigation. Add `data-no-flight` to an individual link to opt out. The transition styles and scripts are linked on the homepage and seven project pages.
