// info.js — the words shown in the box when you tap a star.

window.StarMap = window.StarMap || {};

StarMap.info = (function () {
  // Short notes for well-known stars, keyed by the star's proper name.
  // Add your own here: "Star name": "One or two sentences.",
  const BLURBS = {
    "Sirius": "The brightest star in the night sky. It has a faint white-dwarf companion, Sirius B, about the size of Earth.",
    "Canopus": "The second-brightest star in the night sky. Spacecraft use it as a reference point to keep their bearings.",
    "Rigil Kentaurus": "Alpha Centauri, the nearest star system to the Sun. Its light takes just over four years to reach us.",
    "Arcturus": "A red giant, and the brightest star in the northern half of the sky. Its light was used to switch on the 1933 Chicago World's Fair.",
    "Vega": "Vega was the North Star about 14,000 years ago, and will be again in about 12,000 years.",
    "Capella": "Looks like one star but is four: a close pair of yellow giants and a pair of faint red dwarfs.",
    "Rigel": "A blue supergiant giving off tens of thousands of times the Sun's light. It marks Orion's foot.",
    "Procyon": "One of the Sun's nearest neighbours. Like Sirius, it has a white-dwarf companion.",
    "Betelgeuse": "A red supergiant so large it would swallow the orbit of Mars if it sat where the Sun is. One day it will explode as a supernova.",
    "Achernar": "Spins so fast that it is flattened: much wider across its equator than from pole to pole.",
    "Altair": "Spins once about every 9 hours, which flattens it noticeably. The Sun takes almost a month.",
    "Aldebaran": "The orange eye of Taurus the Bull. It appears among the Hyades star cluster but is less than half as far away.",
    "Antares": "Its name means \"rival of Mars\", for its red colour. A supergiant hundreds of times wider than the Sun.",
    "Spica": "Two stars orbiting each other every four days, so close that their gravity pulls them into egg shapes.",
    "Pollux": "The nearest giant star to the Sun, with at least one known planet.",
    "Fomalhaut": "Surrounded by a huge ring of dust and debris that telescopes have photographed directly.",
    "Deneb": "One of the most luminous stars visible to the naked eye. It is so far away that its distance is still uncertain.",
    "Regulus": "The heart of Leo the Lion. It spins once in under a day, close to the speed at which it would fly apart.",
    "Polaris": "The North Star. It sits less than one degree from the sky's north pole, so it barely moves while the rest of the sky turns around it.",
    "Castor": "Looks like one star but is six, arranged in three close pairs.",
    "Mizar": "With its faint neighbour Alcor, a traditional test of eyesight. It was the first double star seen through a telescope.",
    "Algol": "The \"Demon Star\". Every 2.9 days it dims for a few hours as a fainter companion passes in front of it.",
    "Mira": "Swells and shrinks over about 11 months, fading from easy naked-eye view to invisible and back.",
    "Alcyone": "The brightest star of the Pleiades cluster, also called the Seven Sisters.",
    "Albireo": "A small telescope splits it into a gold star and a blue one, one of the sky's best colour contrasts.",
    "Thuban": "The North Star when the Egyptian pyramids were built, about 4,700 years ago.",
    "Dubhe": "One of the two \"pointer\" stars of the Big Dipper: a line from Merak through Dubhe leads to Polaris.",
    "Merak": "One of the two \"pointer\" stars of the Big Dipper: a line from Merak through Dubhe leads to Polaris.",
    "Alnilam": "The middle star of Orion's Belt, and the most distant of the three.",
    "Bellatrix": "Orion's left shoulder. Its name is Latin for \"female warrior\".",
  };

  // What each spectral class letter means for a star's colour (hottest first).
  const CLASS_COLOURS = { O: "blue", B: "blue-white", A: "white", F: "yellow-white", G: "yellow", K: "orange", M: "red" };
  const SUPERSCRIPT = { "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

  // row = one star from data/stars.js. Returns the text for the info box.
  function describe(row) {
    const mag = row[2], ly = row[4], spect = row[5], con = row[6];
    const bayer = row[7], flam = row[8], proper = row[9], id = row[10];
    const conNames = (window.CONSTELLATION_NAMES || {})[con] || [con, con];

    // Designation such as "α Lyrae" (Bayer) or "61 Cygni" (Flamsteed).
    let designation = "";
    if (bayer) designation = bayer.replace(/\d/g, function (d) { return SUPERSCRIPT[d] || d; }) + " " + conNames[1];
    else if (flam) designation = flam + " " + conNames[1];

    const title = proper || designation || id || "Unnamed star";
    const subtitle = proper ? (designation || id) : (designation ? id : "");

    let distance = "Unknown";
    if (ly > 0) distance = (ly < 100 ? String(Math.round(ly * 10) / 10) : Math.round(ly).toLocaleString()) + " light-years";

    let spectral = spect || "Unknown";
    const colour = CLASS_COLOURS[(spect || "").charAt(0)];
    if (colour) spectral += " · " + colour;

    return {
      title: title,
      subtitle: subtitle,
      facts: [
        ["Distance", distance],
        ["Brightness", "magnitude " + mag.toFixed(2)],
        ["Constellation", conNames[0] || "Unknown"],
        ["Spectral class", spectral],
      ],
      blurb: BLURBS[proper] || "",
    };
  }

  return { describe: describe };
})();
