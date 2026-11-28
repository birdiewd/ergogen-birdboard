// Local viewer for Ergogen: outlines (DXF) and cases (STL).
// Watches config.yaml and footprints/, rebuilds into output/ on every change,
// and serves a page that shows the results and reloads after each build.
//
// After each Ergogen build it also converts every output/cases/*.jscad to an .stl with
// OpenJSCAD v1.
//
// Usage: npm run view   (then open http://localhost:4600)

const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'output')
const { build: runErgogen } = require('./build')
const OPENJSCAD = path.join(ROOT, 'node_modules', '@jscad', 'openjscad', 'src', 'cli', 'cli.js')
const THREE = path.join(ROOT, 'node_modules', 'three')
const MONACO = path.join(ROOT, 'node_modules', 'monaco-editor', 'min')
const PORT = Number(process.env.PORT) || 4600

// ---------- helpers ----------
const run = (cmd, args) => new Promise(resolve => {
  const proc = spawn(cmd, args, { cwd: ROOT })
  let log = ''
  proc.stdout.on('data', d => (log += d))
  proc.stderr.on('data', d => (log += d))
  proc.on('error', err => resolve({ code: -1, log: String(err) }))
  proc.on('close', code => resolve({ code, log: log.trim() }))
})

const listFiles = (dir, ext, base = '') => {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const rel = path.posix.join(base, e.name)
    if (e.isDirectory()) return listFiles(path.join(dir, e.name), ext, rel)
    return e.name.toLowerCase().endsWith(ext) ? [rel] : []
  }).sort()
}

let state = {
  status: 'idle', log: '', time: null,
  dxf: [], stl: [], stlLog: '',
}
const clients = new Set()
const broadcast = () => {
  const msg = `data: ${JSON.stringify(state)}\n\n`
  for (const res of clients) res.write(msg)
}

// ---------- build pipeline ----------
// A build run outside the viewer (npm run build, npm run stl) rewrites output/ too, and can
// delete a case file while it's being converted here. When files vanish like that, wait for
// the other build to finish and convert what's there then, rather than reporting an error.
const convertCases = async (attempt = 1) => {
  const jscads = listFiles(path.join(OUTPUT, 'cases'), '.jscad')
  const logs = []
  let vanished = false
  await Promise.all(jscads.map(async rel => {
    const src = path.join(OUTPUT, 'cases', rel)
    if (!fs.existsSync(src)) { vanished = true; return }
    const { code, log } = await run(process.execPath, [OPENJSCAD, src, '-of', 'stla', '-o', src.replace(/\.jscad$/i, '.stl')])
    if (!fs.existsSync(src) || /ENOENT/.test(log)) { vanished = true; return }
    if (code !== 0 || /error/i.test(log)) logs.push(`${rel}:\n${log}`)
  }))
  if (vanished) {
    if (attempt >= 3) return 'output/ kept changing during the STL conversion (another build was running): press Rebuild.'
    await new Promise(r => setTimeout(r, 3000))
    return convertCases(attempt + 1)
  }
  return logs.join('\n\n')
}

let building = false
let pending = false
const build = async () => {
  if (building) { pending = true; return }
  building = true
  try {
    await buildSteps()
  } catch (err) {
    // Never let a failed step take the server down; report it and wait for the next change.
    state = { ...state, status: 'error', log: String(err && err.stack || err), time: new Date().toISOString() }
    console.log(`[${new Date().toLocaleTimeString()}] build error\n${state.log}`)
    broadcast()
  }
  building = false
  if (pending) { pending = false; build() }
}

