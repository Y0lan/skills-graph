import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface MemberAvatarProps {
  slug: string
  name: string
  role?: string
  size?: number
  className?: string
  href?: string
}

function getInitials(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function MemberAvatar({ slug, name, role, size = 20, className, href }: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const fontSize = Math.max(8, Math.round(size * 0.45))

  const avatarContent = !imgError ? (
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
  )

  const sharedClassName = cn(
    'rounded-full shrink-0 overflow-hidden transition-transform hover:scale-[1.3] hover:z-10',
    className,
  )

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          href ? (
            <Link
              to={href}
              className={sharedClassName}
              style={{ width: size, height: size }}
            />
          ) : (
            <div
              className={sharedClassName}
              style={{ width: size, height: size }}
            />
          )
        }
      >
        {avatarContent}
      </TooltipTrigger>
      <TooltipContent side="top" className="px-2.5 py-1.5">
        <p className="text-xs font-medium">{name}</p>
        {role && <p className="text-[10px] opacity-60">{role}</p>}
      </TooltipContent>
    </Tooltip>
  )
}
