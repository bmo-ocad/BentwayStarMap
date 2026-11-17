// render.js — draws one frame of the sky onto the canvas.

window.StarMap = window.StarMap || {};

StarMap.render = (function () {
  const RAD = Math.PI / 180;
  const view = StarMap.view;
  const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const LABEL_FONT = "DotGothic16, monospace";

  // The colour theme: a warm cream for everything that is not a star.
  // (Other palettes can be added later by swapping this block.)
  const THEME = {
    lines: "rgba(226, 218, 190, 0.4)",        // drawn dotted, so they read fainter than this
    starName: "rgba(238, 231, 208, 0.92)",
    starLetter: "rgba(216, 209, 187, 0.58)",
    constellation: "rgba(214, 207, 186, 0.36)",
    haze: "rgba(120, 116, 104, 0.15)",         // dots of faint glow low in the sky
    ground: "rgba(0, 0, 0, 0.5)",             // see-through dimming below the horizon
    groundGrain: "rgba(150, 146, 132, 0.16)", // sparse dots that give the ground texture
    horizon: "rgba(222, 214, 188, 0.5)",
    compass: "rgba(236, 229, 204, 0.9)",
    reticle: "#f2ead2",
  };

  // Dithering: instead of a smooth see-through wash, shade an area with a
  // regular pattern of small square dots, the way old pixel art does. "level"
  // is how many dots out of every 16 are filled; px is the size of one dot.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dither(ctx, level, colour, px) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = px * 4;
    const t = tile.getContext("2d");
    t.fillStyle = colour;
    for (let i = 0; i < 16; i++) {
      if (BAYER[i] < level) t.fillRect((i % 4) * px, Math.floor(i / 4) * px, px, px);
    }
    return ctx.createPattern(tile, "repeat");
  }

  // How the lock-on animation is timed, in milliseconds.
  const LOCK_TIME = 420;     // corners spin and close in on the star
  const BLINK_TIME = 90;     // length of each off or on flash (it blinks twice)
  const LOCK_DONE = LOCK_TIME + BLINK_TIME * 4;

  // Star colors by B-V index (blue-white through orange), and a soft round
  // "glow" picture for each color, made once and reused for every star.
  const COLORS = ["#b3c7ff", "#d3deff", "#f7f7ff", "#fff3df", "#ffdcae", "#ffc488"];
  const RGB = ["179,199,255", "211,222,255", "247,247,255", "255,243,223", "255,220,174", "255,196,136"];
  const GLOWS = RGB.map(function (rgb) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(" + rgb + ",1)");
    grad.addColorStop(0.2, "rgba(" + rgb + ",0.5)");
    grad.addColorStop(0.5, "rgba(" + rgb + ",0.14)");
    grad.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  });
  // Speed: filling a big area with a dot pattern is slow in some browsers, so
  // the haze and the ground are each painted once onto a hidden canvas and
  // then stamped onto the sky as a single picture every frame. They are only
  // repainted when the window changes size.
  let layers = null;
  function getLayers(ctx, width, height, px) {
    const key = width + "x" + height + "/" + px;
    if (layers && layers.key === key) return layers;

    // Haze: bands of dots that thin out with height (about a fifth of the screen).
    const HAZE_LEVELS = [5, 4, 3, 2, 1];                 // dots per 16, from the horizon up
    const band = Math.max(px * 4, Math.round((height * 0.045) / (px * 4)) * px * 4);
    const haze = document.createElement("canvas");
    haze.width = width;
    haze.height = band * HAZE_LEVELS.length;
    const h = haze.getContext("2d");
    for (let b = 0; b < HAZE_LEVELS.length; b++) {
      h.fillStyle = dither(h, HAZE_LEVELS[b], THEME.haze, px);
      h.fillRect(0, haze.height - band * (b + 1), width, band);
    }

    // Ground: a see-through dimming with a sparse sprinkle of dots.
    const ground = document.createElement("canvas");
    ground.width = width;
    ground.height = height;
    const g = ground.getContext("2d");
    g.fillStyle = THEME.ground;
    g.fillRect(0, 0, width, height);
    g.fillStyle = dither(g, 1, THEME.groundGrain, px);
    g.fillRect(0, 0, width, height);

    layers = { key: key, haze: haze, ground: ground };
    return layers;
  }

  // Measuring text is slowish, so each label's width is remembered.
  const widthCache = {};
  function textWidth(ctx, text, size) {
    const key = size + text;
    if (widthCache[key] === undefined) widthCache[key] = ctx.measureText(text).width;
    return widthCache[key];
  }

  function colorIndex(bv) {
    return bv < 0 ? 0 : bv < 0.3 ? 1 : bv < 0.6 ? 2 : bv < 1.0 ? 3 : bv < 1.4 ? 4 : 5;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Size of a star's solid dot, in canvas pixels.
  function coreRadius(mag, unit, s, fov) {
    const zoom = clamp(Math.sqrt(70 / fov), 0.8, 1.6);   // zooming in enlarges stars a little
    return Math.max(0.5, 0.85 * Math.pow(1.42, 2.5 - mag)) * unit * s.starBoost * zoom;
  }

  // sky = { stars, lines, names }. cam = where the camera is right now
  // (yaw, pitch, fov). s = settings. selected = index of the tapped star or
  // -1, and selectedAge = milliseconds since it was tapped.
  function draw(ctx, width, height, sky, cam, s, selected, selectedAge) {
    const cat = sky.stars;
    // "unit" scales sizes with the picture, so the map looks the same on a
    // phone screen and on a three-metre wall.
    const unit = height / 800;
    const nameSize = Math.round(Math.max(16, 20 * unit));
    // One "block": the size of a single pixel of the label font. Lines, the
    // lock-on box and the dither dots are all built from blocks this size.
    const px = Math.max(2, Math.round(nameSize / 16));
    view.setup(cam.yaw, cam.pitch, cam.fov, width, height);
    const horizonY = Math.round(view.horizonY / px) * px;

    // Sky: black, with a faint haze low down near the horizon. The haze is
    // dithered: bands of dots that thin out with height (to about 20 degrees up).
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const layers = getLayers(ctx, width, height, px);
    if (horizonY > 0 && horizonY - layers.haze.height < height) {
      ctx.drawImage(layers.haze, 0, horizonY - layers.haze.height);
    }

    // Lines use smaller blocks when zoomed out, so small figures stay fine.
    if (s.showLines) {
      drawLines(ctx, width, height, sky.lines, Math.max(1, Math.round(px * clamp(45 / cam.fov, 0.5, 1))));
    }

    // Stars. Both the glow and the opacity follow apparent magnitude: bright
    // stars get a wide bloom, faint ones are small and partly see-through.
    // "lighter" makes overlapping glows add up like real light.
    // Stars below the horizon are drawn too; the ground tint dims them later.
    const nameLimit = 0.5 + s.labelDetail * 0.75 + clamp((70 - cam.fov) / 20, -1, 2.5);
    const bayerLimit = nameLimit + 1.5;
    const starNames = [], starLetters = [];
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < cat.n; i++) {
      if (!view.project(cat.east[i], cat.north[i], cat.up[i])) continue;
      const x = view.x, y = view.y;
      if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;

      const mag = cat.mag[i];
      // Speed: under the ground dimming the faintest stars are invisible
      // anyway, so skip them, and skip the glow on all but the brightest.
      const below = cat.up[i] < 0;
      if (below && mag > 5) continue;
      const ci = colorIndex(cat.bv[i]);
      const r = coreRadius(mag, unit, s, cam.fov);

      const glowAlpha = clamp(0.5 - 0.1 * mag, 0, 0.7);
      if (glowAlpha > (below ? 0.3 : 0.03)) {
        const g = r * 5.5;
        ctx.globalAlpha = glowAlpha;
        ctx.drawImage(GLOWS[ci], x - g, y - g, g * 2, g * 2);
      }
      ctx.globalAlpha = clamp(1.05 - 0.17 * (mag - 1.5), 0.22, 1);
      ctx.fillStyle = COLORS[ci];
      if (r < 1.3) {
        // Speed: a dot this small looks the same as a square, which is much
        // quicker to draw than a circle. Most stars are this small.
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
      }

      // Decide on a label: a proper name for the brightest stars, just the
      // Greek (Bayer) letter for the next tier, nothing for the rest.
      // (The selected star is named by its info box instead.)
      if (s.showLabels && mag <= bayerLimit && i !== selected) {
        const row = cat.rows[i];
        const lx = x + r + 7 * unit;
        if (row[9] && mag <= nameLimit) starNames.push([row[9], lx, y, "left", nameSize, THEME.starName]);
        else if (row[7]) starLetters.push([row[7].replace(/\d+/, ""), lx, y, "left", Math.round(nameSize * 0.85), THEME.starLetter]);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Constellation names, centred on each figure.
    const conNames = [];
    if (s.showConNames) {
      const n = sky.names;
      for (let i = 0; i < n.n; i++) {
        if (!view.project(n.east[i], n.north[i], n.up[i])) continue;
        if (view.x < 0 || view.x > width || view.y < 0 || view.y > height) continue;
        conNames.push([n.text[i], view.x, view.y, "center", Math.round(nameSize * 0.7), THEME.constellation]);
      }
    }
    // Order matters when labels collide: star names win, then constellation
    // names, then Greek letters.
    drawLabels(ctx, starNames.concat(conNames, starLetters));

    // Ground: the sky below the horizon stays visible, just dimmed, with a
    // sparse sprinkle of dots for texture.
    if (horizonY < height) {
      const top = Math.max(0, horizonY);
      ctx.drawImage(layers.ground, 0, 0, width, height - top, 0, top, width, height - top);
      ctx.fillStyle = THEME.horizon;
      ctx.fillRect(0, horizonY, width, px);
    }
    drawCompass(ctx, width, height, unit);

    // Pointer mode: a small cross in the middle marks where the phone is aimed.
    if (cam.crosshair) {
      const cx = Math.round(width / 2 / px) * px, cy = Math.round(height / 2 / px) * px;
      ctx.fillStyle = THEME.reticle;
      ctx.globalAlpha = 0.7;
      for (let k = 3; k <= 6; k++) {          // four arms, leaving a gap in the centre
        ctx.fillRect(cx + k * px, cy, px, px);
        ctx.fillRect(cx - k * px, cy, px, px);
        ctx.fillRect(cx, cy + k * px, px, px);
        ctx.fillRect(cx, cy - k * px, px, px);
      }
      ctx.globalAlpha = 1;
    }

    if (selected >= 0 && view.project(cat.east[selected], cat.north[selected], cat.up[selected])) {
      const half = coreRadius(cat.mag[selected], unit, s, cam.fov) * 2 + 13 * unit;
      drawReticle(ctx, view.x, view.y, half, px, selectedAge);
    }
  }

  // Stick figures joining the stars of each constellation. Each line is built
  // from square blocks on a grid (so it looks pixelated, like the font), and
  // only every other block is filled, which gives a dotted, dithered line.
  function drawLines(ctx, width, height, lines, px) {
    const cols = Math.ceil(width / px), rows = Math.ceil(height / px);
    ctx.fillStyle = THEME.lines;
    for (let l = 0; l < lines.starts.length - 1; l++) {
      let prevOk = false, prevX = 0, prevY = 0;
      for (let i = lines.starts[l]; i < lines.starts[l + 1]; i++) {
        const ok = view.project(lines.east[i], lines.north[i], lines.up[i]);
        const gx = Math.round(view.x / px), gy = Math.round(view.y / px);   // grid position
        if (ok && prevOk) {
          const dx = gx - prevX, dy = gy - prevY;
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          const onScreen = Math.max(gx, prevX) >= 0 && Math.min(gx, prevX) <= cols &&
                           Math.max(gy, prevY) >= 0 && Math.min(gy, prevY) <= rows;
          if (onScreen && steps > 0 && steps < 12000) {
            for (let k = 0; k <= steps; k += 2) {
              const x = prevX + Math.round((dx * k) / steps), y = prevY + Math.round((dy * k) / steps);
              if (x >= 0 && x <= cols && y >= 0 && y <= rows) ctx.fillRect(x * px, y * px, px, px);
            }
          }
        }
        prevOk = ok; prevX = gx; prevY = gy;
      }
    }
  }

  // Compass letters sitting just under the horizon line.
  function drawCompass(ctx, width, height, unit) {
    const size = Math.round(Math.max(16, 24 * unit));
    ctx.font = size + "px " + LABEL_FONT;
    ctx.textAlign = "center";
    ctx.fillStyle = THEME.compass;
    for (let k = 0; k < 8; k++) {
      const az = k * 45 * RAD;
      if (!view.project(Math.sin(az), Math.cos(az), 0)) continue;
      if (view.x < 0 || view.x > width || view.y < 0 || view.y > height) continue;
      const roomBelow = view.y + size * 1.5 < height;
      ctx.textBaseline = roomBelow ? "top" : "bottom";
      ctx.fillText(COMPASS[k], view.x, view.y + (roomBelow ? 6 : -6) * unit);
    }
  }

  // Labels: [text, x, y, "left" or "center", size, colour]. Earlier labels in
  // the list win; a label that would overlap one already drawn is left out.
  function drawLabels(ctx, labels) {
    const placed = [];
    ctx.textBaseline = "middle";
    for (const l of labels) {
      const size = l[4];
      ctx.font = size + "px " + LABEL_FONT;
      const w = textWidth(ctx, l[0], size);
      const left = l[3] === "center" ? l[1] - w / 2 : l[1];
      const box = [left, l[2] - size / 2, left + w, l[2] + size / 2];
      let clash = false;
      for (const p of placed) {
        if (box[0] < p[2] + 4 && box[2] > p[0] - 4 && box[1] < p[3] + 2 && box[3] > p[1] - 2) { clash = true; break; }
      }
      if (clash) continue;
      placed.push(box);
      ctx.textAlign = "left";
      ctx.fillStyle = l[5];
      ctx.fillText(l[0], left, l[2]);
    }
  }

  // The lock-on box: four corner brackets built from square blocks the same
  // size as the pixels of the label font. When a star is picked, the corners
  // start wide and turned, spin inward onto the star, then blink twice.
  //   half = half the width of the settled box; px = size of one block;
  //   age = milliseconds since the star was picked.
  function drawReticle(ctx, x, y, half, px, age) {
    let spread = 1, angle = 0;
    if (age < LOCK_TIME) {
      const p = age / LOCK_TIME;
      const ease = 1 - Math.pow(1 - p, 3);          // fast at first, settling gently
      spread = 1 + (1 - ease) * 1.8;                // zooms in from nearly 3x size
      angle = (1 - ease) * -Math.PI / 2;            // a quarter-turn spin
      ctx.globalAlpha = 0.35 + 0.65 * ease;
    } else if (age < LOCK_DONE) {
      // off, on, off, then on for good: two blinks
      if (Math.floor((age - LOCK_TIME) / BLINK_TIME) % 2 === 0) return;
    }

    const q = Math.max(3, Math.round((half * spread) / px));   // half-size, in blocks
    const arm = Math.max(2, Math.round(q * 0.5));              // bracket arm length, in blocks
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const cx = Math.round(x), cy = Math.round(y);
    ctx.fillStyle = THEME.reticle;

    // Place one block, turned by the spin angle and snapped to the block grid
    // so the edges stay hard and square even mid-spin.
    function block(bx, by) {
      const rx = Math.round(bx * cos - by * sin), ry = Math.round(bx * sin + by * cos);
      ctx.fillRect(cx + rx * px - px / 2, cy + ry * px - px / 2, px, px);
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      for (let k = 0; k <= arm; k++) {
        block(sx * q, sy * (q - k));
        if (k > 0) block(sx * (q - k), sy * q);
      }
    }
    ctx.globalAlpha = 1;
  }

  return { draw: draw, LOCK_DONE: LOCK_DONE };
})();
