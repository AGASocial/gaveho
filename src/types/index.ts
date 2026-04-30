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
}

export interface GenerateRequest {
  topic: string
  context?: string
  secret: string
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
