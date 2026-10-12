// Map data for Marine Drive + Fort, South Bombay.
// Coordinates: metres. +X = east, +Z = south (so north is -Z). Ground at y = 0.
// The real area is compressed (~0.35x) but keeps the relative layout:
//   Back Bay sea on the west, Marine Drive curving along it (the "Queen's Necklace"),
//   Art Deco precinct between Marine Drive and Maharshi Karve Rd,
//   Oval / Cross / Azad Maidans, Victorian Gothic (High Court, Rajabai Tower),
//   Fort's dense streets around Flora Fountain and Horniman Circle,
//   CST in the north-east, Kala Ghoda + Regal Circle, Gateway of India on the harbour.
// India drives on the LEFT. Roundabouts circulate clockwise (seen from above).

export const NODES = {
  // Marine Drive (south -> north)
  NP:     { x: -425, z: 420 },             // Nariman Point
  MD_C:   { x: -404, z: 260 },
  MD_VN:  { x: -401, z: 100 },
  MD_D:   { x: -404, z: -10 },
  MD_ML:  { x: -414, z: -120 },
  MD_F:   { x: -448, z: -250 },
  MD_N2:  { x: -515, z: -395 },
  MD_NX:  { x: -590, z: -505, exit: true }, // towards Chowpatty (map edge)
  // Jamshedji Tata Rd (Art Deco precinct, parallel to MD)
  JT_S:   { x: -318, z: 405 },
  JT_C:   { x: -316, z: 258 },
  JT_VN:  { x: -314, z: 98 },
  JT_D:   { x: -316, z: -10 },
  JT_ML:  { x: -320, z: -120 },
  // Maharshi Karve Rd
  MK_S:   { x: -230, z: 400 },
  MK_C:   { x: -230, z: 258 },
  MK_VN:  { x: -230, z: 95 },             // Churchgate
  MK_D:   { x: -232, z: -10 },
  MK_ML:  { x: -235, z: -122 },
  MK_F:   { x: -245, z: -255 },
  MK_N:   { x: -258, z: -392 },
  // Karmaveer Bhaurao Patil Marg / Hazarimal Somani Marg (east of Oval & Cross Maidan)
  KBP_S:  { x: -95, z: 396 },
  KBP_U:  { x: -94, z: 305 },
  KBP_VN: { x: -92, z: 90 },
  X1:     { x: -82, z: -20 },
  AZW:    { x: -72, z: -128 },
  AZ_M:   { x: -67, z: -258 },
  AZN:    { x: -62, z: -385 },
  // Fort
  FLORA:  { x: 60, z: 55, roundabout: 15 },  // Flora Fountain / Hutatma Chowk
  DN1:    { x: 76, z: -40 },
  DN2:    { x: 90, z: -135 },
  DN_M:   { x: 108, z: -255 },
  CST:    { x: 125, z: -375 },
  CST_X:  { x: 140, z: -545, exit: true },
  HORN:   { x: 250, z: 105, roundabout: 32 }, // Horniman Circle
  SBS_N:  { x: 272, z: -380 },
  SBS_NX: { x: 280, z: -545, exit: true },
  SBS_M:  { x: 269, z: -255 },
  SBS1:   { x: 266, z: -132 },
  F3:     { x: 260, z: -15 },
  K2:     { x: 252, z: 175 },
  SBS2:   { x: 255, z: 232 },
  SBS3:   { x: 252, z: 330 },
  K1:     { x: 70, z: 150 },
  KG:     { x: 82, z: 225 },                // Kala Ghoda
  MG_U:   { x: 100, z: 290 },
  REGAL:  { x: 112, z: 345, roundabout: 22 }, // Regal Circle (Wellington Fountain)
  COL_X:  { x: 120, z: 548, exit: true },   // Colaba Causeway (map edge)
  GATE:   { x: 362, z: 385 },               // Apollo Bunder / Gateway plaza (dead end)
};

