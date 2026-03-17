import { betterAuth } from 'better-auth'
import Database from 'better-sqlite3'
import { DB_PATH } from './db.js'
import { KNOWN_MAPPINGS } from './known-mappings.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authInstance: any = null

export function createAuth() {
  authInstance = betterAuth({
    database: new Database(DB_PATH),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
    basePath: '/api/auth',
    emailAndPassword: { enabled: true, minPasswordLength: 6 },
    logger: {
      level: 'warn',
    },
    onAPIError: {
      onError: (error) => {
        console.error('[BETTER-AUTH] API Error:', error)
      },
    },
    plugins: [],
    user: {
      additionalFields: {
        slug: {
          type: 'string',
          required: false,
          unique: true,
          input: false,
        },
        pinCustomized: {
          type: 'boolean',
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const slug = KNOWN_MAPPINGS[user.email.toLowerCase()] ?? null
            return { data: { ...user, slug } }
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    trustedOrigins: [process.env.CORS_ORIGIN || 'http://localhost:5173'],
    rateLimit: {
      window: 60,
      max: 100,
    },
  })

  return authInstance
}

export function getAuth() {
  if (!authInstance) throw new Error('Auth not initialized — call createAuth() first')
  return authInstance
}
