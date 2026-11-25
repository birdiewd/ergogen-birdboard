// Builds the viewer as a static, read-only site into dist/ (for AWS Amplify, see amplify.yml).
//
//   dist/index.html, keymap.html      the dev viewer's pages with the editor, rebuild button and
//                                     server calls taken out (patched below; the build fails loudly
//                                     if a patch no longer matches the page)
//   dist/status.json                  what the dev server streams over /events
//   dist/output/                      everything the build makes (outlines, cases as .stl, art, ...)
//   dist/vendor/three/                three.js, for the 3D tab
//   dist/art, fonts, keymap           files the keymap page loads
//   dist/moose-birdboard-downloads.zip   every case STL plus the art (SVG print files and previews)
//
// CLI: node viewer/build-static.js   (same as `pnpm run build:site`)

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { spawn } = require('child_process')
const { build } = require('./build')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'output')
const DIST = path.join(ROOT, 'dist')
const CASES = path.join(OUT, 'cases')
const OPENJSCAD = path.join(ROOT, 'node_modules', '@jscad', 'openjscad', 'src', 'cli', 'cli.js')
const THREE = path.join(ROOT, 'node_modules', 'three')
const ZIP_NAME = 'moose-birdboard-downloads.zip'

// ---------- helpers ----------
const convert = (src, dst) => new Promise(resolve => {
  const proc = spawn(process.execPath, ['--max-old-space-size=3072', OPENJSCAD, src, '-of', 'stlb', '-o', dst], { cwd: ROOT })
  let log = ''
  proc.stdout.on('data', d => (log += d))
  proc.stderr.on('data', d => (log += d))
  proc.on('error', err => resolve({ code: -1, log: String(err) }))
  proc.on('close', code => resolve({ code, log: log.trim() }))
})

const walk = (dir, base = '') => {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const rel = path.posix.join(base, e.name)
    return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel]
  }).sort()
}

const copyDir = (src, dst) => {
  if (!fs.existsSync(src)) throw new Error(`missing ${path.relative(ROOT, src)}`)
  fs.cpSync(src, dst, { recursive: true, dereference: true })
}

// Replaces `from` with `to` exactly once; throws if the page no longer contains it.
const patch = (text, from, to, what) => {
  const i = text.indexOf(from)
  if (i < 0) throw new Error(`static build: could not find ${what} in the viewer page (the page changed: update viewer/build-static.js)`)
  if (text.indexOf(from, i + 1) >= 0) throw new Error(`static build: ${what} appears more than once in the viewer page`)
  return text.slice(0, i) + to + text.slice(i + from.length)
}
// Removes the text from `startMark` up to (not including) `endMark`.
const cut = (text, startMark, endMark, what) => {
  const s = text.indexOf(startMark)
  if (s < 0) throw new Error(`static build: could not find the start of ${what}`)
  const e = text.indexOf(endMark, s)
  if (e < 0) throw new Error(`static build: could not find the end of ${what}`)
  return text.slice(0, s) + text.slice(e)
}

// ---------- the pages ----------
const patchIndex = html => {
  // editor: stylesheet, panel, buttons, code
  html = html.replace(/<link rel="stylesheet" data-name="vs\/editor\/editor\.main"[^>]*>\n?/, '')
  html = cut(html, '<section id="editor">', '<main>', 'the editor panel')
  html = patch(html, '  <button id="editorBtn" title="Show or hide the editor (E)">Editor</button>\n', '', 'the Editor button')
  html = patch(html, '  <button id="rebuild" title="Rebuild now (R)">Rebuild</button>\n', '', 'the Rebuild button')
  const ctl = html.lastIndexOf('// ====', html.indexOf('// Controls and live updates'))
  html = cut(html, 'const editor = (() => {', html.slice(ctl, ctl + 8), 'the editor code')
  html = patch(html, "$('rebuild').onclick = () => fetch('/rebuild', { method: 'POST' })\n", '', 'the rebuild handler')
  html = patch(html, "  if (e.key === 'e' || e.key === 'E') editor.toggle()\n", '', 'the editor shortcut')
  html = patch(html, "  if (e.key === 'r' || e.key === 'R') fetch('/rebuild', { method: 'POST' })\n", '', 'the rebuild shortcut')
  html = patch(html, 'editor.init()\n', '', 'editor.init()')
  // live updates -> one static status file
  html = patch(html, "const es = new EventSource('/events')\nes.onmessage = async ev => {\n  const prev = st\n  st = JSON.parse(ev.data)",
    'const onStatus = async data => {\n  const prev = st\n  st = data', 'the EventSource handler')
  html = patch(html, 'new Date(st.time).toLocaleTimeString()', 'new Date(st.time).toLocaleString()', 'the build time')
  html = patch(html, "es.onerror = () => { $('dot').className = 'dot error'; $('statusText').textContent = 'viewer server stopped' }\n",
    "fetch('/status.json?t=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }).then(onStatus)\n" +
    "  .catch(() => { $('dot').className = 'dot error'; $('statusText').textContent = 'could not load status.json' })\n", 'the EventSource error handler')
  html = patch(html, "es.addEventListener('sources', ev => editor.onSources(JSON.parse(ev.data)))\n", '', 'the sources listener')
  // links
  html = patch(html, '<a href="/keymap" ', '<a href="/keymap.html" ', 'the keymap link')
  html = patch(html, 'Keymap ↗</a>',
    `Keymap ↗</a>\n  <a href="/${ZIP_NAME}" download style="color: var(--accent); text-decoration: none; padding: 4px 8px" title="Every case STL and the art print files">Download STL + art (.zip)</a>`,
    'the keymap link text')
  html = patch(html, '<title>Ergogen viewer</title>', '<title>Moose birdboard</title>', 'the title')
  return html
}