// Each road is a chain of node ids; the centreline is a centripetal Catmull-Rom
// spline through the nodes. lanes = lanes PER DIRECTION. width = kerb-to-kerb.
// median = width of central divider (0 = painted line only).
export const ROADS = [
  { name: 'Marine Drive', nodes: ['NP', 'MD_C', 'MD_VN', 'MD_D', 'MD_ML', 'MD_F', 'MD_N2', 'MD_NX'], lanes: 3, width: 24, median: 2.4, kind: 'boulevard' },
  { name: 'Madame Cama Rd', nodes: ['NP', 'JT_S', 'MK_S', 'KBP_S', 'REGAL'], lanes: 2, width: 15, median: 1, kind: 'arterial' },
  { name: 'Veer Nariman Rd', nodes: ['MD_VN', 'JT_VN', 'MK_VN', 'KBP_VN', 'FLORA', 'HORN'], lanes: 2, width: 14, median: 0, kind: 'arterial' },
  { name: 'Jamshedji Tata Rd', nodes: ['JT_S', 'JT_C', 'JT_VN', 'JT_D', 'JT_ML'], lanes: 1, width: 9, median: 0, kind: 'street' },
  { name: 'Maharshi Karve Rd', nodes: ['MK_S', 'MK_C', 'MK_VN', 'MK_D', 'MK_ML', 'MK_F', 'MK_N'], lanes: 2, width: 14, median: 0, kind: 'arterial' },
  { name: 'Dorabji Tata Rd', nodes: ['MD_C', 'JT_C', 'MK_C'], lanes: 1, width: 9, median: 0, kind: 'street' },
  { name: 'D Road', nodes: ['MD_D', 'JT_D', 'MK_D'], lanes: 1, width: 8, median: 0, kind: 'street' },
  { name: 'Vithaldas Thackersey Marg', nodes: ['MD_ML', 'JT_ML', 'MK_ML', 'AZW', 'DN2'], lanes: 2, width: 12, median: 0, kind: 'arterial' },
  { name: 'F Road', nodes: ['MD_F', 'MK_F'], lanes: 1, width: 8, median: 0, kind: 'street' },
  { name: 'Princess Street', nodes: ['MD_N2', 'MK_N'], lanes: 2, width: 12, median: 0, kind: 'arterial' },
  { name: 'Mahapalika Marg', nodes: ['MK_N', 'AZN', 'CST', 'SBS_N'], lanes: 2, width: 14, median: 0, kind: 'arterial' },
  { name: 'Karmaveer Bhaurao Patil Marg', nodes: ['KBP_S', 'KBP_U', 'KBP_VN'], lanes: 2, width: 13, median: 0, kind: 'arterial' },
  { name: 'Hazarimal Somani Marg', nodes: ['KBP_VN', 'X1', 'AZW', 'AZ_M', 'AZN'], lanes: 2, width: 12, median: 0, kind: 'arterial' },
  { name: 'Marine Lines Rd', nodes: ['MK_F', 'AZ_M'], lanes: 1, width: 9, median: 0, kind: 'street' },
  { name: 'Bazargate Street', nodes: ['X1', 'DN1', 'F3'], lanes: 1, width: 8, median: 0, kind: 'lane' },
  { name: 'Dadabhai Naoroji Rd', nodes: ['FLORA', 'DN1', 'DN2', 'DN_M', 'CST', 'CST_X'], lanes: 2, width: 14, median: 0, kind: 'arterial' },
  { name: 'Walchand Hirachand Marg', nodes: ['DN_M', 'SBS_M'], lanes: 1, width: 9, median: 0, kind: 'street' },
  { name: 'Perin Nariman Street', nodes: ['DN2', 'SBS1'], lanes: 1, width: 8, median: 0, kind: 'lane' },
  { name: 'Mahatma Gandhi Rd', nodes: ['FLORA', 'K1', 'KG', 'MG_U', 'REGAL'], lanes: 2, width: 13, median: 0, kind: 'arterial' },
  { name: 'Colaba Causeway', nodes: ['REGAL', 'COL_X'], lanes: 2, width: 13, median: 0, kind: 'arterial' },
  { name: 'Shahid Bhagat Singh Rd', nodes: ['SBS_NX', 'SBS_N', 'SBS_M', 'SBS1', 'F3', 'HORN', 'K2', 'SBS2', 'SBS3'], lanes: 2, width: 12, median: 0, kind: 'arterial' },
  { name: 'Forbes Street', nodes: ['K1', 'K2'], lanes: 1, width: 8, median: 0, kind: 'lane' },
  { name: 'Rampart Row', nodes: ['KG', 'SBS2'], lanes: 1, width: 9, median: 0, kind: 'street' },
  { name: 'Esplanade Lane', nodes: ['KBP_U', 'MG_U'], lanes: 1, width: 9, median: 0, kind: 'street' },
  { name: 'Apollo Bunder', nodes: ['REGAL', 'SBS3', 'GATE'], lanes: 2, width: 14, median: 0, kind: 'arterial' },
];

