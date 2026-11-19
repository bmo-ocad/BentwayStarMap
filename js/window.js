// window.js — touch, mouse and keyboard controls: look around by dragging or
// with the arrow keys, zoom, and tap the sky.
//
// This file only reports what you did. main.js decides what it means: in
// Window mode a drag moves the view; in Pointer mode the phone's sensors
// move the view, and a drag corrects the compass instead.

window.StarMap = window.StarMap || {};

StarMap.windowMode = (function () {
  // canvas: the sky canvas. s: the shared settings object.
  // api.pan(dYaw, dPitch): the user asked to turn the view by this many degrees.
  // api.changed(): the zoom changed.
  // api.tapped(x, y): the sky was clicked or tapped without dragging.
  function attach(canvas, s, api) {
    function zoomBy(factor) {
      s.fov = Math.min(120, Math.max(20, s.fov * factor));
      api.changed();
    }

    // Fingers or mouse buttons currently down, by id.
    const down = new Map();
    let moved = 0, downTime = 0, pinchDist = 0;

    function spread() {
      const p = Array.from(down.values());
      return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }

    canvas.addEventListener("pointerdown", function (e) {
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 1) { moved = 0; downTime = Date.now(); }
      if (down.size === 2) pinchDist = spread();
      canvas.classList.add("dragging");
      // Keep receiving this drag even if the pointer leaves the canvas.
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    });

    canvas.addEventListener("pointermove", function (e) {
      const p = down.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);

      if (down.size === 1) {
        // Drag: the sky follows your finger or mouse.
        const degPerPixel = s.fov / Math.max(canvas.clientWidth, canvas.clientHeight);
        api.pan(-dx * degPerPixel, dy * degPerPixel);
      } else if (down.size === 2) {
        // Pinch with two fingers: zoom.
        const d = spread();
        if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
        pinchDist = d;
      }
    });

    function release(e) {
      if (!down.has(e.pointerId)) return;
      const wasSingle = down.size === 1;
      down.delete(e.pointerId);
      if (down.size === 0) canvas.classList.remove("dragging");
      // A quick press that barely moved counts as a tap on the sky.
      if (e.type === "pointerup" && wasSingle && moved < 8 && Date.now() - downTime < 600) {
        api.tapped(e.clientX, e.clientY);
      }
      moved = 99;   // after a pinch, lifting the second finger is not a tap
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    // Mouse wheel or trackpad: zoom.
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomBy(Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.0015));
    }, { passive: false });

    // Keyboard: arrows pan (hold Shift for big steps), + and - zoom.
    window.addEventListener("keydown", function (e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "SELECT") return;   // using the settings panel
      const step = (e.shiftKey ? 10 : 3) * (s.fov / 70);
      switch (e.key) {
        case "ArrowLeft": api.pan(-step, 0); break;
        case "ArrowRight": api.pan(step, 0); break;
        case "ArrowUp": api.pan(0, step); break;
        case "ArrowDown": api.pan(0, -step); break;
        case "+": case "=": zoomBy(0.9); break;
        case "-": case "_": zoomBy(1 / 0.9); break;
        default: return;
      }
      e.preventDefault();
    });
  }

  return { attach: attach };
})();
