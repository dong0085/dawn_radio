/**
 * The database on a SQLite file, behind the same small API the app uses with Cloudflare D1 (see ../db.ts).
 * Migrations in migrations/*.sql run at startup and are tracked in d1_migrations, the table wrangler uses,
 * so a database exported from D1 carries on where it left off.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import type { D1Database, D1PreparedStatement, D1Result } from '../db.ts'

/** D1 turns booleans into 0/1; undefined is stored as null. */
function toSql(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return value as SQLInputValue
}

class Statement implements D1PreparedStatement {
  private db: SqliteDatabase
  readonly sql: string
  readonly values: SQLInputValue[]

  constructor(db: SqliteDatabase, sql: string, values: SQLInputValue[] = []) {
    this.db = db
    this.sql = sql
    this.values = values
  }

  bind(...values: unknown[]) {
    return new Statement(this.db, this.sql, values.map(toSql))
  }

  async first<T = Record<string, unknown>>() {
    return (this.db.statement(this.sql).get(...this.values) as T | undefined) ?? null
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.allNow<T>()
  }

  async run(): Promise<D1Result> {
    const r = this.db.statement(this.sql).run(...this.values)
    return { results: [], meta: { changes: Number(r.changes) } }
  }

  allNow<T>(): D1Result<T> {
    return { results: this.db.statement(this.sql).all(...this.values) as T[] }
  }
}

export class SqliteDatabase implements D1Database {
  readonly db: DatabaseSync
  private statements = new Map<string, StatementSync>()

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    // WAL lets reads go on while a write finishes; the timeout covers a second process (e.g. an import).
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  }

  /** Prepared statements are reused, since the app runs the same few queries over and over. */
  statement(sql: string) {
    let s = this.statements.get(sql)
    if (!s) {
      s = this.db.prepare(sql)
      this.statements.set(sql, s)
    }
    return s
  }

  prepare(sql: string) {
    return new Statement(this, sql)
  }

  /** Runs the statements in one transaction, like D1: all of them or none. */
  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    this.db.exec('BEGIN')
    try {
      const results = (statements as Statement[]).map((s) => s.allNow<Record<string, unknown>>())
      this.db.exec('COMMIT')
      return results
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** Applies the migrations not run yet, in order. Returns their names. */
  migrate(dir: string) {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)',
    )
    const done = new Set(this.db.prepare('SELECT name FROM d1_migrations').all().map((r) => r.name as string))
    const pending = readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && !done.has(f))
      .sort()
    for (const name of pending) {
      this.db.exec('BEGIN')
      try {
        this.db.exec(readFileSync(join(dir, name), 'utf8'))
        this.db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name)
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`)
      }
    }
    return pending
  }

  close() {
    this.db.close()
  }
}