// Open spaces (no buildings). Polygons as [x,z] lists.
export const PARKS = [
  { name: 'Oval Maidan', kind: 'maidan', poly: [[-221, 106], [-103, 101], [-104, 387], [-221, 391]] },
  { name: 'Cross Maidan', kind: 'maidan', poly: [[-223, -114], [-81, -122], [-90, 84], [-221, 87]] },
  { name: 'Azad Maidan', kind: 'maidan', poly: [[-59, -146], [80, -145], [113, -366], [-53, -375]] },
];

// Landmarks: approximate centre + footprint (w along x, d along z) + rotation (radians about Y).
// The city builder owns their look; these are placement hints and keep-out zones for filler buildings.
export const LANDMARKS = [
  { id: 'gateway', name: 'Gateway of India', x: 398, z: 390, w: 26, d: 18, rot: 0 },
  { id: 'taj', name: 'Taj Mahal Palace', x: 318, z: 438, w: 86, d: 50, rot: 0 },
  { id: 'highcourt', name: 'Bombay High Court', x: -50, z: 150, w: 62, d: 88, rot: 0 },
  { id: 'university', name: 'University of Mumbai', x: -48, z: 250, w: 66, d: 80, rot: 0, tower: { x: -66, z: 262, h: 85 } },
  { id: 'secretariat', name: 'Old Secretariat', x: -50, z: 343, w: 64, d: 44, rot: 0 },
  { id: 'davidsassoon', name: 'David Sassoon Library', x: 38, z: 170, w: 40, d: 34, rot: 0 },
  { id: 'elphinstone', name: 'Elphinstone College', x: 40, z: 250, w: 44, d: 52, rot: 0 },
  { id: 'csmvs', name: 'Prince of Wales Museum', x: 20, z: 335, w: 64, d: 36, rot: 0 },
  { id: 'jehangir', name: 'Jehangir Art Gallery', x: 132, z: 262, w: 30, d: 24, rot: 0 },
  { id: 'regal', name: 'Regal Cinema', x: 155, z: 378, w: 40, d: 30, rot: 0 },
  { id: 'cst', name: 'Chhatrapati Shivaji Terminus', x: 198, z: -440, w: 110, d: 70, rot: 0 },
  { id: 'bmc', name: 'BMC Headquarters', x: 75, z: -438, w: 60, d: 66, rot: 0 },
  { id: 'policehq', name: 'Azad Maidan Police Station', x: -20, z: -432, w: 56, d: 50, rot: 0 },
  { id: 'churchgate', name: 'Churchgate Station', x: -273, z: 55, w: 58, d: 50, rot: 0 },
  { id: 'eros', name: 'Eros Cinema', x: -270, z: 128, w: 50, d: 36, rot: 0 },
  { id: 'townhall', name: 'Asiatic Society Town Hall', x: 325, z: 105, w: 40, d: 84, rot: 0 },
  { id: 'cathedral', name: 'St. Thomas Cathedral', x: 185, z: 120, w: 22, d: 40, rot: 0 },
  { id: 'airindia', name: 'Air India Building', x: -372, z: 448, w: 34, d: 34, rot: 0 },
  { id: 'trident', name: 'Hotel Marine Plaza', x: -365, z: 160, w: 34, d: 40, rot: 0 },
];

