// Display streamlines in model coordinates (+X forward, +Z up).
// This is a geometry-aware illustration, not a CFD or trim solution.
export function createAirflowPaths(surfaces) {
  const tail = surfaces.horizontal_tail;
  const paths = [];
  const smooth = (a, b, value) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const bell = (x, center, width) => Math.exp(-(((x - center) / width) ** 2));
  const wake = x => smooth(0, 22, -x);

  function tailClearance(x, y, z, passAbove) {
    const fraction = Math.abs(y) / tail.tip_span;
    if (fraction >= 1) return z;
    const leading = tail.root_lead - tail.sweep * fraction;
    const chord = tail.root_chord + (tail.tip_chord - tail.root_chord) * fraction;
    const center = leading - chord * .48;
    const midZ = tail.root_z + (tail.tip_z - tail.root_z) * fraction;
    // Broad, gentle displacement begins before the leading edge and relaxes
    // downstream. It never jumps over the fin or reverses flow direction.
    const influence = bell(x, center, chord * 1.5);
    const clearance = .38 + .055 * chord;
    const target = midZ + (passAbove ? clearance : -clearance);
    return z + (passAbove ? Math.max(0, target - z) : Math.min(0, target - z)) * influence;
  }

  function add(sample, lane, strength = 1, start = 35, end = -53, wing = null) {
    const points = [];
    for (let i = 0; i <= 280; i++) {
      points.push(sample(start + (end - start) * i / 280));
    }
    paths.push({points, lane, strength, wing});
  }

  // Offset angular seeds keep the top flow on either side of the vertical
  // fin. The body envelope stays broad through the tail instead of funneling
  // into the stabilizers, then relaxes slowly into the wake.
  for (let lane = 0; lane < 12; lane++) {
    const angle = (lane + .5) * Math.PI * 2 / 12;
    const above = Math.sin(angle) > 0;
    add(x => {
      const body = smooth(24, 12, x) * (1 - smooth(-20, -38, x));
      const radius = 1.5 + 1.28 * body;
      const y = Math.cos(angle) * radius;
      let z = Math.sin(angle) * radius - .2 * wake(x);
      if (!above) z -= .48 * bell(x, 0, 7) * Math.abs(Math.cos(angle));
      z = tailClearance(x, y, z, above);
      return [x, y, z];
    }, lane, .85);
  }

  // Closer, more numerous paths trace each upper wing surface. Their height
  // follows the same sweep, dihedral and airfoil thickness as the STL, with
  // clearance for the skin; downstream flow passes beneath the tailplane.
  for (const side of [-1, 1]) {
    for (let lane = 0; lane < 18; lane++) {
      const span = 3 + lane * (14.2 / 17);
      const fraction = (span - 1.35) / 16.3;
      const leading = 4.1 - 11.2 * fraction;
      const chord = 7.4 - 5.9 * fraction;
      add(x => {
        const overWing = bell(x, leading - chord * .3, chord * .6);
        const downwash = smooth(leading - chord, leading - chord - 20, x);
        const y = side * (span + .12 * downwash);
        let z = -.65 + 1.2 * fraction + .24 + .075 * chord * overWing - .65 * downwash;
        z = tailClearance(x, y, z, false);
        return [x, y, z];
      }, 20 + lane + (side + 1) * 10, .9, 35, -53, {leading, chord});
    }
    // Lower lanes clear the nacelles as well as the wing and tail.
    for (let lane = 0; lane < 3; lane++) {
      const span = 4 + lane * 4.4;
      add(x => [x, side * span, -4.1 - .65 * wake(x)], 40 + lane + side, .45);
    }
    // Wingtip wake grows smoothly from the tip. Counter-rotating traces
    // are restrained and descend with the wake instead of waving sideways.
    for (let strand = 0; strand < 2; strand++) {
      add(x => {
        const d = -9.0 - x;
        const radius = .22 * smooth(0, 18, d);
        const phase = d * .12 + strand * Math.PI;
        return [x, side * (18.35 + radius * Math.sin(phase)),
          2.7 - d * .035 + radius * (Math.cos(phase) - 1)];
      }, 50 + strand + side, .55, -9.0, -60);
    }
  }
  return paths;
}
