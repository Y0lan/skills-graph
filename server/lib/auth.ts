import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { Resend } from 'resend'
import Database from 'better-sqlite3'
import { DB_PATH } from './db.js'
import { KNOWN_MAPPINGS } from './known-mappings.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authInstance: any = null

// Per-email cooldown exported for use in Express handler
export const lastSentAt = new Map<string, number>()
export const COOLDOWN_MS = 5 * 60_000

export function createAuth() {
  const resendApiKey = process.env.RESEND_API_KEY
  const resend = resendApiKey ? new Resend(resendApiKey) : null

  authInstance = betterAuth({
    database: new Database(DB_PATH),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
    basePath: '/api/auth',
    emailAndPassword: { enabled: false },
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
          console.log(`[AUTH] Magic link for ${email}: ${url}`)
          if (!resend) return
          try {
            const result = await resend.emails.send({
              from: 'Radar <radar@sinapse.cv>',
              to: email,
              subject: 'Votre lien de connexion — Radar des Competences',
              html: buildMagicLinkEmail(url),
            })
            if (result.error) {
              console.error('[AUTH] Resend error:', result.error.message)
            } else {
              console.log('[AUTH] Email sent to', email)
            }
          } catch (err) {
            console.error('[AUTH] Resend failed:', err)
          }
        },
        expiresIn: 600,
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
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    trustedOrigins: [process.env.CORS_ORIGIN || 'http://localhost:5173'],
    rateLimit: {
      window: 60,
      max: 5,
    },
  })

  return authInstance
}

export function getAuth() {
  if (!authInstance) throw new Error('Auth not initialized — call createAuth() first')
  return authInstance
}

function buildMagicLinkEmail(url: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Connexion</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header band -->
          <tr>
            <td style="background:linear-gradient(135deg,#18181b 0%,#27272a 100%);padding:32px 32px 28px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="width:40px;height:40px;background-color:rgba(255,255,255,0.12);border-radius:10px;text-align:center;vertical-align:middle;font-size:20px;line-height:40px;">
                    &#127919;
                  </td>
                  <td style="padding-left:14px;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Radar des Competences</p>
                    <p style="margin:2px 0 0;font-size:12px;color:rgba(255,255,255,0.55);font-weight:500;">SINAPSE</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 12px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.3px;">Connexion securisee</h1>
              <p style="margin:0 0 28px;font-size:14px;line-height:22px;color:#71717a;">
                Cliquez sur le bouton ci-dessous pour acceder a votre espace d'evaluation. Aucun mot de passe n'est necessaire.
              </p>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#18181b;border-radius:8px;">
                    <a href="${url}" target="_blank" style="display:block;padding:14px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;text-align:center;letter-spacing:-0.1px;">
                      Se connecter
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Timer notice -->
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                Ce lien expire dans <strong style="color:#71717a;">10 minutes</strong>
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:28px 32px 0;">
              <hr style="margin:0;border:none;border-top:1px solid #e4e4e7;">
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding:20px 32px 32px;">
              <p style="margin:0 0 8px;font-size:12px;color:#a1a1aa;">
                Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :
              </p>
              <p style="margin:0;font-size:11px;color:#3b82f6;word-break:break-all;line-height:18px;">
                ${url}
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;">
          <tr>
            <td style="padding:24px 32px 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:18px;">
                Vous recevez cet email car une connexion a ete demandee sur le Radar des Competences. Si vous n'etes pas a l'origine de cette demande, ignorez simplement cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`
}
