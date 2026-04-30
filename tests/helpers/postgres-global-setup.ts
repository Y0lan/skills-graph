import fs from 'fs'
import path from 'path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

const STATE_PATH = path.join(process.cwd(), '.vitest-postgres-url')

let container: StartedPostgreSqlContainer | null = null

export default async function setup() {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  fs.writeFileSync(STATE_PATH, container.getConnectionUri(), 'utf-8')

  return async () => {
    fs.rmSync(STATE_PATH, { force: true })
    await container?.stop()
    container = null
  }
}
