'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

export function AgentChatWidget() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: 'whoami',
    },
    {
      role: 'assistant',
      content: 'AI builder. Problem solver. Terminal enthusiast.',
    },
    {
      role: 'assistant',
      content: '> ask me anything',
    },
    {
      role: 'assistant',
      content: '(about code, AI, architecture, career, or random ideas)',
    },
  ])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    setMessages((prev) => [...prev, { role: 'user', content: input }])
    setInput('')

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '🚧 Coming soon... Agent is still learning to type.',
        },
      ])
    }, 500)
  }

  return (
    <div className="border-2 border-cyan-500/40 bg-black/40 backdrop-blur-sm p-4 rounded-none font-mono text-sm">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cyan-500/30">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-cyan-400 text-xs">ask my agent</span>
      </div>

      <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'text-emerald-400' : 'text-gray-300'}>
            {msg.role === 'user' && <span className="text-cyan-500">{'> '}</span>}
            {msg.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question..."
          className="flex-1 bg-black/60 border border-cyan-500/40 px-3 py-2 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500 text-sm"
        />
        <button
          type="submit"
          className="bg-cyan-600 hover:bg-cyan-500 text-black px-4 py-2 transition-colors"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-2 text-xs text-gray-500">
        agent: <span className="text-cyan-500">online</span> | model:{' '}
        <span className="text-emerald-500">gpt-4o</span>
      </div>
    </div>
  )
}
