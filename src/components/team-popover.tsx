import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Maximize2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { StatusIcon } from '@/components/status-icon'
import { useTeamStatus } from '@/hooks/use-team-status'
import { teamMembers, findMember } from '@/data/team-roster'
import { cn } from '@/lib/utils'
import MemberAvatar from '@/components/member-avatar'

interface TeamPopoverProps {
  currentSlug?: string
}

export function TeamPopover({ currentSlug }: TeamPopoverProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { statusMap, submittedCount, draftCount } = useTeamStatus(open)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="shrink-0 gap-1.5" />}
      >
        <Users className="h-4 w-4" />
        Équipe
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b px-3 py-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {submittedCount} complètes · {draftCount} brouillon{draftCount > 1 ? 's' : ''}
          </p>
          <button
            type="button"
            onClick={() => {
              navigate('/equipe')
              setOpen(false)
            }}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
            title="Vue complète"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {[...teamMembers].sort((a, b) => {
            const nameA = findMember(a.slug)?.name ?? a.name
            const nameB = findMember(b.slug)?.name ?? b.name
            return nameA.localeCompare(nameB)
          }).map((member) => {
            const resolved = findMember(member.slug) ?? member
            const status = statusMap.get(member.slug) ?? 'none'
            const isCurrent = member.slug === currentSlug
            return (
              <button
                key={member.slug}
                type="button"
                onClick={() => {
                  navigate(`/dashboard/${member.slug}`)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  isCurrent && 'bg-accent/50',
                )}
              >
                <StatusIcon status={status} />
                <MemberAvatar slug={member.slug} name={resolved.name} size={20} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate', isCurrent && 'font-medium')}>
                    {resolved.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {resolved.role}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
