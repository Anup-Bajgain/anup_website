(() => {
  const replay = window.SIC_SWARM_REPLAY;
  const canvas = document.getElementById('swarm-viewer');
  const poster = document.getElementById('swarm-viewer-poster');
  const hud = document.getElementById('swarm-viewer-hud');
  const controls = document.getElementById('swarm-viewer-controls');
  const modeLabel = document.getElementById('swarm-viewer-mode');
  const timeLabel = document.getElementById('swarm-viewer-time');
  const playButton = document.getElementById('swarm-viewer-play');
  const resetButton = document.getElementById('swarm-viewer-reset');
  if (!replay || !canvas || !canvas.getContext) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const BLUE = '#58baff';
  const TEAL = '#67e5ce';
  const WHITE = '#edf4fc';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chapters = [
    { key: 'pattern', duration: 7.5, label: 'Circle formation' },
    { key: 'obstacle', duration: 7.5, label: 'Obstacle navigation' },
  ];
  const fullDuration = chapters.reduce((sum, chapter) => sum + chapter.duration, 0);
  const camera = { yaw: -Math.PI / 4, pitch: 0.68, zoom: 1 };
  let elapsed = reducedMotion ? 7.48 : 0;
  let playing = !reducedMotion;
  let inView = true;
  let lastTick = performance.now();
  let dragging = false;
  let pointerX = 0;
  let pointerY = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const project = (point) => {
    const [x, y, z] = point;
    const cosYaw = Math.cos(camera.yaw);
    const sinYaw = Math.sin(camera.yaw);
    const across = -sinYaw * x + cosYaw * y;
    const toward = cosYaw * x + sinYaw * y;
    const units = Math.min(width / 69, height / 52) * camera.zoom;
    return {
      x: width / 2 + across * units,
      y: height * 0.51 + (Math.sin(camera.pitch) * toward - Math.cos(camera.pitch) * (z - 8)) * units,
      depth: Math.cos(camera.pitch) * toward + Math.sin(camera.pitch) * (z - 8),
    };
  };

  function line(points, color, thickness = 1, closed = false) {
    if (!points.length) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    if (closed) context.closePath();
    context.strokeStyle = color;
    context.lineWidth = thickness;
    context.stroke();
  }

  function polygon(points, fill, stroke) {
    if (!points.length) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 1;
      context.stroke();
    }
  }

  function circle(point, radius, fill, stroke) {
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 1.4;
      context.stroke();
    }
  }

  function drawFloor() {
    const corners = [[-20, -20, 0], [20, -20, 0], [20, 20, 0], [-20, 20, 0]].map(project);
    polygon(corners, '#14283b', '#5280a0');
    for (let value = -20; value <= 20; value += 5) {
      line([project([value, -20, 0]), project([value, 20, 0])], 'rgba(115,155,184,.27)');
      line([project([-20, value, 0]), project([20, value, 0])], 'rgba(115,155,184,.27)');
    }
  }

  function drawBox(center, label, color) {
    const [x, y] = center;
    const offsets = [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]];
    const bottom = offsets.map(([dx, dy]) => project([x + dx, y + dy, 0]));
    const top = offsets.map(([dx, dy]) => project([x + dx, y + dy, 5]));
    polygon(bottom, color === '#67e5ce' ? 'rgba(103,229,206,.09)' : 'rgba(255,194,107,.09)', color);
    line(top, color, 1.6, true);
    for (let i = 0; i < 4; i++) line([bottom[i], top[i]], color, 1.3);
    const labelPoint = project([x, y, 5]);
    context.font = '600 12px Inter, sans-serif';
    context.textAlign = 'center';
    context.fillStyle = color;
    context.fillText(label, labelPoint.x, labelPoint.y - 20);
  }

  function drawPillar([x, y, radius, heightValue]) {
    const base = [];
    const top = [];
    for (let index = 0; index < 20; index++) {
      const angle = Math.PI * 2 * index / 20;
      const xx = x + radius * Math.cos(angle);
      const yy = y + radius * Math.sin(angle);
      base.push(project([xx, yy, 0]));
      top.push(project([xx, yy, heightValue]));
    }
    const left = base.reduce((best, point, index) => point.x < base[best].x ? index : best, 0);
    const right = base.reduce((best, point, index) => point.x > base[best].x ? index : best, 0);
    polygon([base[left], base[right], top[right], top[left]], 'rgba(107,134,156,.76)');
    line([base[left], top[left]], 'rgba(191,210,224,.55)');
    line([base[right], top[right]], 'rgba(191,210,224,.55)');
    polygon(top, '#b2c5d3', '#e2edf4');
  }

  function drawTrail(frames, frameIndex, droneId) {
    const points = [];
    for (let index = Math.max(0, frameIndex - 18); index <= frameIndex; index++) {
      const drone = frames[index].find((item) => item[0] === droneId);
      if (drone) points.push(project(drone.slice(1, 4)));
    }
    if (points.length > 1) line(points, 'rgba(88,186,255,.48)', 1.6);
  }

  function drawDrone(drone) {
    const point = project(drone.slice(1, 4));
    const shadow = project([drone[1], drone[2], 0]);
    line([shadow, point], 'rgba(88,186,255,.26)');
    circle(shadow, 2.5, 'rgba(88,186,255,.35)');
    circle(point, 10, 'rgba(88,186,255,.18)');
    circle(point, 5.4, drone[4] ? '#67e5ce' : '#58baff', '#edf4fc');
  }

  function currentFrame() {
    let time = elapsed % fullDuration;
    for (const chapter of chapters) {
      if (time < chapter.duration) {
        const run = replay[chapter.key];
        const index = Math.min(run.frames.length - 1, Math.floor(time / chapter.duration * run.frames.length));
        return { chapter, run, index, time: index * 0.2 };
      }
      time -= chapter.duration;
    }
    return null;
  }

  function draw() {
    if (!width || !height) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#09111e';
    context.fillRect(0, 0, width, height);
    const state = currentFrame();
    if (!state) return;
    const { chapter, run, index, time } = state;
    drawFloor();
    if (chapter.key === 'pattern') {
      const targets = run.targets.map(project);
      line(targets, 'rgba(103,229,206,.72)', 1.6, true);
      targets.forEach((point) => circle(point, 4, 'rgba(103,229,206,.10)', '#67e5ce'));
    }
    const drones = run.frames[index];
    for (const drone of drones) drawTrail(run.frames, index, drone[0]);
    const objects = drones.map((drone) => ({ type: 'drone', value: drone, depth: project(drone.slice(1, 4)).depth }));
    if (chapter.key === 'obstacle') {
      for (const pillar of run.pillars) {
        objects.push({ type: 'pillar', value: pillar, depth: project([pillar[0], pillar[1], pillar[3] / 2]).depth });
      }
    }
    objects.sort((a, b) => a.depth - b.depth);
    for (const object of objects) {
      if (object.type === 'pillar') drawPillar(object.value);
      else drawDrone(object.value);
    }
    if (chapter.key === 'obstacle') {
      drawBox(run.start, 'START', '#67e5ce');
      drawBox(run.end, 'GOAL', '#ffc26b');
    }
    modeLabel.textContent = chapter.label;
    timeLabel.textContent = `Simulation time ${time.toFixed(1)} s`;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    draw();
  }

  function tick(now) {
    if (playing && inView) elapsed = (elapsed + Math.min((now - lastTick) / 1000, 0.1)) % fullDuration;
    lastTick = now;
    if (inView && playing) draw();
    window.requestAnimationFrame(tick);
  }

  function updatePlayButton() {
    playButton.textContent = playing ? 'Pause replay' : 'Play replay';
    playButton.setAttribute('aria-pressed', String(!playing));
  }

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    camera.yaw -= (event.clientX - pointerX) * 0.008;
    camera.pitch = clamp(camera.pitch + (event.clientY - pointerY) * 0.006, 0.2, 1.45);
    pointerX = event.clientX;
    pointerY = event.clientY;
    draw();
  });
  const finishDrag = () => {
    dragging = false;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.001), 0.65, 1.7);
    draw();
  }, { passive: false });
  canvas.addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') camera.yaw -= 0.12;
    if (event.key === 'ArrowRight') camera.yaw += 0.12;
    if (event.key === 'ArrowUp') camera.pitch = clamp(camera.pitch - 0.1, 0.2, 1.45);
    if (event.key === 'ArrowDown') camera.pitch = clamp(camera.pitch + 0.1, 0.2, 1.45);
    if (event.key === '+' || event.key === '=') camera.zoom = clamp(camera.zoom * 1.12, 0.65, 1.7);
    if (event.key === '-') camera.zoom = clamp(camera.zoom / 1.12, 0.65, 1.7);
    draw();
  });
  playButton.addEventListener('click', () => {
    playing = !playing;
    updatePlayButton();
    draw();
  });
  resetButton.addEventListener('click', () => {
    camera.yaw = -Math.PI / 4;
    camera.pitch = 0.68;
    camera.zoom = 1;
    draw();
  });

  poster.hidden = true;
  canvas.hidden = false;
  hud.hidden = false;
  controls.hidden = false;
  updatePlayButton();
  resize();
  new ResizeObserver(resize).observe(canvas);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      lastTick = performance.now();
      if (inView) draw();
    }).observe(canvas);
  }
  window.requestAnimationFrame(tick);
})();