// Kala Ghoda horse statue, Flora Fountain, Wellington Fountain (Regal) etc. sit on the nodes above.
export const MONUMENTS = [
  { id: 'flora', name: 'Flora Fountain', node: 'FLORA' },
  { id: 'horniman', name: 'Horniman Circle Garden', node: 'HORN' },
  { id: 'wellington', name: 'Wellington Fountain', node: 'REGAL' },
  { id: 'kalaghoda', name: 'Kala Ghoda', node: 'KG' },
];

// Where the sea is. LAND is built at runtime in roads.js (Marine Drive's sea edge is
// derived from the road spline). These constants describe the rest of the coast.
export const COAST = {
  promenadeWidth: 10,         // sea-side walkway on Marine Drive (beyond the kerb)
  seaWallOffset: 0,           // extra gap between promenade and the drop to the sea
  southShoreZ: 470,           // Back Bay south shore (Nariman Point / Cuffe Parade) for x < southShoreSplitX
  southShoreSplitX: -110,
  southEdgeZ: 565,            // land boundary south of Regal (Colaba continues off-map)
  harbourX: 418,              // Bombay Harbour shoreline (Apollo Bunder / docks)
  northEdgeZ: -565,
  seaLevel: -1.6,
};

export const SPAWN = { x: -388, z: 150, heading: Math.PI }; // land-side pavement of Marine Drive, facing north

export const AREA_NAMES = [
  // coarse district names for the HUD, first match wins: [name, minX, maxX, minZ, maxZ]
  ['Nariman Point', -520, -280, 395, 520],
  ['Marine Drive', -700, -380, -600, 400],
  ['Churchgate', -330, -180, -20, 160],
  ['Oval Maidan', -225, -95, 100, 395],
  ['Cross Maidan', -225, -80, -125, 100],
  ['Marine Lines', -700, -60, -600, -120],
  ['Backbay', -400, -230, -600, 400],
  ['Azad Maidan', -80, 120, -380, -140],
  ['CST', -80, 420, -600, -380],
  ['Kala Ghoda', 0, 250, 180, 320],
  ['Apollo Bunder', 230, 450, 300, 600],
  ['Colaba', -110, 450, 360, 600],
  ['Horniman Circle', 180, 420, 40, 180],
  ['Fort', -100, 450, -380, 360],
];

// Street cross-section shared by the city (builds it) and peds/traffic (use it).
// From a road centreline: carriageway to width/2, then kerb + footpath to width/2 + footpath,
// then building frontage starts at width/2 + footpath + setback.
export const STREET = {
  footpath: 4,              // normal footpath width (m)
  mdLandFootpath: 5,        // Marine Drive land-side footpath
  promenade: 10,            // Marine Drive sea-side promenade (== COAST.promenadeWidth)
  kerbHeight: 0.15,         // visual only; physics treats ground as flat y = 0
  setback: 0.5,             // footpath edge -> building face
  fortArcade: 3,            // Fort buildings often have a colonnaded arcade over the footpath (ground floor recessed)
  zebraOffset: 2,           // zebra crossing starts this far beyond a junction's radius
};
// Junctions with traffic signals (owned by Traffic: logic + signal heads). City must leave the corners free.
export const SIGNALS = ['MD_VN', 'MK_VN', 'KBP_VN', 'MD_ML', 'MK_ML', 'DN2', 'CST', 'KG', 'SBS1', 'MK_S', 'KBP_S', 'AZW', 'SBS3'];
