import { __syncDbForTests, type DbRunResult } from '../../server/lib/db.js'

type Row = Record<string, unknown>

class Statement {
  constructor(private readonly sql: string, private readonly owner: Database) {}

  all<T = Row>(...params: unknown[]): T[] {
    if (/^\s*SELECT\s+last_insert_rowid\(\)\s+as\s+id\s*$/i.test(this.sql.trim())) {
      return [{ id: this.owner.lastInsertRowid ?? null }] as T[]
    }
    return __syncDbForTests.all<T>(this.sql, params)
  }

  get<T = Row>(...params: unknown[]): T | undefined {
    return this.all<T>(...params)[0]
  }

  run(...params: unknown[]): DbRunResult {
    const result = __syncDbForTests.run(this.sql, params)
    if (result.lastInsertRowid !== undefined) {
      this.owner.lastInsertRowid = result.lastInsertRowid
    }
    return result
  }
}

export default class Database {
  lastInsertRowid: number | string | null = null

  constructor(_filename?: string) {}

  prepare(sql: string): Statement {
    return new Statement(sql, this)
  }

  exec(sql: string): void {
    __syncDbForTests.exec(sql)
  }

  pragma(): unknown[] {
    return []
  }

  transaction<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn | Promise<TReturn>): (...args: TArgs) => TReturn | Promise<TReturn> {
    return (...args: TArgs): TReturn | Promise<TReturn> => {
      __syncDbForTests.exec('BEGIN')
      try {
        const result = fn(...args)
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              __syncDbForTests.exec('COMMIT')
              return value
            },
            (err: unknown) => {
              __syncDbForTests.exec('ROLLBACK')
              throw err
            },
          )
        }
        __syncDbForTests.exec('COMMIT')
        return result
      } catch (err) {
        __syncDbForTests.exec('ROLLBACK')
        throw err
      }
    }
  }

  close(): void {}

  backup(): Promise<void> {
    throw new Error('File backup is not available in Postgres-backed tests')
  }
}
