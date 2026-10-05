/**
 * Loads a database exported from Cloudflare D1 into the server's SQLite file.
 *
 *   npx wrangler d1 export dawn-radio --remote --output d1.sql
 *   node server/node/import-d1.ts d1.sql            (DATA_DIR sets where the database lives)
 *
 * Only into an empty database: run it before the server's first start, or after removing radio.db.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SqliteDatabase } from './sqlite.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const file = process.argv[2]
if (!file || !existsSync(file)) {
  console.error('Usage: node server/node/import-d1.ts <d1 export .sql>')
  process.exit(1)
}

const dataDir = resolve(process.env.DATA_DIR || join(ROOT, 'data'))
mkdirSync(dataDir, { recursive: true })
const db = new SqliteDatabase(join(dataDir, 'radio.db'))
const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
if (tables.length) {
  console.error(`${join(dataDir, 'radio.db')} already has tables (${tables.map((t) => t.name).join(', ')}). Import into an empty database.`)
  process.exit(1)
}

db.db.exec('BEGIN')
try {
  db.db.exec(readFileSync(file, 'utf8'))
  // The live database had every migration; mark them so the server doesn't run them again.
  db.db.exec(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)',
  )
  const mark = db.db.prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)')
  for (const name of readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql'))) mark.run(name)
  db.db.exec('COMMIT')
} catch (err) {
  db.db.exec('ROLLBACK')
  console.error('Import failed:', (err as Error).message)
  process.exit(1)
}

for (const { name } of db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
  const { n } = db.db.prepare(`SELECT COUNT(*) AS n FROM "${String(name)}"`).get() as { n: number }
  console.log(`${String(name)}: ${n} rows`)
}
db.close()
