// Builds this project into output/: Ergogen (config.yaml + footprints/) plus the v4 wiring
// board channels, map and report. The work is done in-process by wiring/build.js.
//
// CLI:    node viewer/build.js        (same as `npm run build`)
// Module: require('./build').build()  -> Promise<{ code, log }>

const { build } = require('../wiring/build')

module.exports = { build }

if (require.main === module) build({ echo: true }).then(({ code }) => process.exit(code || 0))