const buildSteps = async () => {
  state = { ...state, status: 'building', log: '' }
  broadcast()

  const { code, log } = await runErgogen()
  // Wiring check findings are reported in the log but don't stop the STL conversion.
  const failed = code !== 0
  if (failed) {
    state = { ...state, status: 'error', log, time: new Date().toISOString() }
    console.log(`[${new Date().toLocaleTimeString()}] build error\n${log}`)
    broadcast()
  } else {
    const stlLog = await convertCases()
    state = {
      ...state, status: 'ok', log, time: new Date().toISOString(),
      dxf: listFiles(path.join(OUTPUT, 'outlines'), '.dxf').map(f => 'outlines/' + f),
      stl: listFiles(path.join(OUTPUT, 'cases'), '.stl').map(f => 'cases/' + f),
      stlLog,
    }
    console.log(`[${new Date().toLocaleTimeString()}] build ok${stlLog ? ' (STL conversion problems)' : ''}`)
    broadcast()
  }
}

// ---------- editable source files ----------
// Only config.yaml and footprints/**/*.js can be read or written through the editor.
const FP_DIR = path.join(ROOT, 'footprints')
const editablePath = rel => {
  if (typeof rel !== 'string') return null
  const norm = rel.replace(/\\/g, '/')
  if (norm === 'config.yaml') return path.join(ROOT, 'config.yaml')
  if (!/^footprints\/[\w\-./]+\.js$/.test(norm) || norm.includes('..')) return null
  const abs = path.join(ROOT, norm)
  return abs.startsWith(FP_DIR + path.sep) ? abs : null
}
const listSources = () => [
  ...(fs.existsSync(path.join(ROOT, 'config.yaml')) ? ['config.yaml'] : []),
  ...listFiles(FP_DIR, '.js').map(f => 'footprints/' + f),
]
const mtimeOf = abs => { try { return fs.statSync(abs).mtimeMs } catch { return null } }

const sendEvent = (event, data) => {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(msg)
}

let timer = null
const changed = new Set()
const schedule = rel => {
  if (rel) changed.add(rel)
  clearTimeout(timer)
  timer = setTimeout(() => {
    sendEvent('sources', { files: listSources(), changed: [...changed] })
    changed.clear()
    build()
  }, 200)
}
// Watch the folder rather than the file, so editors that save by replacing the file still trigger.
fs.watch(ROOT, (_, name) => { if (name === 'config.yaml') schedule('config.yaml') })
fs.watch(path.join(ROOT, 'wiring'), (_, name) => { if (name && name.endsWith('.js')) schedule() })
fs.watch(path.join(ROOT, 'art'), (_, name) => { if (name && (name.endsWith('.js') || name === 'cs_thumb_curve.json')) schedule() })
fs.mkdirSync(path.join(ROOT, 'keymap'), { recursive: true })
fs.watch(path.join(ROOT, 'keymap'), (_, name) => { if (name === 'legends.json') schedule() })
fs.mkdirSync(FP_DIR, { recursive: true })
fs.watch(FP_DIR, { recursive: true }, (_, name) => {
  if (name && name.toLowerCase().endsWith('.js')) schedule('footprints/' + name.replace(/\\/g, '/'))
})

const readBody = req => new Promise((resolve, reject) => {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', d => (body += d))
  req.on('end', () => resolve(body))
  req.on('error', reject)
})
const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

// The keymap plan (keymap/legends.json), read and written by the planner at /keymap. Saving
// it rebuilds, which regenerates the legend print files.
const KEYMAP = path.join(ROOT, 'keymap', 'legends.json')
const handleKeymapApi = async (req, res) => {
  if (req.method === 'GET') {
    if (!fs.existsSync(KEYMAP)) return sendJson(res, 404, { error: 'not found' })
    return sendJson(res, 200, { keymap: JSON.parse(fs.readFileSync(KEYMAP, 'utf8')), mtime: mtimeOf(KEYMAP) })
  }
  if (req.method === 'PUT') {
    const { keymap, baseMtime } = JSON.parse(await readBody(req))
    const current = mtimeOf(KEYMAP)
    if (current !== null && baseMtime != null && Math.abs(current - baseMtime) > 1) return sendJson(res, 409, { error: 'changed on disk', mtime: current })
    if (!keymap || typeof keymap !== 'object' || !keymap.keys || !keymap.layers || !keymap.style) return sendJson(res, 400, { error: 'not a keymap' })
    fs.mkdirSync(path.dirname(KEYMAP), { recursive: true })
    fs.writeFileSync(KEYMAP, JSON.stringify(keymap, null, 2) + '\n', 'utf8')
    return sendJson(res, 200, { mtime: mtimeOf(KEYMAP) })
  }
  sendJson(res, 405, { error: 'method not allowed' })
}

