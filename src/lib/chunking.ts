/**
 * Text chunking utilities for RAG ingestion
 */

export interface Chunk {
  content: string
  metadata: Record<string, unknown>
}

/**
 * Split text into chunks with overlap for better context preservation
 */
export function chunkText(
  text: string,
  chunkSize: number = 800,
  overlap: number = 200
): string[] {
  const chunks: string[] = []
  
  // Split by sentences first
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  
  let currentChunk = ''
  let previousChunk = ''
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim()
    
    if (!trimmedSentence) continue
    
    if ((currentChunk + ' ' + trimmedSentence).length <= chunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence
    } else {
      if (currentChunk) {
        chunks.push(currentChunk)
        previousChunk = currentChunk
      }
      
      // Add overlap from previous chunk
      const overlapText = previousChunk.slice(-overlap).trim()
      currentChunk = overlapText ? overlapText + ' ' + trimmedSentence : trimmedSentence
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk)
  }
  
  return chunks
}

/**
 * Create chunks from structured content (homepage data)
 */
export function chunkHomepageContent(content: {
  bio: string
  skills: Array<{ label: string; skills: string[] }>
  projects: Array<{ name: string; description: string; tags: string[] }>
  experience: Array<{ company: string; role: string; period: string }>
}): Chunk[] {
  const chunks: Chunk[] = []
  
  // Bio chunk
  chunks.push({
    content: `About Gabriel Vega: ${content.bio}`,
    metadata: { section: 'bio' }
  })
  
  // Skills chunks
  for (const group of content.skills) {
    chunks.push({
      content: `Gabriel's ${group.label} skills: ${group.skills.join(', ')}. He has expertise in these technologies and uses them regularly in his work.`,
      metadata: { section: 'skills', category: group.label }
    })
  }
  
  // Projects chunks
  for (const project of content.projects) {
    chunks.push({
      content: `${project.name}: ${project.description} Built with: ${project.tags.join(', ')}.`,
      metadata: { section: 'projects', project: project.name }
    })
  }
  
  // Experience chunks
  for (const exp of content.experience) {
    chunks.push({
      content: `Gabriel worked at ${exp.company} as ${exp.role} (${exp.period}).`,
      metadata: { section: 'experience', company: exp.company }
    })
  }
  
  return chunks
}
