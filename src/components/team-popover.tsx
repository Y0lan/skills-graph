import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { StatusIcon } from '@/components/status-icon'
import { useTeamStatus } from '@/hooks/use-team-status'
import { teamMembers } from '@/data/team-roster'
import { cn } from '@/lib/utils'

const sortedMembers = [...teamMembers].sort((a, b) => a.name.localeCompare(b.name))

interface TeamPopoverProps {
  currentSlug?: string
}

export function TeamPopover({ currentSlug }: TeamPopoverProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { statusMap, submittedCount } = useTeamStatus(open)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="shrink-0 gap-1.5" />}
      >
        <Users className="h-4 w-4" />
        Équipe
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {submittedCount}/{teamMembers.length} évaluations soumises
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {sortedMembers.map((member) => {
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
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate', isCurrent && 'font-medium')}>
                    {member.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {member.role}
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
