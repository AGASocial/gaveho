'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'

export function AgentChatWidget() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    sendMessage,
    status,
    error,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  })

  const isLoading = status === 'submitted'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Add initial greeting messages if no messages exist
  const displayMessages = messages.length > 0
    ? messages
    : [
        { id: '1', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'whoami' }] },
        { id: '2', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'AI builder. Problem solver. Terminal enthusiast.' }] },
        { id: '3', role: 'assistant' as const, parts: [{ type: 'text' as const, text: '> ask me anything' }] },
        { id: '4', role: 'assistant' as const, parts: [{ type: 'text' as const, text: '(about code, AI, architecture, career, or random ideas)' }] },
      ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    
    try {
      await sendMessage({ text: userMessage })
    } catch (err) {
      console.error('Chat error:', err)
    }
  }

  return (
    <div className="border-2 border-cyan-700/40 dark:border-cyan-500/40 bg-gray-100 dark:bg-black/40 backdrop-blur-sm p-4 rounded-none font-mono text-sm">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cyan-700/30 dark:border-cyan-500/30">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-cyan-700 dark:text-cyan-400 text-xs">ask my agent</span>
      </div>

      <div className="space-y-2 mb-3 max-h-96 overflow-y-auto">
        {displayMessages.map((msg) => (
          <div
            key={msg.id}
            className={msg.role === 'user' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-800 dark:text-gray-300'}
          >
            {msg.role === 'user' && <span className="text-cyan-700 dark:text-cyan-500">{'> '}</span>}
            {msg.parts.map((part, idx) =>
              part.type === 'text' ? (
                <span key={idx}>{part.text}</span>
              ) : null
            )}
          </div>
        ))}
        {isLoading && (
          <div className="text-gray-600 dark:text-gray-500">
            <span className="animate-pulse">●</span> Thinking...
          </div>
        )}
        {error && (
          <div className="text-red-600 dark:text-red-400">
            ❌ {error.message}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question..."
          disabled={isLoading}
          maxLength={1000}
          className="flex-1 bg-white dark:bg-black/60 border border-cyan-700/40 dark:border-cyan-500/40 px-3 py-2 text-gray-900 dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-600 focus:outline-none focus:border-cyan-700 dark:focus:border-cyan-500 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-cyan-700 hover:bg-cyan-600 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-2 text-xs text-gray-600 dark:text-gray-500">
        agent: <span className="text-cyan-700 dark:text-cyan-500">online</span> | model:{' '}
        <span className="text-emerald-700 dark:text-emerald-500">claude-3.5-sonnet</span>
      </div>
    </div>
  )
}
