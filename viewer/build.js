// Runs Ergogen on this project.
//
// Ergogen's CLI, when given a folder, opens a read stream for every file in it,
// node_modules included, which makes it hang. So we copy just config.yaml and
// footprints/ into a staging folder and build from there.
//
// CLI:    node viewer/build.js        (same as `npm run build`)
// Module: require('./build').build()  -> Promise<{ code, log }>

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const ERGOGEN = path.join(ROOT, 'node_modules', 'ergogen', 'src', 'cli.js')
const STAGE = path.join(os.tmpdir(), 'ergogen-stage-' + Buffer.from(ROOT).toString('hex').slice(-16))

const stage = () => {
  fs.rmSync(STAGE, { recursive: true, force: true })
  fs.mkdirSync(STAGE, { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'config.yaml'), path.join(STAGE, 'config.yaml'))
  const fp = path.join(ROOT, 'footprints')
  if (fs.existsSync(fp)) fs.cpSync(fp, path.join(STAGE, 'footprints'), { recursive: true })
  return STAGE
}

const build = ({ echo = false } = {}) => new Promise(resolve => {
  let dir
  try { dir = stage() } catch (err) { return resolve({ code: -1, log: String(err) }) }
  const proc = spawn(process.execPath, [ERGOGEN, dir, '-o', path.join(ROOT, 'output'), '--clean'], { cwd: ROOT })
  let log = ''
  const take = d => { log += d; if (echo) process.stdout.write(d) }
  proc.stdout.on('data', take)
  proc.stderr.on('data', take)
  proc.on('error', err => resolve({ code: -1, log: String(err) }))
  proc.on('close', code => resolve({ code, log: log.trim() }))
})

module.exports = { build }

if (require.main === module) build({ echo: true }).then(({ code }) => process.exit(code || 0))
