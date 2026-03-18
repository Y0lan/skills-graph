import { useEffect } from 'react'
import { authClient } from '@/lib/auth-client'
import { upgradeRoster } from '@/data/team-roster'

export function useFullRoster() {
  const { data: session } = authClient.useSession()
  useEffect(() => {
    if (!session) return
    fetch('/api/members', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(members => { if (members.length) upgradeRoster(members) })
      .catch(() => {})
  }, [session])
}
