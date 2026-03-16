import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [
    inferAdditionalFields({
      user: {
        slug: { type: 'string', required: false },
        pinCustomized: { type: 'boolean', required: false },
      },
    }),
  ],
})
