import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface MemberAvatarProps {
  slug: string
  name: string
  role?: string
  size?: number
  className?: string
}

function getInitials(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  // First letter of first part + first letter of last part
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function MemberAvatar({ slug, name, role, size = 20, className }: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const fontSize = Math.max(8, Math.round(size * 0.45))

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              'rounded-full shrink-0 overflow-hidden transition-transform hover:scale-[1.3] hover:z-10',
              className,
            )}
            style={{ width: size, height: size }}
          />
        }
      >
        {!imgError ? (
          <img
            src={`/avatars/${slug}.webp`}
            alt={name}
            width={size}
            height={size}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground font-medium"
            style={{ fontSize }}
          >
            {getInitials(name)}
          </div>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="px-2.5 py-1.5">
        <p className="text-xs font-medium">{name}</p>
        {role && <p className="text-[10px] opacity-60">{role}</p>}
      </TooltipContent>
    </Tooltip>
  )
}
