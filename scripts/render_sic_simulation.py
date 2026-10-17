"""Render portfolio media from the SIC project's own swarm update loop.

Run from the repository root: python scripts/render_sic_simulation.py
Requires numpy, matplotlib, and Pillow.
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "projects/SIC/finalProject/main.py"
OUTPUT = ROOT / "projects/images/sic"
OUTPUT.mkdir(parents=True, exist_ok=True)

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("sic_swarm", SOURCE)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class ReplayGUI:
    running = True

    def end_simulation_run(self):
        self.running = False


def simulate(mode: str, seconds: float, seed: int):
    np.random.seed(seed)
    swarm = module.Swarm(20)
    swarm.mode = mode
    swarm.generate_obstacles()
    swarm.resize_swarm(20)
    if mode == "pattern_formation":
        swarm.current_pattern_targets = swarm.generate_pattern_targets("circle")
    else:
        swarm.simulation_duration = seconds + 1
    swarm.gui = ReplayGUI()

    history = {}
    frames = []
    dt = 0.1
    steps = round(seconds / dt)
    with contextlib.redirect_stdout(io.StringIO()):
        for step in range(steps + 1):
            t = step * dt
            for drone in swarm.drones:
                history.setdefault(drone.id, []).append(tuple(drone.position))
            if step % 2 == 0:
                frames.append({
                    "mode": mode,
                    "time": t,
                    "drones": [(d.id, tuple(d.position), d.reached_goal) for d in swarm.drones],
                    "trails": {key: values[-55:][::3] for key, values in history.items()},
                    "obstacles": [(tuple(o.base_position), o.radius) for o in swarm.obstacles],
                    "start": tuple(swarm.start_box_center),
                    "end": tuple(swarm.end_box_center),
                    "targets": [tuple(x) for x in swarm.current_pattern_targets],
                })
            if step < steps and swarm.gui.running:
                swarm.update_swarm(dt)
    return frames


BG = "#09111e"
PANEL = "#111f30"
GRID = "#21354a"
WHITE = "#edf4fc"
MUTED = "#9db0c2"
BLUE = "#58baff"
TEAL = "#67e5ce"
AMBER = "#ffc26b"


def fonts(scale):
    face = Path("C:/Windows/Fonts/segoeui.ttf")
    bold = Path("C:/Windows/Fonts/segoeuib.ttf")
    if not face.exists():
        face = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        bold = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    return (
        ImageFont.truetype(str(bold), round(30 * scale)),
        ImageFont.truetype(str(face), round(16 * scale)),
        ImageFont.truetype(str(bold), round(15 * scale)),
        ImageFont.truetype(str(face), round(13 * scale)),
    )


def render(frame, size=(1600, 900)):
    w, h = size
    scale = w / 1280
    title_font, body_font, label_font, small_font = fonts(scale)
    image = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(image, "RGBA")
    S = lambda x: round(x * scale)
    title = "Circle formation" if frame["mode"] == "pattern_formation" else "Obstacle navigation"
    subtitle = "20 agents  /  target tracking + local repulsion" if frame["mode"] == "pattern_formation" else "20 agents  /  PID goal seeking + local repulsion"
    d.text((S(56), S(38)), "SIC  /  DRONE SWARM SIMULATION", font=label_font, fill=BLUE)
    d.text((S(56), S(70)), title, font=title_font, fill=WHITE)
    d.text((S(56), S(118)), subtitle, font=body_font, fill=MUTED)
    d.rounded_rectangle((S(1113), S(62), S(1224), S(111)), radius=S(15), fill=PANEL, outline=GRID)
    d.text((S(1132), S(73)), f"t = {frame['time']:04.1f}s", font=label_font, fill=WHITE)

    left, top, right, bottom = S(56), S(165), S(1224), S(666)
    d.rounded_rectangle((left, top, right, bottom), radius=S(20), fill=PANEL, outline=GRID, width=S(2))
    cx = (left + right) / 2
    cy = (top + bottom) / 2
    map_scale = (bottom - top - S(55)) / 40
    if frame["mode"] == "pattern_formation":
        # Keep the whole launch region in view, then gradually follow the formation.
        map_scale *= 1 + 0.8 * min(frame["time"] / 20, 1)

    def xy(pos):
        return (round(cx + pos[0] * map_scale), round(cy - pos[1] * map_scale))

    for val in range(-20, 21, 5):
        x = round(cx + val * map_scale)
        y = round(cy - val * map_scale)
        d.line((x, top + S(22), x, bottom - S(22)), fill=GRID, width=1)
        d.line((left + S(24), y, right - S(24), y), fill=GRID, width=1)
    d.text((left + S(24), bottom - S(40)), "X / Y TOP VIEW    •    POSITION IN SIMULATION UNITS", font=small_font, fill=MUTED)

    if frame["mode"] == "pattern_formation":
        target_points = [xy(p) for p in frame["targets"]]
        if len(target_points) > 2:
            d.line(target_points + [target_points[0]], fill=(103, 229, 206, 95), width=S(2), joint="curve")
        for x, y in target_points:
            r = S(5)
            d.ellipse((x-r, y-r, x+r, y+r), outline=(103, 229, 206, 170), width=S(2))
    else:
        for pos, radius in frame["obstacles"]:
            x, y = xy(pos)
            r = radius * map_scale
            d.ellipse((x-r, y-r, x+r, y+r), fill=(105, 124, 143, 230), outline=(179, 195, 207, 180), width=S(1))
        for label, center, color in (("START", frame["start"], TEAL), ("GOAL", frame["end"], AMBER)):
            x, y = xy(center)
            r = 2.5 * map_scale
            d.rounded_rectangle((x-r, y-r, x+r, y+r), radius=S(5), outline=color, width=S(3), fill=(15, 40, 50, 100))
            d.text((x-r, y-r-S(24)), label, font=small_font, fill=color)

    for trail in frame["trails"].values():
        points = [xy(p) for p in trail]
        if len(points) > 1:
            d.line(points, fill=(88, 186, 255, 105), width=S(2), joint="curve")
    for _, pos, reached in frame["drones"]:
        x, y = xy(pos)
        r = S(7)
        color = TEAL if reached else BLUE
        d.ellipse((x-r-S(4), y-r-S(4), x+r+S(4), y+r+S(4)), fill=(88, 186, 255, 32))
        d.ellipse((x-r, y-r, x+r, y+r), fill=color, outline=WHITE, width=S(1))

    d.text((S(57), S(690)), "REPLAY FROM PROJECT PYTHON SIMULATION", font=label_font, fill=WHITE)
    return image


def render_oblique(frame, size=(1280, 720)):
    """Project the simulator's x/y/z positions from above one field corner."""
    w, _ = size
    scale = w / 1280
    title_font, body_font, label_font, small_font = fonts(scale)
    image = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(image, "RGBA")
    S = lambda x: round(x * scale)
    is_pattern = frame["mode"] == "pattern_formation"
    title = "Circle formation" if is_pattern else "Obstacle navigation"
    d.text((S(56), S(38)), "SIC  /  DRONE SWARM SIMULATION", font=label_font, fill=BLUE)
    d.text((S(56), S(70)), title, font=title_font, fill=WHITE)
    d.text((S(56), S(118)), "3D field view  /  x, y and altitude from the simulation", font=body_font, fill=MUTED)
    d.rounded_rectangle((S(1113), S(62), S(1224), S(111)), radius=S(15), fill=PANEL, outline=GRID)
    d.text((S(1132), S(73)), f"t = {frame['time']:04.1f}s", font=label_font, fill=WHITE)
    left, top, right, bottom = S(56), S(165), S(1224), S(666)
    d.rounded_rectangle((left, top, right, bottom), radius=S(20), fill=PANEL, outline=GRID, width=S(2))

    def xyz(pos):
        x, y, z = pos
        # View from the (+x, -y) corner, perpendicular to the start-to-goal diagonal.
        return (round(S(640) + S(9) * (x + y)),
                round(S(466) + S(3.3) * (x - y) - S(7.5) * z))

    corners = [(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)]
    d.polygon([xyz(p) for p in corners], fill=(20, 39, 56, 255))
    for val in range(-20, 21, 5):
        d.line([xyz((val, -20, 0)), xyz((val, 20, 0))], fill=(79, 111, 139, 100), width=S(1))
        d.line([xyz((-20, val, 0)), xyz((20, val, 0))], fill=(79, 111, 139, 100), width=S(1))
    d.line([xyz(p) for p in corners + [corners[0]]], fill=(91, 139, 174, 220), width=S(2), joint="curve")

    def box(center, label, color):
        x, y, _ = center
        lo, hi = -2.5, 2.5
        base = [xyz((x+dx, y+dy, 0)) for dx,dy in ((lo,lo),(hi,lo),(hi,hi),(lo,hi))]
        upper = [xyz((x+dx, y+dy, 5)) for dx,dy in ((lo,lo),(hi,lo),(hi,hi),(lo,hi))]
        d.polygon(base, fill=(*color, 55))
        for poly in (base, upper):
            d.line(poly + [poly[0]], fill=(*color, 205), width=S(2), joint="curve")
        for a, b in zip(base, upper):
            d.line((a, b), fill=(*color, 160), width=S(2))
        tx, ty = xyz((x, y, 5))
        d.text((tx-S(20), ty-S(25)), label, font=small_font, fill=(*color, 255))

    if is_pattern:
        targets = [xyz(p) for p in frame["targets"]]
        if len(targets) > 2:
            d.line(targets + [targets[0]], fill=(103, 229, 206, 165), width=S(2), joint="curve")
        for x, y in targets:
            r = S(5)
            d.ellipse((x-r, y-r, x+r, y+r), outline=(103, 229, 206, 210), width=S(2))
    else:
        # Draw farther pillars first so the array reads as a solid 3D field.
        for pos, radius in sorted(frame["obstacles"], key=lambda o: o[0][0] - o[0][1]):
            base = []
            cap = []
            for i in range(16):
                angle = 2 * math.pi * i / 16
                p = (pos[0] + radius * math.cos(angle), pos[1] + radius * math.sin(angle))
                base.append(xyz((p[0], p[1], 0)))
                cap.append(xyz((p[0], p[1], 20)))
            left_index = min(range(16), key=lambda i: base[i][0])
            right_index = max(range(16), key=lambda i: base[i][0])
            d.polygon((base[left_index], base[right_index], cap[right_index], cap[left_index]),
                      fill=(104, 127, 147, 140))
            d.line((base[left_index], cap[left_index]), fill=(164, 187, 202, 130), width=S(1))
            d.line((base[right_index], cap[right_index]), fill=(164, 187, 202, 130), width=S(1))
            d.polygon(cap, fill=(177, 197, 211, 235), outline=(220, 233, 242, 230))
        box(frame["start"], "START", (103, 229, 206))
        box(frame["end"], "GOAL", (255, 194, 107))

    for trail in frame["trails"].values():
        points = [xyz(p) for p in trail]
        if len(points) > 1:
            d.line(points, fill=(88, 186, 255, 155), width=S(2), joint="curve")
    for _, pos, reached in sorted(frame["drones"], key=lambda v: v[1][0] - v[1][1]):
        x, y = xyz(pos)
        ground = xyz((pos[0], pos[1], 0))
        d.line((ground, (x, y)), fill=(88, 186, 255, 85), width=S(1))
        d.ellipse((ground[0]-S(3), ground[1]-S(3), ground[0]+S(3), ground[1]+S(3)), fill=(88, 186, 255, 85))
        r = S(6)
        d.ellipse((x-r-S(5), y-r-S(5), x+r+S(5), y+r+S(5)), fill=(88, 186, 255, 45))
        d.ellipse((x-r, y-r, x+r, y+r), fill=TEAL if reached else BLUE, outline=WHITE, width=S(1))

    d.text((S(78), S(617)), "X", font=small_font, fill=BLUE)
    d.text((S(107), S(617)), "Y", font=small_font, fill=TEAL)
    d.text((S(136), S(617)), "Z ↑", font=small_font, fill=AMBER)
    d.text((S(57), S(690)), "OBLIQUE 3D REPLAY FROM PROJECT PYTHON SIMULATION", font=label_font, fill=WHITE)
    return image


