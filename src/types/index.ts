export type Language = 'en' | 'es'

export interface Post {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  published: boolean
  created_at: string
  updated_at: string
  tags: string[]
  tiktok_script?: string
  cover_image?: string
  language: Language
  /** Agent key that created the post (blog agent API idempotency). */
  agent_key_id?: string | null
}

export interface GenerateRequest {
  topic: string
  context?: string
  secret: string
  language?: Language
}

export interface GenerateResponse {
  post: {
    title: string
    slug: string
    excerpt: string
    content: string
    tags: string[]
    tiktok_script: string
  }
}
