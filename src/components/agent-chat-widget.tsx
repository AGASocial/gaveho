'use client'

import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function AgentChatWidget() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
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
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingMessage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)
    setStreamingMessage('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      })

      // Check if it's a fallback response (service unavailable)
      if (response.status === 503) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '🚧 Coming soon... Agent is still learning to type.',
          },
        ])
        setIsLoading(false)
        return
      }

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get response')
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No reader available')
      }

      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              break
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                fullText += parsed.text
                setStreamingMessage(fullText)
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      // Add completed message
      if (fullText) {
        setMessages((prev) => [...prev, { role: 'assistant', content: fullText }])
      }
      setStreamingMessage('')
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '❌ Sorry, something went wrong. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
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
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'user' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-800 dark:text-gray-300'}
          >
            {msg.role === 'user' && <span className="text-cyan-700 dark:text-cyan-500">{'> '}</span>}
            {msg.content}
          </div>
        ))}
        {streamingMessage && (
          <div className="text-gray-800 dark:text-gray-300">
            {streamingMessage}
            <span className="inline-block w-2 h-4 bg-cyan-700 dark:bg-cyan-500 animate-pulse ml-1" />
          </div>
        )}
        {isLoading && !streamingMessage && (
          <div className="text-gray-600 dark:text-gray-500">
            <span className="animate-pulse">●</span> Thinking...
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
