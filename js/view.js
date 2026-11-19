// view.js — the camera.
//
// Imagine standing inside a huge sphere of stars, looking through a window.
// "yaw" is the compass direction the window faces, "pitch" is how far it is
// tilted up, and "fov" is how wide a slice of sky it shows. project() says
// where on the screen a given sky direction lands.

window.StarMap = window.StarMap || {};

StarMap.view = (function () {
  const RAD = Math.PI / 180;
  let fx, fy, fz;      // forward: where the camera looks
  let rx, ry;          // right (always level, so the horizon stays flat)
  let ux, uy, uz;      // up
  let scale, cx, cy;

  const view = {
    x: 0, y: 0,        // result of the last successful project() call
    horizonY: 0,       // screen height of the horizon (it is a level straight line)
    scale: 1,          // pixels per unit of "tangent"; used for sizing things

    setup: function (yawDeg, pitchDeg, fovDeg, width, height) {
      const yaw = yawDeg * RAD, pitch = pitchDeg * RAD;
      fx = Math.cos(pitch) * Math.sin(yaw);
      fy = Math.cos(pitch) * Math.cos(yaw);
      fz = Math.sin(pitch);
      rx = Math.cos(yaw);
      ry = -Math.sin(yaw);
      ux = -Math.sin(pitch) * Math.sin(yaw);
      uy = -Math.sin(pitch) * Math.cos(yaw);
      uz = Math.cos(pitch);
      // The field of view is measured across the longer side of the picture,
      // so an upright phone screen shows the same scale as a sideways one.
      scale = (Math.max(width, height) / 2) / Math.tan((fovDeg * RAD) / 2);
      cx = width / 2;
      cy = height / 2;
      view.scale = scale;
      view.horizonY = pitchDeg > 89 ? 1e9 : cy + Math.tan(pitch) * scale;
    },

    // Takes a direction (east, north, up). Returns false if it is behind the
    // camera; otherwise stores the screen position in view.x and view.y.
    project: function (east, north, up) {
      const depth = east * fx + north * fy + up * fz;
      if (depth < 0.05) return false;
      view.x = cx + ((east * rx + north * ry) / depth) * scale;
      view.y = cy - ((east * ux + north * uy + up * uz) / depth) * scale;
      return true;
    },
  };
  return view;
})();
