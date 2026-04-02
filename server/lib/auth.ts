import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import Database from 'better-sqlite3'
import { Resend } from 'resend'
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
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          if (!process.env.RESEND_API_KEY) {
            console.warn('[AUTH] RESEND_API_KEY not set — magic link not sent')
            console.log(`[AUTH] Magic link for ${email}: ${url}`)
            return
          }
          const resend = new Resend(process.env.RESEND_API_KEY)
          await resend.emails.send({
            from: 'Radar SINAPSE <radar@sinapse.nc>',
            to: email,
            subject: 'Votre lien de connexion — Radar SINAPSE',
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
                <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px;">
                  Connexion au Radar des Compétences
                </h1>
                <p style="color: #555; font-size: 16px; line-height: 1.6;">
                  Cliquez sur le bouton ci-dessous pour vous connecter. Ce lien expire dans 10 minutes.
                </p>
                <div style="margin: 32px 0;">
                  <a href="${url}" style="
                    display: inline-block;
                    background: #2563eb;
                    color: white;
                    padding: 14px 28px;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: 600;
                    font-size: 16px;
                  ">Se connecter</a>
                </div>
                <p style="color: #999; font-size: 12px;">
                  Si vous n'avez pas demandé ce lien, ignorez cet email.
                </p>
              </div>
            `,
          })
          console.log(`[AUTH] Magic link sent to ${email}`)
        },
      }),
    ],
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
