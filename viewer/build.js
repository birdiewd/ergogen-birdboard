// Builds this project into output/: Ergogen (config.yaml + footprints/) plus the v4 wiring
// board channels, maps and reports. The work is done in-process by wiring/build.js.
//
// CLI:    node viewer/build.js        (same as `npm run build`)
// Module: require('./build').build()  -> Promise<{ code, log }>
//
// The viewer server stays running while you edit, so every build drops the cached wiring
// modules first; otherwise edits to wiring/*.js would only apply after a server restart.

const path = require('path')

const WIRING = path.resolve(__dirname, '..', 'wiring') + path.sep

const build = opts => {
  for (const key of Object.keys(require.cache)) if (key.startsWith(WIRING)) delete require.cache[key]
  return require('../wiring/build').build(opts)
}

module.exports = { build }

if (require.main === module) build({ echo: true }).then(({ code, clashes }) => process.exit(code || (clashes ? 1 : 0)))
