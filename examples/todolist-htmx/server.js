import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authRouter } from './routes/auth.js'
import { todosRouter } from './routes/todos.js'
import { resetStore } from './lib/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3099

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Expose HX-Request detection to every view.
app.use((req, res, next) => {
  res.locals.isHtmx = req.get('HX-Request') === 'true'
  next()
})

// `?mode=json` flips the demo from HTML-attribute instrumentation to
// JSON-spec mode. The agent is booted with `ignoreHtmlAttrs: true` and
// driven entirely by public/todolist-htmx-spec.js. The toggle persists
// across hx-boost navs via the HX-Location rewrite below — logging in
// from `/login?mode=json` lands on /todos still in JSON mode.
//
// We also strip every `fs-*` attribute from rendered HTML when the
// toggle is on. The agent doesn't need it (ignoreHtmlAttrs already
// makes them inert), but it makes the JSON path *visible*: curl the
// page, inspect with devtools, and you'll see a bare DOM with no fs-*
// attrs anywhere. If an assertion still fires, it can only be from
// the JSON spec.
function stripFsAttrs(html) {
  // Scope to inside tag openers so we don't accidentally chew text
  // content like "the fs-trigger attribute" in <p>.
  return html.replace(/<([a-zA-Z][\w-]*)([^>]*)>/g, (_, tag, attrs) => {
    const cleaned = attrs.replace(
      /\s+fs-[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/g,
      ''
    )
    return `<${tag}${cleaned}>`
  })
}

app.use((req, res, next) => {
  // Mode comes from one of two places:
  //   1. ?mode=json in the URL — used for the initial page load
  //   2. X-Faultsense-Mode: json request header — sent by HTMX on every
  //      hx-post/hx-patch/hx-delete/hx-get (the body's hx-headers in
  //      layout.ejs scopes the header to all descendant htmx requests)
  // Without #2, every HTMX swap response would render in HTML mode and
  // re-inject fs-* attrs into a JSON-mode page.
  res.locals.useJsonMode =
    req.query.mode === 'json' || req.get('X-Faultsense-Mode') === 'json'
  if (res.locals.useJsonMode) {
    // Preserve the toggle on HX-Location redirects (login → /todos,
    // logout → /login). routes/auth.js sets HX-Location; this
    // middleware appends ?mode=json when needed.
    const origSet = res.set.bind(res)
    res.set = function (header, value) {
      if (header === 'HX-Location' && typeof value === 'string' && !value.includes('?')) {
        return origSet(header, value + '?mode=json')
      }
      return origSet(header, value)
    }
    // Strip fs-* attributes from any HTML body sent to the client —
    // covers both full-page renders and HTMX swap fragments.
    const origSend = res.send.bind(res)
    res.send = function (body) {
      if (typeof body === 'string' && body.includes('fs-')) {
        body = stripFsAttrs(body)
      }
      return origSend(body)
    }
  }
  next()
})

app.get('/', (req, res) => {
  // Preserve ?mode=json across the root redirect so deep-linking to
  // `/?mode=json` lands on /login?mode=json (not /login).
  const suffix = req.query.mode === 'json' ? '?mode=json' : ''
  res.redirect('/login' + suffix)
})

// Benchmark reset endpoint — restores store to initial seed state.
// Only active when FS_BENCH=1 (set by the benchmark tool's webServer config).
if (process.env.FS_BENCH === '1') {
  app.post('/reset', (req, res) => {
    resetStore()
    res.sendStatus(204)
  })
}

app.use('/', authRouter)
app.use('/', todosRouter)

app.listen(PORT, () => {
  console.log(`todolist-htmx listening on http://localhost:${PORT}`)
})
