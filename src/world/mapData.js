// Pure map data (no imports). World units are metres; +X east, +Z south.
// Coordinates follow PLAN.md §2. Small deviations to make the road network
// consistent are marked "ADJ". Landmarks read JUNCTIONS / LANDMARKS / MARINE_DRIVE_PTS.

export const BOUNDS = { minX: -900, maxX: 900, minZ: -1000, maxZ: 1000 };

/** Marine Drive centreline control points (the road passes through exactly these). */
export const MARINE_DRIVE_PTS = [
  [-300, 860], // J_NP
  [-360, 700],
  [-385, 520], // joins Madame Cama Rd (ADJ from -390,500)
  [-420, 300],
  [-455, 100],
  [-495, -90], // J_MDVN (ADJ from -500,-100)
  [-560, -300],
  [-630, -500],
  [-700, -700],
  [-780, -900], // Chowpatty end
];

/** Named junctions (id -> {x,z}). J_REGAL is the centre of the roundabout. */
export const JUNCTIONS = {
  J_NP: { x: -300, z: 860 },
  J_MDVN: { x: -495, z: -90 },
  J_CG: { x: -260, z: -120 },
  J_FF: { x: 200, z: -160 },
  J_KG: { x: 280, z: 250 },
  J_REGAL: { x: 330, z: 520 },
  J_CSMT: { x: 480, z: -760 },
  J_METRO: { x: 120, z: -880 },
};

export const REGAL = { x: 330, z: 520, r: 18 };

/** Signalised junctions (ids as in NODES). */
export const SIGNALS = ['J_CG', 'J_MDVN', 'J_FF', 'J_KG', 'J_CSMT', 'J_METRO'];

/** Every graph node: id -> [x, z]. */
const N = {};
function node(id, x, z) {
  N[id] = [x, z];
}
node('J_NP', -300, 860);
node('MD1', -360, 700);
node('MC', -385, 520);
node('MD3', -420, 300);
node('MD4', -455, 100);
node('J_MDVN', -495, -90);
node('MD5', -560, -300);
node('MD6', -630, -500);
node('MD7', -700, -700);
node('CHOW', -780, -900);
// Maharshi Karve Rd
node('J_MCK', -260, 500);
node('K2', -250, 40);
node('J_CG', -260, -120);
node('KB1', -318, -190); // ADJ: bends west to clear Churchgate station
node('K3', -345, -500);
node('MLINES', -420, -900);
// Veer Nariman Rd / Mayo Rd
node('J_MAYO', 0, -143);
node('J_FF', 200, -160);
node('MCM', 0, 485); // Madame Cama x Mayo
// M.G. Road
node('J_METRO', 120, -880);
node('MG0', 150, -500);
node('MG1', 240, 80);
node('J_KG', 280, 250);
// Regal ring (clockwise, 8 nodes)
const RC = { x: 330, z: 520, r: 18 };
const RING = ['R_N', 'R_NE', 'R_E', 'R_SE', 'R_S', 'R_SW', 'R_W', 'R_NW'];
RING.forEach((id, i) => {
  const a = (i * Math.PI) / 4; // 0 = north, increasing clockwise (north-up map)
  node(id, +(RC.x + RC.r * Math.sin(a)).toFixed(2), +(RC.z - RC.r * Math.cos(a)).toFixed(2));
});
// D.N. Road / CSMT
node('DN1', 370, -290);
node('DN2', 450, -450); // ADJ: routed east of Azad Maidan
node('DN3', 455, -620);
node('J_CSMT', 480, -760);
// Colaba Causeway / Cuffe Parade
node('CC890', 339, 890);
node('CCEND', 340, 950);
node('CP1', -100, 900);
// Apollo Bunder / Gateway
node('AB1', 480, 590);
node('G_N', 570, 596);
node('G_S', 568, 648);
// P. D'Mello Rd (ADJ: x=590 so the garage at 650 and Gateway plaza stay clear)
node('PD450', 590, -450);
node('PD80', 590, 80);
node('PD250', 590, 250);
node('PD300', 590, 300);
node('PDB', 600, 520);
// Fort grid
node('FN80', 450, 80);
node('FN250', 450, 250);
node('FN300', 450, 300);

export const NODES = N;

/**
 * Roads. lanes = lanes per direction, width in metres, limit m/s.
 * smooth: Hermite spline through the nodes; median: 2 m median strip;
 * oneway: lanes only in the listed direction (centred on the centreline);
 * seaSide: +1/-1 = promenade side (left/right of travel).
 */