def main():
    pattern = simulate("pattern_formation", 20, 12)
    obstacle = simulate("obstacle_avoidance", 19, 20)
    render(pattern[-1]).save(OUTPUT / "pattern-replay.png", optimize=True)
    render(obstacle[60]).save(OUTPUT / "obstacle-replay.png", optimize=True)
    render_oblique(obstacle[60], (1600, 900)).save(OUTPUT / "simulation-poster.png", optimize=True)

    def compact_frames(frames):
        return [[[drone_id, *[round(v, 3) for v in pos], int(reached)]
                 for drone_id, pos, reached in frame["drones"]] for frame in frames]

    replay = {
        "pattern": {
            "frames": compact_frames(pattern),
            "targets": [[round(v, 3) for v in p] for p in pattern[0]["targets"]],
        },
        "obstacle": {
            "frames": compact_frames(obstacle),
            "pillars": [[round(v, 3) for v in pos[:2]] + [round(radius, 3), 20]
                        for pos, radius in obstacle[0]["obstacles"]],
            "start": [round(v, 3) for v in obstacle[0]["start"]],
            "end": [round(v, 3) for v in obstacle[0]["end"]],
        },
    }
    data_path = ROOT / "js/sic-swarm-data.js"
    data_path.write_text("window.SIC_SWARM_REPLAY = " + json.dumps(replay, separators=(",", ":")) + ";\n", encoding="utf-8")

    print("Wrote", OUTPUT / "pattern-replay.png")
    print("Wrote", OUTPUT / "obstacle-replay.png")
    print("Wrote", OUTPUT / "simulation-poster.png")
    print("Wrote", data_path)
    print("Final obstacle replay: active/reached =", len(obstacle[-1]["drones"]))


if __name__ == "__main__":
    main()
