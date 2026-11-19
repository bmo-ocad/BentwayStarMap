// main.js — starts everything up and keeps the picture current.

(function () {
  const $ = function (id) { return document.getElementById(id); };
  const canvas = $("sky");
  const ctx = canvas.getContext("2d");
  const cat = StarMap.sky.prepareStars(window.STAR_DATA);
  const sky = {
    stars: cat,
    lines: StarMap.sky.prepareLines(window.CONSTELLATION_LINES),
    names: StarMap.sky.prepareNames(window.CONSTELLATION_NAMES),
  };
  const view = StarMap.view;

  // ---- Settings (remembered between visits) --------------------------------
  const s = {
    lat: 40, lon: -100, hasLocation: false,
    yaw: 180,          // compass direction the view is aiming for
    pitch: 30,         // tilt above the horizon
    fov: 70,           // width of the view in degrees
    starBoost: 1.3,    // star size and glow; raise it for washed-out projectors
    labelDetail: 2,    // 0 = only the very brightest stars are labelled, 4 = many
    showLines: true,   // constellation lines
    showLabels: true,  // star names and Greek letters
    showConNames: true, // constellation names
    aim: "back",       // Pointer mode: aim with the "back" of the phone or its "top" edge
    pointerSmooth: 0.25, // Pointer mode: seconds of smoothing; more = steadier but laggier
    yawOffset: 0,      // Pointer mode: compass correction in degrees, set by dragging
  };
  try {
    Object.assign(s, JSON.parse(localStorage.getItem("starmap-settings") || "{}"));
  } catch (e) { /* storage unavailable: just use the defaults */ }

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem("starmap-settings", JSON.stringify(s)); } catch (e) {}
    }, 400);
  }

  // ---- Drawing, with a smooth glide ------------------------------------------
  // "cam" is where the picture is right now. Each frame it closes part of the
  // gap to the aim in the settings, so movement eases in and out instead of
  // jumping. GLIDE is how long that takes, in seconds: smaller = snappier.
  const GLIDE = 0.085;
  const cam = { yaw: s.yaw, pitch: s.pitch, fov: s.fov };
  let needsDraw = true, lastDraw = 0, lastFrame = 0;
  let selected = -1;   // index of the tapped star, or -1 for none
  let selectTime = 0;  // when it was tapped, for the lock-on animation

  // Speed check: press P to show, in the status line, how long each picture
  // takes to draw and how many pictures per second you get while moving.
  let showSpeed = false, drawCost = 0, frameGap = 16.7;

  function resize() {
    // Draw at the screen's own sharpness, but no finer than 2x: some phones
    // report 3x, which would mean far more pixels to paint for no visible gain.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Use the size the canvas actually covers on screen, which on iPhones can
    // be taller than the browser reports for the page itself.
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    needsDraw = true;
  }
  window.addEventListener("resize", resize);
  resize();

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    // Pointer mode glides more slowly, to steady a hand-held, jittery sensor.
    const k = 1 - Math.exp(-dt / (pointerOn ? s.pointerSmooth : GLIDE));
    const dYaw = ((s.yaw - cam.yaw + 540) % 360) - 180;   // shortest way round
    const dPitch = s.pitch - cam.pitch, dFov = s.fov - cam.fov;
    const gliding = Math.abs(dYaw) > 0.01 || Math.abs(dPitch) > 0.01 || Math.abs(dFov) > 0.01;
    if (gliding) {
      cam.yaw = (cam.yaw + dYaw * k + 360) % 360;
      cam.pitch += dPitch * k;
      cam.fov += dFov * k;
    }

    // Redraw while moving, while the lock-on animation plays, or when
    // something changed, and at least once a second so the sky keeps turning
    // with the clock.
    const age = now - selectTime;
    const locking = selected >= 0 && age < StarMap.render.LOCK_DONE + 100;
    if (gliding || locking || needsDraw || now - lastDraw > 1000) {
      const drawStart = performance.now();
      if (now - lastDraw < 100) frameGap += (now - lastDraw - frameGap) * 0.1;   // smoothed
      const date = new Date();
      StarMap.sky.update(sky.stars, date, s.lat, s.lon);
      StarMap.sky.update(sky.lines, date, s.lat, s.lon);
      StarMap.sky.update(sky.names, date, s.lat, s.lon);
      cam.crosshair = pointerOn;   // mark the exact spot the phone is aimed at
      StarMap.render.draw(ctx, canvas.width, canvas.height, sky, cam, s, selected, age);
      placeInfoBox(age);
      drawCost += (performance.now() - drawStart - drawCost) * 0.1;
      updateHud(date);
      needsDraw = false;
      lastDraw = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // The label font loads a moment after the page; redraw once it arrives.
  if (document.fonts && document.fonts.load) {
    document.fonts.load("20px DotGothic16").then(function () { needsDraw = true; });
  }

  function changed() { needsDraw = true; save(); syncPanel(); }
  function wrap(deg) { return ((deg % 360) + 360) % 360; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Called when the user drags the sky or presses an arrow key.
  function pan(dYaw, dPitch) {
    if (pointerOn) {
      // The sensors decide where the view points, so a sideways drag is
      // taken as a correction to the compass: drag the sky to where it
      // should be and it stays corrected. (Height needs no correcting: the
      // phone measures that from gravity, which is reliable.)
      s.yawOffset = wrap(s.yawOffset + dYaw + 180) - 180;
      applyAim();
    } else {
      s.yaw = wrap(s.yaw + dYaw);
      s.pitch = clamp(s.pitch + dPitch, -30, 90);
    }
    changed();
  }

  StarMap.windowMode.attach(canvas, s, { pan: pan, changed: changed, tapped: pickStar });

  // ---- Pointer mode: the phone's motion sensors aim the view -------------------
  let pointerOn = false, gotReading = false;
  let rawYaw = s.yaw, rawPitch = s.pitch;    // latest sensor reading, before correction
  const modeButton = $("mode-toggle");
  const pointerAvailable = StarMap.pointerMode.supported() &&
    (navigator.maxTouchPoints > 0 || /[?&]pointer/.test(location.search));
  modeButton.hidden = !pointerAvailable;
  $("pointer-settings").hidden = !pointerAvailable;

  function onAim(yaw, pitch) {
    gotReading = true;
    if (yaw !== null) rawYaw = yaw;
    rawPitch = pitch;
    applyAim();
  }
  function applyAim() {
    s.yaw = wrap(rawYaw + s.yawOffset);
    s.pitch = clamp(rawPitch, -80, 90);
    needsDraw = true;
  }

  function startPointer() {
    StarMap.pointerMode.setAim(s.aim);
    StarMap.pointerMode.start(onAim).then(function (result) {
      if (result === "denied") {
        toast("Motion access was not allowed. Close and reopen the page to be asked again.");
        return;
      }
      if (result !== "ok") { toast("Pointer mode needs a phone and a secure (https) page."); return; }
      pointerOn = true;
      gotReading = false;
      updateModeUi();
      // Some devices allow the request but have no sensor and never report.
      setTimeout(function () {
        if (pointerOn && !gotReading) { stopPointer(); toast("No motion sensor found on this device."); }
      }, 2500);
      // Where the browser allows it (Android), hide the browser bars.
      // Upright or sideways both work, so the screen is not locked either way.
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function () {});
      }
    });
  }
  function stopPointer() {
    StarMap.pointerMode.stop();
    pointerOn = false;
    s.pitch = clamp(s.pitch, -30, 90);
    updateModeUi();
    changed();
  }
  function updateModeUi() {
    modeButton.textContent = pointerOn ? "Window mode" : "Pointer mode";
    needsDraw = true;
  }
  modeButton.addEventListener("click", function () { if (pointerOn) stopPointer(); else startPointer(); });
  $("reset-cal").addEventListener("click", function () {
    s.yawOffset = 0;
    if (pointerOn) applyAim();
    changed();
    toast("Compass correction cleared.");
  });

  // A short message at the bottom of the screen that clears itself.
  let toastTimer = 0;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 5000);
  }

  // ---- Tapping a star ---------------------------------------------------------
  const infoBox = $("info");

  // Find the star under the tap and select it. Tapping empty sky clears the
  // selection. Bright stars are easy targets (you can be up to 28 pixels
  // off) and fainter ones need a closer tap. The faintest stars cannot be
  // picked at all until you zoom in, because there are so many of them that
  // a tap on "empty" sky would nearly always land on one.
  function pickStar(clientX, clientY) {
    const dpr = canvas.width / canvas.clientWidth;
    const x = clientX * dpr, y = clientY * dpr;
    view.setup(cam.yaw, cam.pitch, cam.fov, canvas.width, canvas.height);
    const faintest = 4.5 + Math.min(2.5, Math.max(-1, (70 - cam.fov) / 20));
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < cat.n; i++) {
      if (cat.mag[i] > faintest) break;          // the list is brightest-first
      if (!view.project(cat.east[i], cat.north[i], cat.up[i])) continue;
      const reach = Math.min(28, Math.max(10, 10 + (4 - cat.mag[i]) * 5)) * dpr;
      const d = Math.hypot(view.x - x, view.y - y);
      if (d > reach) continue;
      const score = d / reach + cat.mag[i] * 0.12;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0 && best !== selected) {
      fillInfoBox(StarMap.info.describe(cat.rows[best]));
      selectTime = performance.now();
    }
    selected = best;
    needsDraw = true;
  }
  function clearSelection() { selected = -1; needsDraw = true; }
  $("info-close").addEventListener("click", clearSelection);

  function fillInfoBox(d) {
    $("info-title").textContent = d.title;
    $("info-sub").textContent = d.subtitle;
    const facts = $("info-facts");
    facts.textContent = "";
    d.facts.forEach(function (f) {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = f[0];
      dd.textContent = f[1];
      facts.appendChild(dt);
      facts.appendChild(dd);
    });
    $("info-blurb").textContent = d.blurb;
  }

  // Keep the box beside its star as the view moves. It appears once the
  // lock-on animation has finished, hides while the star is off-screen, and
  // returns when the star does.
  function placeInfoBox(age) {
    let visible = false, x = 0, y = 0;
    if (selected >= 0 && age >= StarMap.render.LOCK_DONE &&
        view.project(cat.east[selected], cat.north[selected], cat.up[selected])) {
      const dpr = canvas.width / canvas.clientWidth;
      x = view.x / dpr; y = view.y / dpr;
      visible = x > 0 && x < canvas.clientWidth && y > 0 && y < canvas.clientHeight;
    }
    infoBox.hidden = !visible;
    if (!visible) return;
    const w = infoBox.offsetWidth, h = infoBox.offsetHeight, gap = 30;
    let left = x + gap;
    if (left + w > canvas.clientWidth - 8) left = x - gap - w;   // no room on the right
    left = Math.max(8, left);
    const top = Math.max(8, Math.min(canvas.clientHeight - h - 8, y - 24));
    infoBox.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
  }

  // ---- Status line ----------------------------------------------------------
  const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  function updateHud(date) {
    const dir = COMPASS[Math.round(s.yaw / 45) % 8];
    $("hud").textContent =
      (pointerOn ? "Pointer · " : "") + "Facing " + Math.round(s.yaw) + "° " + dir +
      " · tilt " + Math.round(s.pitch) + "°" +
      " · " + Math.round(s.fov) + "° wide" +
      " · " + Math.abs(s.lat).toFixed(2) + "°" + (s.lat >= 0 ? "N " : "S ") +
      Math.abs(s.lon).toFixed(2) + "°" + (s.lon >= 0 ? "E" : "W") +
      " · " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
      (showSpeed ? " · draw " + drawCost.toFixed(1) + " ms · " + Math.round(1000 / frameGap) + " fps moving" +
        " · " + canvas.width + "x" + canvas.height : "");
  }

  // ---- Settings panel -------------------------------------------------------
  // Every control in the panel has the same id as the setting it changes.
  const panel = $("panel");
  const controls = Array.from(panel.querySelectorAll("input, select"));

  function syncPanel() {
    if (panel.hidden) return;
    controls.forEach(function (el) {
      if (el.type === "checkbox") el.checked = !!s[el.id];
      else if (el.tagName === "SELECT") el.value = s[el.id];
      else if (document.activeElement !== el) el.value = Math.round(s[el.id] * 100) / 100;
    });
  }
  function openPanel(note) {
    $("panel-note").textContent = note || "";
    panel.hidden = false;
    syncPanel();
    wake();
  }
  function closePanel() { panel.hidden = true; wake(); }

  controls.forEach(function (el) {
    el.addEventListener("input", function () {
      if (el.type === "checkbox") {
        s[el.id] = el.checked;
      } else if (el.tagName === "SELECT") {
        s[el.id] = el.value;
        if (el.id === "aim") { StarMap.pointerMode.setAim(s.aim); updateModeUi(); }
      } else {
        const v = parseFloat(el.value);
        if (isNaN(v)) return;
        s[el.id] = Math.min(parseFloat(el.max), Math.max(parseFloat(el.min), v));
        if (el.id === "lat" || el.id === "lon") s.hasLocation = true;
      }
      needsDraw = true;
      save();
    });
  });

  $("locate").addEventListener("click", function () {
    if (!navigator.geolocation) {
      $("panel-note").textContent = "This browser can't find your location. Type it in below.";
      return;
    }
    $("panel-note").textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      s.lat = pos.coords.latitude;
      s.lon = pos.coords.longitude;
      s.hasLocation = true;
      $("panel-note").textContent = "";
      changed();
    }, function () {
      $("panel-note").textContent = "Couldn't get your location. Type it in below.";
    });
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }
  $("fullscreen").addEventListener("click", toggleFullscreen);
  $("open-settings").addEventListener("click", function () { openPanel(); });
  $("close-panel").addEventListener("click", closePanel);

  window.addEventListener("keydown", function (e) {
    if (e.target.tagName === "SELECT" || (e.target.tagName === "INPUT" && e.target.type === "number")) return;
    if (e.key === "f" || e.key === "F") toggleFullscreen();
    if (e.key === "p" || e.key === "P") { showSpeed = !showSpeed; needsDraw = true; }
    if (e.key === "s" || e.key === "S") { if (panel.hidden) openPanel(); else closePanel(); }
    if (e.key === "Escape") {
      if (!panel.hidden) closePanel();
      else clearSelection();
    }
  });

  // ---- Hide the controls and the mouse cursor when idle ----------------------
  let idleTimer = 0;
  function wake() {
    document.body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (panel.hidden) document.body.classList.add("idle");
    }, 4000);
  }
  ["pointermove", "pointerdown", "keydown"].forEach(function (name) {
    window.addEventListener(name, wake);
  });
  wake();

  // ---- Keep the screen awake during a show -----------------------------------
  // Browsers only allow this after you interact with the page, and only on
  // secure (https or localhost) pages; elsewhere it quietly does nothing.
  let wakeLock = null;
  function keepAwake() {
    if (!navigator.wakeLock || wakeLock || document.visibilityState !== "visible") return;
    navigator.wakeLock.request("screen").then(function (lock) {
      wakeLock = lock;
      lock.addEventListener("release", function () { wakeLock = null; });
    }).catch(function () {});
  }
  window.addEventListener("pointerdown", keepAwake);
  window.addEventListener("keydown", keepAwake);
  document.addEventListener("visibilitychange", keepAwake);

  // First visit: ask where you are, because the sky depends on it.
  if (!s.hasLocation) openPanel("Set your location so the sky matches what's outside.");
})();