const patchKeymap = html => {
  html = patch(html, "fetch('/api/keymap').then(r => r.json())", "fetch('/keymap/legends.json').then(r => r.json()).then(keymap => ({ keymap, mtime: null }))", 'the keymap load')
  html = patch(html, 'function save() {\n', "function save() { $('status').textContent = 'read-only'; return }\nfunction saveDisabled() {\n", 'the save function')
  html = patch(html, 'Changes save on their own.', 'This copy is read-only: edits are not saved.', 'the save hint')
  html = patch(html, "$('status').textContent = 'saved'\n  } catch", "$('status').textContent = 'read-only'\n  } catch", 'the loaded status')
  return html
}

// ---------- zip (store-free deflate; no external zip tool needed) ----------
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
const makeZip = (entries, when = new Date()) => {
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  const parts = [], central = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const packed = zlib.deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28)
    parts.push(local, nameBuf, packed)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10)
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(c, nameBuf)
    offset += local.length + nameBuf.length + packed.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

// ---------- main ----------
const main = async () => {
  const { code, clashes, log } = await build({ echo: true })
  if (code) { console.error('build failed'); return 1 }
  if (clashes) console.warn('warning: the wiring check found clashes (see output/wiring/report_*.md)')

  // case .jscad -> binary .stl next to it (the viewer's 3D tab and the zip both use these)
  const jscads = fs.readdirSync(CASES).filter(f => f.endsWith('.jscad'))
  if (!jscads.length) { console.error('no cases were built'); return 1 }
  const one = async f => {
    const dst = path.join(CASES, f.replace(/\.jscad$/, '.stl'))
    const r = await convert(path.join(CASES, f), dst)
    const ok = r.code === 0 && fs.existsSync(dst) && fs.statSync(dst).size > 0
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${path.relative(ROOT, dst)}`)
    if (!ok) console.error(r.log.slice(-600))
    return { f, ok }
  }
  const results = []
  const queue = jscads.slice()
  await Promise.all([0, 1].map(async () => { while (queue.length) results.push(await one(queue.shift())) }))
  // the print-only supported caps may fail without taking the site down; anything else may not
  const failed = results.filter(r => !r.ok)
  for (const r of failed.filter(r => r.f.includes('_supported'))) console.warn(`warning: ${r.f} was not converted, left out of the downloads`)
  if (failed.some(r => !r.f.includes('_supported'))) return 1
  fs.rmSync(DIST, { recursive: true, force: true })
  fs.mkdirSync(DIST, { recursive: true })

  copyDir(OUT, path.join(DIST, 'output'))
  copyDir(path.join(THREE, 'build'), path.join(DIST, 'vendor', 'three', 'build'))
  copyDir(path.join(THREE, 'examples', 'jsm'), path.join(DIST, 'vendor', 'three', 'examples', 'jsm'))
  fs.mkdirSync(path.join(DIST, 'art'), { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'art', 'legends.js'), path.join(DIST, 'art', 'legends.js'))
  copyDir(path.join(ROOT, 'keymap', 'fonts', 'fontawesome'), path.join(DIST, 'fonts', 'fontawesome'))
  fs.mkdirSync(path.join(DIST, 'keymap'), { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'keymap', 'legends.json'), path.join(DIST, 'keymap', 'legends.json'))

  fs.writeFileSync(path.join(DIST, 'index.html'), patchIndex(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')))
  fs.writeFileSync(path.join(DIST, 'keymap.html'), patchKeymap(fs.readFileSync(path.join(__dirname, 'keymap.html'), 'utf8')))

  // what the dev server streams over /events
  const status = {
    status: 'ok', log: '', time: new Date().toISOString(), stlLog: '',
    dxf: walk(path.join(OUT, 'outlines')).filter(f => f.toLowerCase().endsWith('.dxf')).map(f => 'outlines/' + f),
    stl: walk(CASES).filter(f => f.toLowerCase().endsWith('.stl')).map(f => 'cases/' + f),
  }
  fs.writeFileSync(path.join(DIST, 'status.json'), JSON.stringify(status, null, 2))

  // one download: every case STL plus the art
  const entries = [
    ...status.stl.map(f => ({ name: 'stl/' + path.posix.basename(f), data: fs.readFileSync(path.join(OUT, f)) })),
    ...walk(path.join(OUT, 'art')).map(f => ({ name: 'art/' + f, data: fs.readFileSync(path.join(OUT, 'art', f)) })),
  ]
  fs.writeFileSync(path.join(DIST, ZIP_NAME), makeZip(entries))
  console.log(`dist/ ready: ${status.dxf.length} outlines, ${status.stl.length} STLs, ${entries.length} files in ${ZIP_NAME}`)
  return 0
}

module.exports = { patchIndex, patchKeymap, makeZip }

if (require.main === module) main().then(code => process.exit(code), err => { console.error(err); process.exit(1) })
