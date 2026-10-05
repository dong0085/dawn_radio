// Version bumps and the changelog returning listeners see.
//
//   pnpm changes                          commits since the last version bump
//   pnpm bump <patch|minor|major|x.y.z>   new release at HEAD; fill in its notes afterwards
//   node scripts/version.mjs check        every release has notes in every language (runs in pnpm build)

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/changelog/changelog.json', import.meta.url)
const PKG = new URL('../package.json', import.meta.url)
const SEMVER = /^\d+\.\d+\.\d+$/

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'))
const writeJson = (url, value) => writeFileSync(url, `${JSON.stringify(value, null, 2)}\n`)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function compare(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

function next(version, step) {
  if (SEMVER.test(step)) return step
  const [major, minor, patch] = version.split('.').map(Number)
  if (step === 'major') return `${major + 1}.0.0`
  if (step === 'minor') return `${major}.${minor + 1}.0`
  if (step === 'patch') return `${major}.${minor}.${patch + 1}`
  fail(`Unknown step "${step}". Use patch, minor, major, or a version like 1.2.0.`)
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Commits after `commit`, leaving out the release commits themselves. */
function commitsSince(commit) {
  try {
    git('cat-file', '-e', `${commit}^{commit}`)
  } catch {
    fail(`Commit ${commit} is missing from this checkout. Run git fetch and try again.`)
  }
  return git('log', '--no-merges', '--invert-grep', '--grep=^Release v', '--format=%h %ad %s', '--date=short', `${commit}..HEAD`)
}

function check(log) {
  const { releases, languages } = log
  if (!languages?.length) fail('changelog.json lists no languages.')
  releases.forEach((r, i) => {
    if (!SEMVER.test(r.version)) fail(`Release ${i}: version "${r.version}" is not x.y.z.`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) fail(`v${r.version}: date "${r.date}" is not YYYY-MM-DD.`)
    if (!/^[0-9a-f]{40}$/.test(r.commit)) fail(`v${r.version}: commit must be a full 40-character hash.`)
    for (const lang of languages) {
      const notes = r.notes?.[lang]
      if (!notes?.length || notes.some((n) => !n.trim())) fail(`v${r.version}: write the notes for ${lang}.`)
    }
    const older = releases[i + 1]
    if (older && compare(r.version, older.version) <= 0) fail(`v${r.version} must be newer than v${older.version} below it.`)
  })
}

const log = readJson(FILE)
const [command, arg] = process.argv.slice(2)
const latest = log.releases[0]

if (command === 'check') {
  check(log)
  console.log(`✓ changelog: ${log.releases.length} release(s), current v${latest?.version}`)
} else if (command === 'changes') {
  console.log(`Current version: v${latest.version} (covers up to ${latest.commit.slice(0, 7)})\n`)
  console.log(commitsSince(latest.commit) || 'No commits since the last version bump.')
} else if (command === 'bump') {
  if (!arg) fail('Say which step: pnpm bump <patch|minor|major|x.y.z>')
  const version = next(latest.version, arg)
  if (compare(version, latest.version) <= 0) fail(`v${version} is not newer than v${latest.version}.`)
  const commit = git('rev-parse', 'HEAD')
  const commits = commitsSince(latest.commit)
  log.releases.unshift({ version, date: today(), commit, notes: Object.fromEntries(log.languages.map((l) => [l, []])) })
  writeJson(FILE, log)
  const pkg = readJson(PKG)
  pkg.version = version
  writeJson(PKG, pkg)
  console.log(`Added v${version} at ${commit.slice(0, 7)}. Uncommitted work is left for the next version.\n`)
  console.log(`Commits in this version:\n${commits || '(none)'}\n`)
  console.log(`Next: write its notes in src/changelog/changelog.json for ${log.languages.join(', ')}.`)
} else {
  fail('Usage: node scripts/version.mjs <changes|bump <step>|check>')
}
