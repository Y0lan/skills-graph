import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Send, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  slug?: string
  compareSlug?: string | null
}

export default function ChatPanel({ slug, compareSlug }: ChatPanelProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
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
          context: { slug, compareSlug },
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

      // Track the assistant message index explicitly for safe updates
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
        // Update the existing assistant message if one was created, otherwise append
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
  }, [input, messages, streaming, slug, compareSlug])

  return (
    <div className="rounded-lg border">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Assistant IA
          {remaining !== null && (
            <span className="text-xs text-muted-foreground font-normal">
              ({remaining}/20 questions restantes)
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t">
          {/* Messages */}
          <div ref={scrollRef} className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Posez une question sur ce profil, les compétences ou des conseils de progression.
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
          <div className="border-t px-4 py-3">
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
      )}
    </div>
  )
}
