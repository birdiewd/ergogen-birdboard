// Builds the project and writes every case and wiring board as an STL into stl/ (tracked in
// git, unlike output/), so the printable files ship with the repo.
//
// CLI: node viewer/export-stl.js   (same as `npm run stl`)

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { build } = require('./build')
const { repairFile, isKeycap } = require('./stl-repair')

const ROOT = path.resolve(__dirname, '..')
const CASES = path.join(ROOT, 'output', 'cases')
const STL = path.join(ROOT, 'stl')
const OPENJSCAD = path.join(ROOT, 'node_modules', '@jscad', 'openjscad', 'src', 'cli', 'cli.js')

// (a keycap's mesh is repaired after: see stl-repair.js)
const convert = (src, dst) => new Promise(resolve => {
  const proc = spawn(process.execPath, [OPENJSCAD, src, '-of', 'stlb', '-o', dst], { cwd: ROOT })
  let log = ''
  proc.stdout.on('data', d => (log += d))
  proc.stderr.on('data', d => (log += d))
  proc.on('close', code => {
    if (code === 0 && isKeycap(dst) && fs.existsSync(dst)) {
      const r = repairFile(dst)
      if (r.open) log += `\n${path.basename(dst)}: ${r.open} open edges left after the repair`
    }
    resolve({ code, log: log.trim() })
  })
})

const main = async () => {
  const { code, clashes } = await build({ echo: false })
  if (code) return code
  if (clashes) console.warn('warning: the wiring check found clashes (see output/wiring/report_*.md)')
  fs.mkdirSync(STL, { recursive: true })
  for (const f of fs.readdirSync(STL)) if (f.endsWith('.stl')) fs.unlinkSync(path.join(STL, f))
  const jscads = fs.readdirSync(CASES).filter(f => f.endsWith('.jscad'))
  const results = await Promise.all(jscads.map(async f => {
    const dst = path.join(STL, f.replace(/\.jscad$/, '.stl'))
    const r = await convert(path.join(CASES, f), dst)
    const ok = r.code === 0 && fs.existsSync(dst)
    console.log(`${ok ? 'ok  ' : 'FAIL'} stl/${path.basename(dst)}`)
    if (!ok) console.error(r.log)
    return ok
  }))
  // the legend print files for the UV printer, and their previews, into keymap/print/
  const PRINT = path.join(ROOT, 'keymap', 'print'), KM = path.join(ROOT, 'output', 'keymap')
  fs.mkdirSync(PRINT, { recursive: true })
  for (const f of fs.readdirSync(KM).filter(f => f.endsWith('.svg'))) {
    fs.copyFileSync(path.join(KM, f), path.join(PRINT, f))
    console.log(`ok   keymap/print/${f}`)
  }
  // the case and plate art's print files for the UV printer, into art/print/
  const ART = path.join(ROOT, 'art', 'print'), AO = path.join(ROOT, 'output', 'art', 'print')
  fs.mkdirSync(ART, { recursive: true })
  for (const f of fs.readdirSync(AO).filter(f => f.endsWith('.svg'))) {
    fs.copyFileSync(path.join(AO, f), path.join(ART, f))
    console.log(`ok   art/print/${f}`)
  }
  return results.every(Boolean) ? 0 : 1
}

main().then(code => process.exit(code))
