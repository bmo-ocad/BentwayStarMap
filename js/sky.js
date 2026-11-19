// sky.js — the astronomy.
//
// Stars have fixed addresses on the sky (right ascension and declination, like
// longitude and latitude on a globe). This file works out where each one
// appears from a given place at a given moment, as a direction with three
// parts: how far East, how far North, and how far Up.

window.StarMap = window.StarMap || {};

StarMap.sky = (function () {
  const RAD = Math.PI / 180;

  // A set of sky points: fixed "equatorial" directions (ex, ey, ez) and the
  // matching local-sky directions (east, north, up) that update() fills in.
  function makePoints(n) {
    return {
      n: n,
      ex: new Float32Array(n), ey: new Float32Array(n), ez: new Float32Array(n),
      east: new Float32Array(n), north: new Float32Array(n), up: new Float32Array(n),
    };
  }
  function setPoint(p, i, raDeg, decDeg) {
    const ra = raDeg * RAD, dec = decDeg * RAD;
    p.ex[i] = Math.cos(dec) * Math.cos(ra);
    p.ey[i] = Math.cos(dec) * Math.sin(ra);
    p.ez[i] = Math.sin(dec);
  }

  // Turn the star catalog rows into fast number arrays, once at startup.
  // Row layout is described at the top of data/stars.js.
  function prepareStars(rows) {
    const cat = makePoints(rows.length);
    cat.rows = rows;                              // kept for the info box
    cat.mag = new Float32Array(rows.length);      // brightness: smaller = brighter
    cat.bv = new Float32Array(rows.length);       // color: negative = blue, large = orange
    for (let i = 0; i < rows.length; i++) {
      setPoint(cat, i, rows[i][0], rows[i][1]);
      cat.mag[i] = rows[i][2];
      cat.bv[i] = rows[i][3];
    }
    return cat;
  }

  // Constellation lines: all corner points in one big list, plus where each
  // separate line starts.
  function prepareLines(lines) {
    let total = 0;
    for (const l of lines) total += l.length / 2;
    const pts = makePoints(total);
    pts.starts = [];
    let k = 0;
    for (const l of lines) {
      pts.starts.push(k);
      for (let j = 0; j < l.length; j += 2) setPoint(pts, k++, l[j], l[j + 1]);
    }
    pts.starts.push(k);
    return pts;
  }

  // Constellation names: one point per constellation, where its label goes.
  function prepareNames(names) {
    const keys = Object.keys(names);
    const pts = makePoints(keys.length);
    pts.text = [];
    keys.forEach(function (k, i) {
      setPoint(pts, i, names[k][2], names[k][3]);
      pts.text.push(names[k][0].toUpperCase());
    });
    return pts;
  }

  // Local sidereal time, in degrees: which right ascension is due south right
  // now. It is the "clock" that tracks the Earth's rotation against the stars.
  function siderealDeg(date, lonDeg) {
    const julianDay = date.getTime() / 86400000 + 2440587.5;
    const gmst = 280.46061837 + 360.98564736629 * (julianDay - 2451545.0);
    return (((gmst + lonDeg) % 360) + 360) % 360;
  }

  // Recompute every point's East/North/Up direction for this time and place.
  function update(p, date, latDeg, lonDeg) {
    const lst = siderealDeg(date, lonDeg) * RAD;
    const cosL = Math.cos(lst), sinL = Math.sin(lst);
    const cosLat = Math.cos(latDeg * RAD), sinLat = Math.sin(latDeg * RAD);
    for (let i = 0; i < p.n; i++) {
      const x = p.ex[i], y = p.ey[i], z = p.ez[i];
      const a = x * cosL + y * sinL;   // toward the point due south on the celestial equator
      const b = x * sinL - y * cosL;   // toward the west
      p.east[i] = -b;
      p.north[i] = cosLat * z - sinLat * a;
      p.up[i] = sinLat * z + cosLat * a;
    }
  }

  return { prepareStars: prepareStars, prepareLines: prepareLines, prepareNames: prepareNames, update: update, siderealDeg: siderealDeg };
})();
