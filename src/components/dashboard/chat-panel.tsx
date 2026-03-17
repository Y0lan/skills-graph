import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Send, Loader2, X, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TeamMemberAggregateResponse } from '@/lib/types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  contextSlugs: string[]
  onContextChange: (slugs: string[]) => void
  teamMembers: TeamMemberAggregateResponse[]
  onClose: () => void
}

export default function ChatPanel({ contextSlugs, onContextChange, teamMembers, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [memberFilter, setMemberFilter] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Fetch remaining quota on mount
  useEffect(() => {
    fetch('/api/chat/remaining', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setRemaining(d.remaining) })
      .catch(() => {})
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: newMessages,
          context: { slugs: contextSlugs },
        }),
        signal: controller.signal,
      })

      if (res.status === 429) {
        setRemaining(0)
        setMessages(prev => [...prev, { role: 'assistant', content: 'Limite quotidienne atteinte (20 questions/jour).' }])
        setStreaming(false)
        return
      }

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur lors de la connexion au service.' }])
        setStreaming(false)
        return
      }

      // Read SSE stream
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let buffer = ''

      let assistantIdx = -1
      setMessages(prev => {
        assistantIdx = prev.length
        return [...prev, { role: 'assistant', content: '' }]
      })

      const updateAssistant = (text: string) => {
        setMessages(prev => {
          if (assistantIdx < 0 || assistantIdx >= prev.length) return prev
          const updated = [...prev]
          updated[assistantIdx] = { role: 'assistant', content: text }
          return updated
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.text) {
              assistantText += data.text
              updateAssistant(assistantText)
            }
            if (data.done && data.remaining !== undefined) {
              setRemaining(data.remaining)
            }
            if (data.error) {
              assistantText += data.error
              updateAssistant(assistantText)
            }
          } catch { /* ignore malformed lines */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => {
          const errText = 'Connexion interrompue.'
          if (prev.length > 0 && prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].content === '') {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: errText }
            return updated
          }
          return [...prev, { role: 'assistant', content: errText }]
        })
      }
    }

    abortRef.current = null
    setStreaming(false)
  }, [input, messages, streaming, contextSlugs])

  const removeBadge = (slug: string) => {
    onContextChange(contextSlugs.filter(s => s !== slug))
  }

  const toggleMember = (slug: string) => {
    if (contextSlugs.includes(slug)) {
      onContextChange(contextSlugs.filter(s => s !== slug))
    } else {
      onContextChange([...contextSlugs, slug])
    }
  }

  // Resolve slug → name
  const memberName = (slug: string) => {
    const m = teamMembers.find(m => m.slug === slug)
    return m?.name ?? slug
  }

  // Contextual welcome message
  const welcomeMessage = contextSlugs.length === 0
    ? "Posez une question sur l'équipe, les compétences ou les formations."
    : contextSlugs.length === 1
      ? `Posez une question sur ${memberName(contextSlugs[0])}, ses compétences ou des conseils de progression.`
      : `Comparez les profils ou posez une question sur ${contextSlugs.map(memberName).join(' et ')}.`

  const filteredMembers = memberFilter
    ? teamMembers.filter(m => m.name.toLowerCase().includes(memberFilter.toLowerCase()))
    : teamMembers

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 rounded-t-xl">
        <span className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4" />
          Assistant IA
          {remaining !== null && (
            <span className="text-xs text-muted-foreground font-normal">
              ({remaining}/20)
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Context bar */}
      <div className="px-4 py-2 border-b shrink-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Contexte</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {contextSlugs.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">Contexte global (équipe)</span>
          ) : (
            contextSlugs.map(slug => (
              <Badge
                key={slug}
                className="bg-primary/10 text-primary border border-primary/20 text-xs gap-1 pr-1"
              >
                {memberName(slug)}
                <button
                  onClick={() => removeBadge(slug)}
                  className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))
          )}
          <Popover open={memberPickerOpen} onOpenChange={setMemberPickerOpen}>
            <PopoverTrigger
              render={
                <button className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Ajouter un profil" />
              }
            >
              <Plus className="h-3.5 w-3.5" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="border-b px-3 py-2">
                <input
                  type="text"
                  value={memberFilter}
                  onChange={e => setMemberFilter(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full rounded-md border bg-background px-2 py-1 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                <button
                  onClick={() => {
                    onContextChange([])
                    setMemberPickerOpen(false)
                    setMemberFilter('')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <div className="h-4 w-4 flex items-center justify-center">
                    {contextSlugs.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <span className="italic">Toute l'équipe</span>
                </button>
                {filteredMembers
                  .filter(m => m.submittedAt)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(m => (
                    <button
                      key={m.slug}
                      onClick={() => toggleMember(m.slug)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                    >
                      <div className="h-4 w-4 flex items-center justify-center">
                        {contextSlugs.includes(m.slug) && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.role}</p>
                      </div>
                    </button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {welcomeMessage}
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm ${
              msg.role === 'user'
                ? 'ml-8 rounded-lg bg-primary/10 px-3 py-2'
                : 'mr-8 rounded-lg bg-muted/50 px-3 py-2'
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {streaming && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Réflexion en cours...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Votre question..."
            disabled={streaming || remaining === 0}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button
            type="submit"
            size="sm"
            disabled={streaming || !input.trim() || remaining === 0}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