export const ROADS = [
  {
    id: 'marine_drive', name: 'Marine Drive',
    pts: ['J_NP', 'MD1', 'MC', 'MD3', 'MD4', 'J_MDVN', 'MD5', 'MD6', 'MD7', 'CHOW'],
    lanes: 3, width: 23, limit: 20, median: true, smooth: true, seaSide: 1,
  },
  {
    id: 'karve', name: 'Maharshi Karve Rd',
    pts: ['J_NP', 'J_MCK', 'K2', 'J_CG', 'KB1', 'K3', 'MLINES'],
    lanes: 2, width: 14, limit: 14, smooth: true,
  },
  {
    id: 'veer_nariman', name: 'Veer Nariman Rd',
    pts: ['J_MDVN', 'J_CG', 'J_MAYO', 'J_FF'],
    lanes: 2, width: 14, limit: 14,
  },
  {
    id: 'dn_road', name: 'D.N. Road',
    pts: ['J_FF', 'DN1', 'DN2', 'DN3', 'J_CSMT'],
    lanes: 2, width: 14, limit: 14, smooth: true,
  },
  {
    id: 'mg_road', name: 'M.G. Road',
    pts: ['J_METRO', 'MG0', 'J_FF', 'MG1', 'J_KG', 'R_N'],
    lanes: 2, width: 14, limit: 14, smooth: true,
  },
  {
    id: 'mahapalika', name: 'Mahapalika Marg',
    pts: ['J_METRO', 'J_CSMT'],
    lanes: 2, width: 14, limit: 14,
  },
  {
    id: 'marine_lines', name: 'Marine Lines Rd',
    pts: ['CHOW', 'MLINES', 'J_METRO'],
    lanes: 2, width: 14, limit: 14,
  },
  {
    id: 'madame_cama', name: 'Madame Cama Rd',
    pts: ['MC', 'J_MCK', 'MCM', 'R_W'],
    lanes: 2, width: 14, limit: 14,
  },
  {
    id: 'colaba_causeway', name: 'Colaba Causeway',
    pts: ['R_S', 'CC890', 'CCEND'],
    lanes: 2, width: 14, limit: 14,
  },
  {
    id: 'apollo_bunder', name: 'Apollo Bunder',
    pts: ['R_E', 'AB1', 'G_N', 'G_S'],
    lanes: 2, width: 14, limit: 11, smooth: true,
  },
  {
    id: 'cuffe_parade', name: 'Cuffe Parade Rd',
    pts: ['J_NP', 'CP1', 'CC890'],
    lanes: 2, width: 14, limit: 14, smooth: true,
  },
  {
    id: 'pd_mello', name: "P. D'Mello Rd",
    pts: ['J_CSMT', 'PD450', 'PD80', 'PD250', 'PD300', 'PDB', 'G_N'],
    lanes: 2, width: 14, limit: 14,
  },
  { id: 'fort_ew1', name: 'Fort St 1', pts: ['DN2', 'PD450'], lanes: 1, width: 7, limit: 11 },
  { id: 'fort_ew2', name: 'Fort St 2', pts: ['MG1', 'FN80', 'PD80'], lanes: 1, width: 7, limit: 11 },
  { id: 'fort_ew3', name: 'Fort St 3', pts: ['J_KG', 'FN250', 'PD250'], lanes: 1, width: 7, limit: 11 },
  { id: 'fort_ns', name: 'Fort Ave', pts: ['DN2', 'FN80', 'FN250', 'FN300'], lanes: 1, width: 7, limit: 11 },
  { id: 'mayo', name: 'Mayo Rd', pts: ['J_MAYO', 'MCM'], lanes: 1, width: 7, limit: 11 },
  {
    id: 'regal_circle', name: 'Regal Circle',
    pts: ['R_N', 'R_NE', 'R_E', 'R_SE', 'R_S', 'R_SW', 'R_W', 'R_NW', 'R_N'],
    lanes: 1, width: 7, limit: 8, oneway: true, smooth: true,
  },
];

/** Points of interest (not buildings). */
export const POIS = {
  SPAWN: { x: -240, z: -150 },
  HOSP: { x: 330, z: -900 },
  COPS: { x: 380, z: 800 },
  GARAGE: { x: 650, z: -300 },
};

/** Landmark footprints (axis-aligned centre + full size), per §2. */
export const LANDMARKS = [
  { id: 'csmt', name: 'CSMT', x: 600, z: -820, w: 180, d: 70 },
  { id: 'gateway', name: 'Gateway of India', x: 620, z: 640, w: 80, d: 60 },
  { id: 'taj', name: 'Taj Mahal Palace', x: 530, z: 700, w: 90, d: 60 },
  { id: 'rajabai', name: 'Rajabai Tower', x: 40, z: 250, w: 24, d: 24 },
  { id: 'highcourt', name: 'High Court', x: 100, z: 130, w: 80, d: 140 },
  { id: 'churchgate', name: 'Churchgate Station', x: -220, z: -175, w: 140, d: 40 },
  { id: 'flora', name: 'Flora Fountain', x: 200, z: -160, w: 24, d: 24 },
  { id: 'air_india', name: 'Air India Tower', x: -250, z: 915, w: 40, d: 30 },
  { id: 'ncpa', name: 'NCPA', x: -335, z: 915, w: 26, d: 26 },
  { id: 'trident', name: 'Trident', x: -295, z: 935, w: 28, d: 26 },
  { id: 'hosp', name: 'GT Hospital', x: 330, z: -900, w: 60, d: 30 },
  { id: 'cops', name: 'Colaba Police Stn', x: 380, z: 800, w: 44, d: 26 },
  { id: 'garage', name: 'Mistry Garage', x: 650, z: -300, w: 24, d: 16 },
];

export const MAIDANS = [
  { id: 'cross', name: 'Cross Maidan', x0: -180, x1: -30, z0: -380, z1: -200 },
  { id: 'oval', name: 'Oval Maidan', x0: -230, x1: -40, z0: 40, z1: 440, pitches: true },
  { id: 'azad', name: 'Azad Maidan', x0: 180, x1: 420, z0: -640, z1: -420 },
];

/** Beach sand at Chowpatty. */
export const SAND = { x0: -790, x1: -715, z0: -980, z1: -915 };

/** Fort district (stone/cream buildings 15-28 m). */
export const FORT_ZONE = { x0: 150, x1: 700, z0: -900, z1: 350 };

/** East coast and south coast control points (land polygon, clockwise from Chowpatty). */
export const COAST = {
  north: -1000,
  eastNorth: [[760, -1000], [760, 300]],
  eastSouth: [[690, 300], [690, 540], [712, 600], [714, 640], [712, 680], [690, 740], [690, 800]],
  south: [[650, 960], [-200, 960], [-300, 966], [-352, 938], [-346, 886]],
  marineOffset: 22,
};
