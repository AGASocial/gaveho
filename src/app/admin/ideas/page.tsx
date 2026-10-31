'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mic, Search, Loader2, ExternalLink, Check } from 'lucide-react'

interface NewsResult {
  title: string
  url: string
  source: string
  publishedDate?: string
  snippet: string
  relevanceNote: string
}

interface GeneratedDrafts {
  ideaId: string
  en: {
    id: string
    title: string
    slug: string
    excerpt: string
    tags: string[]
    preview_url: string
  }
  es: {
    id: string
    title: string
    slug: string
    excerpt: string
    tags: string[]
    tiktok_script: string
    preview_url: string
  }
}

interface Draft {
  id: string
  title: string
  slug: string
  excerpt: string
  tags: string[]
  language: 'en' | 'es'
  created_at: string
}

export default function AdminIdeasPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [secret, setSecret] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [topic, setTopic] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recognition, setRecognition] = useState<any>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [newsResults, setNewsResults] = useState<NewsResult[]>([])
  const [searchingNews, setSearchingNews] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generatedDrafts, setGeneratedDrafts] = useState<GeneratedDrafts | null>(null)
  const [extractingArticle, setExtractingArticle] = useState(false)

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  useEffect(() => {
    checkAuthentication()
  }, [])

  useEffect(() => {
    if (authenticated) {
      loadDrafts()
    }
  }, [authenticated])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).webkitSpeechRecognition
      const recognitionInstance = new SpeechRecognition()
      recognitionInstance.continuous = true
      recognitionInstance.interimResults = true
      recognitionInstance.lang = 'en-US'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognitionInstance.onresult = (event: any) => {
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          }
        }

        if (finalTranscript) {
          setNotes(prev => prev + finalTranscript)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event)
        setIsRecording(false)
      }

      recognitionInstance.onend = () => {
        setIsRecording(false)
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecognition(recognitionInstance)
    }
  }, [])

  async function checkAuthentication() {
    try {
      const res = await fetch('/api/admin/login')
      const data = await res.json()
      setAuthenticated(data.authenticated)
    } catch (err) {
      console.error('Auth check failed:', err)
    } finally {
      setCheckingAuth(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoggingIn(true)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })

      if (res.ok) {
        setAuthenticated(true)
        setSecret('')
      } else {
        alert('Invalid secret')
      }
    } catch (err) {
      console.error('Login failed:', err)
      alert('Login failed')
    } finally {
      setLoggingIn(false)
    }
  }

  function toggleRecording() {
    if (!recognition) {
      alert('Speech recognition is not supported in this browser')
      return
    }

    if (isRecording) {
      recognition.stop()
      setIsRecording(false)
    } else {
      recognition.start()
      setIsRecording(true)
    }
  }

  async function handleSearchNews() {
    if (!searchQuery.trim()) return

    setSearchingNews(true)
    setSearchError(null)
    setNewsResults([])

    try {
      const res = await fetch('/api/admin/search-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSearchError(data.error || data.message || 'Search failed')
        return
      }

      setNewsResults(data.results || [])
    } catch (err) {
      console.error('News search failed:', err)
      setSearchError('Failed to search news')
    } finally {
      setSearchingNews(false)
    }
  }

  async function handleSelectNews(result: NewsResult) {
    setTopic(result.title)
    setSourceUrl(result.url)
    setNotes(`Source: ${result.source}\nRelevance: ${result.relevanceNote}\n\n${result.snippet}`)
    setNewsResults([])

    setExtractingArticle(true)
    try {
      const res = await fetch('/api/admin/extract-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: result.url }),
      })

      if (res.ok) {
        const data = await res.json()
        setNotes(prev => `${prev}\n\n--- Full Article ---\n${data.text}`)
      }
    } catch (err) {
      console.error('Article extraction failed:', err)
    } finally {
      setExtractingArticle(false)
    }
  }

  async function handleGenerate() {
    if (!topic.trim()) {
      alert('Please enter a topic')
      return
    }

    setGenerating(true)

    try {
      const res = await fetch('/api/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          context: notes || undefined,
          sourceUrl: sourceUrl || undefined,
          notes: notes || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'Generation failed')
        return
      }

      setGeneratedDrafts({
        ideaId: data.ideaId,
        en: data.drafts.en,
        es: data.drafts.es,
      })

      setTopic('')
      setSourceUrl('')
      setNotes('')

      loadDrafts()
    } catch (err) {
      console.error('Generation failed:', err)
      alert('Failed to generate drafts')
    } finally {
      setGenerating(false)
    }
  }

  async function loadDrafts() {
    setLoadingDrafts(true)
    try {
      const res = await fetch('/api/admin/drafts')
      const data = await res.json()
      if (res.ok) {
        setDrafts(data.drafts || [])
      }
    } catch (err) {
      console.error('Failed to load drafts:', err)
    } finally {
      setLoadingDrafts(false)
    }
  }

  async function handlePublish(postId: string) {
    if (!confirm('Are you sure you want to publish this post?')) {
      return
    }

    setPublishingId(postId)

    try {
      const res = await fetch('/api/admin/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })

      if (!res.ok) {
        alert('Failed to publish post')
        return
      }

      loadDrafts()
    } catch (err) {
      console.error('Publish failed:', err)
      alert('Failed to publish post')
    } finally {
      setPublishingId(null)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Enter your secret to access the ideas dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="secret">Secret</Label>
                <Input
                  id="secret"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  disabled={loggingIn}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loggingIn}>
                {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Login'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Ideas Dashboard</h1>
          <p className="text-muted-foreground">Turn ideas and news into blog drafts</p>
        </div>

        {generatedDrafts && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                Drafts Generated Successfully
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">🇬🇧 English</h3>
                <p className="font-medium">{generatedDrafts.en.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{generatedDrafts.en.excerpt}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {generatedDrafts.en.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <a
                  href={generatedDrafts.en.preview_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-2"
                >
                  Preview <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div>
                <h3 className="font-semibold mb-2">🇪🇸 Spanish</h3>
                <p className="font-medium">{generatedDrafts.es.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{generatedDrafts.es.excerpt}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {generatedDrafts.es.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <a
                  href={generatedDrafts.es.preview_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-2"
                >
                  Preview <ExternalLink className="h-3 w-3" />
                </a>
                <details className="mt-3">
                  <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                    TikTok Script
                  </summary>
                  <pre className="text-xs bg-muted p-2 rounded mt-2 whitespace-pre-wrap">
                    {generatedDrafts.es.tiktok_script}
                  </pre>
                </details>
              </div>

              <Button
                onClick={() => setGeneratedDrafts(null)}
                variant="outline"
                size="sm"
              >
                Close
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Find News</CardTitle>
                <CardDescription>
                  Search for recent relevant news aligned with Gabriel&apos;s profile
                </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g., 'Next.js AI integration' or 'latest LLM developments'"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchNews()}
              />
              <Button
                onClick={handleSearchNews}
                disabled={searchingNews || !searchQuery.trim()}
              >
                {searchingNews ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>

            {searchError && (
              <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-2 rounded-md">
                {searchError}
              </div>
            )}

            {newsResults.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Found {newsResults.length} results:</p>
                {newsResults.map((result, idx) => (
                  <Card key={idx} className="hover:bg-muted/50 cursor-pointer" onClick={() => handleSelectNews(result)}>
                    <CardContent className="p-4">
                      <h3 className="font-medium text-sm">{result.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {result.source} {result.publishedDate && `• ${result.publishedDate}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">{result.snippet}</p>
                      <Badge variant="outline" className="mt-2 text-xs">
                        {result.relevanceNote}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Idea</CardTitle>
            <CardDescription>
              Enter a topic, paste a URL, or share a loose idea
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="topic">Topic *</Label>
              <Input
                id="topic"
                placeholder="e.g., 'Using AI agents to automate Next.js deployments'"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="sourceUrl">Source URL (optional)</Label>
              <Input
                id="sourceUrl"
                type="url"
                placeholder="https://example.com/article"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                {recognition && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={toggleRecording}
                    className={isRecording ? 'bg-red-50 border-red-300' : ''}
                  >
                    <Mic className={`h-4 w-4 mr-2 ${isRecording ? 'text-red-600' : ''}`} />
                    {isRecording ? 'Stop' : 'Dictate'}
                  </Button>
                )}
              </div>
              <Textarea
                id="notes"
                placeholder="What angle are you exploring? Context? Thoughts?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>

            {extractingArticle && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting article content...
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating || !topic.trim()}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating drafts...
                </>
              ) : (
                'Generate EN + ES Drafts'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Drafts</CardTitle>
                <CardDescription>Unpublished posts</CardDescription>
              </div>
              <Button onClick={loadDrafts} variant="outline" size="sm" disabled={loadingDrafts}>
                {loadingDrafts ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDrafts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : drafts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No drafts yet</p>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <Card key={draft.id}>
                    <CardContent className="p-4 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-xs">
                            {draft.language === 'en' ? '🇬🇧 EN' : '🇪🇸 ES'}
                          </Badge>
                          <h3 className="font-medium text-sm truncate">{draft.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {draft.excerpt}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {draft.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <a
                          href={`/blog/${draft.slug}?preview=${process.env.NEXT_PUBLIC_AGENT_SECRET || ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Preview <ExternalLink className="h-3 w-3" />
                        </a>
                        <Button
                          size="sm"
                          onClick={() => handlePublish(draft.id)}
                          disabled={publishingId === draft.id}
                        >
                          {publishingId === draft.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Publish'
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
