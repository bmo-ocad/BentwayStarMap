// pointer.js — "Pointer mode": reads the phone's motion sensors and works out
// which part of the sky the phone is aimed at.
//
// The phone reports its attitude as three angles:
//   alpha = which way it is turned, like a compass
//   beta  = how far it is tipped forward or back
//   gamma = how far it is tipped left or right
// From those we work out the direction of one of the phone's own axes (the
// back of the phone, or its top edge) as East / North / Up, and from that a
// compass direction (yaw) and a height above the horizon (pitch).

window.StarMap = window.StarMap || {};

StarMap.pointerMode = (function () {
  const RAD = Math.PI / 180;
  let listener = null, eventName = "";
  let aim = "back";          // "back" = back of the phone, "top" = its top edge
  let northFix = null;       // iPhone only: correction that turns its alpha into a true compass angle

  // Can this device and page use motion sensors at all?
  function supported() {
    return typeof DeviceOrientationEvent !== "undefined" && window.isSecureContext !== false;
  }

  // Start listening. onAim(yaw, pitch) is called with every new reading.
  // Must be called from a tap or click: iPhones only show their permission
  // prompt in response to one. Resolves to "ok", "denied" or "unsupported".
  function start(onAim) {
    if (!supported()) return Promise.resolve("unsupported");
    stop();
    const ask = typeof DeviceOrientationEvent.requestPermission === "function"
      ? DeviceOrientationEvent.requestPermission()      // iPhone / iPad
      : Promise.resolve("granted");                      // Android and others
    return ask.then(function (answer) {
      if (answer !== "granted") return "denied";
      // Android has a separate event whose alpha is measured from true compass north.
      eventName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
      northFix = null;
      listener = function (e) { read(e, onAim); };
      window.addEventListener(eventName, listener);
      return "ok";
    }).catch(function () { return "denied"; });
  }

  function stop() {
    if (listener) window.removeEventListener(eventName, listener);
    listener = null;
  }

  function setAim(which) { aim = which === "top" ? "top" : "back"; }

  function read(e, onAim) {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;   // no sensor
    let alpha = e.alpha;

    // iPhones measure alpha from wherever the phone happened to be facing,
    // and report the real compass heading separately. Use the two together
    // to find the correction, and keep refining it gently. The heading is
    // only trustworthy while the phone's top edge is fairly level.
    if (typeof e.webkitCompassHeading === "number" && e.webkitCompassHeading >= 0) {
      const want = 360 - e.webkitCompassHeading - e.alpha;
      if (northFix === null) northFix = want;
      else if (Math.cos(e.beta * RAD) > 0.6) northFix += ((((want - northFix) % 360) + 540) % 360 - 180) * 0.03;
    }
    if (northFix !== null) alpha += northFix;

    const cA = Math.cos(alpha * RAD), sA = Math.sin(alpha * RAD);
    const cB = Math.cos(e.beta * RAD), sB = Math.sin(e.beta * RAD);
    const cG = Math.cos(e.gamma * RAD), sG = Math.sin(e.gamma * RAD);

    // Direction of the chosen phone axis in the world (standard formulas
    // from the web's device-orientation specification).
    let east, north, up;
    if (aim === "top") {
      east = -cB * sA; north = cA * cB; up = sB;
    } else {
      east = -(cG * sA * sB + cA * sG); north = cA * cG * sB - sA * sG; up = -cB * cG;
    }

    const pitch = Math.asin(Math.max(-1, Math.min(1, up))) / RAD;
    // Aimed almost straight up or down, "compass direction" stops meaning
    // anything and would spin wildly, so only update it when it is reliable.
    const level = Math.hypot(east, north);
    const yaw = level > 0.05 ? ((Math.atan2(east, north) / RAD) + 360) % 360 : null;
    onAim(yaw, pitch);
  }

  return { supported: supported, start: start, stop: stop, setAim: setAim };
})();
