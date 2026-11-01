// Reuse all critic measurements and geometry. The local copy of the shared launch
// harness also disables background throttling for repeated Windows/Edge runs.
const H = require('../harness');
H.launch = require('./harness').launch;
module.exports = require('../critic-driving/lib');
