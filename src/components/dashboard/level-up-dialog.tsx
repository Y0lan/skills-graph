/* eslint-disable react-hooks/refs */
import { useState, useRef, cloneElement, isValidElement } from 'react'
import { Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'

interface LevelUpDialogProps {
  skillId: string
  skillName: string
  currentLevel: number
  descriptors: { level: number; label: string; description: string }[]
  slug: string
  onSuccess: (oldLevel: number, newLevel: number) => void
  trigger?: React.ReactElement
}

export default function LevelUpDialog({ skillId, skillName, currentLevel, descriptors, slug, onSuccess, trigger }: LevelUpDialogProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(currentLevel)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) { setSelected(currentLevel); setError(null) }
  }

  const handleConfirm = async () => {
    if (selected === currentLevel || loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/ratings/${slug}/skill-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ skillId, newLevel: selected }),
      })

      if (!res.ok) {
        setError('Erreur, réessayez')
        setLoading(false)
        return
      }

      const data = await res.json()
      setOpen(false)

      // Celebration for level UP
      if (selected > currentLevel && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        confetti({
          particleCount: 30,
          spread: 50,
          origin: {
            x: rect.left / window.innerWidth + rect.width / (2 * window.innerWidth),
            y: rect.top / window.innerHeight,
          },
          decay: 0.95,
        })
      }

      toast.success(`${skillName} → Niveau ${selected}`)
      onSuccess(data.oldLevel, data.newLevel)
    } catch {
      // silent
    }
    setLoading(false)
  }

  const sortedDescriptors = [...descriptors].sort((a, b) => a.level - b.level)

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger render={
        trigger && isValidElement(trigger)
          ? cloneElement(trigger, { ref: buttonRef } as Record<string, unknown>)
          : <button ref={buttonRef} className="text-xs text-muted-foreground hover:text-foreground transition-colors" />
      }>
        {trigger ? undefined : 'Mettre à jour'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-sm font-medium">{skillName}</p>
          <p className="text-xs text-muted-foreground">Niveau actuel : {currentLevel}/5</p>
        </div>
        <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
          {sortedDescriptors.map(d => (
            <button
              key={d.level}
              onClick={() => !loading && setSelected(d.level)}
              disabled={loading}
              className={cn(
                'w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors',
                selected === d.level
                  ? d.level === currentLevel
                    ? 'bg-primary/10 border border-primary ring-1 ring-primary/20'
                    : 'bg-primary/10 border border-primary'
                  : d.level === currentLevel
                    ? 'bg-muted/50 border border-muted-foreground/20'
                    : 'hover:bg-muted/50 border border-transparent',
                loading && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className="font-medium">Niveau {d.level}</span>
              <span className="text-muted-foreground ml-1">— {d.description}</span>
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-t flex items-center justify-between">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            size="sm"
            disabled={selected === currentLevel || loading}
            onClick={handleConfirm}
            className="gap-1.5 ml-auto"
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            Confirmer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
