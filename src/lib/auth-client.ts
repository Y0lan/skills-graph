import { createAuthClient } from 'better-auth/react'
import { magicLinkClient, inferAdditionalFields } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [
    magicLinkClient(),
    inferAdditionalFields({
      user: {
        slug: { type: 'string', required: false },
      },
    }),
  ],
})