const handleSourceApi = async (req, res, url, query) => {
  if (url === '/api/keymap') return handleKeymapApi(req, res)
  if (url === '/api/sources' && req.method === 'GET') return sendJson(res, 200, { files: listSources() })
  const rel = query.get('path')
  const abs = editablePath(rel)
  if (!abs) return sendJson(res, 400, { error: 'Only config.yaml and footprints/*.js can be edited.' })
  if (req.method === 'GET') {
    if (!fs.existsSync(abs)) return sendJson(res, 404, { error: 'not found' })
    return sendJson(res, 200, { path: rel, content: fs.readFileSync(abs, 'utf8'), mtime: mtimeOf(abs) })
  }
  if (req.method === 'PUT') {
    const { content, baseMtime, create } = JSON.parse(await readBody(req))
    const current = mtimeOf(abs)
    if (create && current !== null) return sendJson(res, 409, { error: 'exists', mtime: current })
    // Refuse to overwrite a file that changed on disk since the editor loaded it.
    if (!create && current !== null && baseMtime != null && Math.abs(current - baseMtime) > 1) {
      return sendJson(res, 409, { error: 'changed on disk', mtime: current })
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
    return sendJson(res, 200, { path: rel, mtime: mtimeOf(abs) })
  }
  sendJson(res, 405, { error: 'method not allowed' })
}

// ---------- http ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.dxf': 'text/plain', '.svg': 'image/svg+xml', '.stl': 'model/stl', '.ttf': 'font/ttf', '.json': 'application/json' }
const sendFile = (res, file) => {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(data)
  })
}
const serveUnder = (res, base, rel) => {
  const file = path.join(base, rel)
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end() }
  sendFile(res, file)
}

http.createServer((req, res) => {
  const [rawPath, rawQuery = ''] = req.url.split('?')
  const url = decodeURIComponent(rawPath)
  if (url.startsWith('/api/')) {
    return handleSourceApi(req, res, url, new URLSearchParams(rawQuery))
      .catch(err => sendJson(res, 500, { error: String(err) }))
  }
  if (url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(`data: ${JSON.stringify(state)}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  if (url === '/rebuild' && req.method === 'POST') { build(); res.writeHead(204); return res.end() }
  if (url.startsWith('/output/')) return serveUnder(res, OUTPUT, url.slice('/output/'.length))
  if (url.startsWith('/vendor/three/')) return serveUnder(res, THREE, url.slice('/vendor/three/'.length))
  if (url.startsWith('/vendor/monaco/')) return serveUnder(res, MONACO, url.slice('/vendor/monaco/'.length))
  if (url === '/' || url === '/index.html') return sendFile(res, path.join(__dirname, 'index.html'))
  if (url === '/keymap' || url === '/keymap.html') return sendFile(res, path.join(__dirname, 'keymap.html'))
  if (url === '/art/legends.js') return sendFile(res, path.join(ROOT, 'art', 'legends.js'))
  // the Font Awesome fonts, for the keymap planner
  if (url.startsWith('/fonts/fontawesome/')) return serveUnder(res, path.join(ROOT, 'keymap', 'fonts', 'fontawesome'), url.slice('/fonts/fontawesome/'.length))
  res.writeHead(404); res.end('not found')
}).listen(PORT, () => {
  console.log(`Ergogen viewer on http://localhost:${PORT}`)
  build()
})
