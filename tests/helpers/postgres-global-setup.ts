import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

let container: StartedPostgreSqlContainer | null = null

export default async function setup(project: { provide: (key: string, value: string) => void }) {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  project.provide('databaseUrl', container.getConnectionUri())

  return async () => {
    await container?.stop()
    container = null
  }
}
