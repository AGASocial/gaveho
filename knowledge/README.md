# Gabriel's Knowledge Base

This folder contains markdown files that are ingested into the RAG knowledge base for the "ask my agent" chat widget.

## How to Add Knowledge

1. Create a new `.md` file in this folder (e.g., `faq.md`, `projects-detail.md`, `philosophy.md`)
2. Write content in first person as Gabriel would speak
3. Run `npm run ingest` to chunk and embed the content
4. The content will be available for the AI to reference in conversations

## Tips

- Write naturally in first person ("I", "my")
- Be specific and factual
- Include both English and Spanish content if desired
- Organize by topic (one file per major topic)

## Examples

**faq.md** - Common questions visitors might ask
**projects.md** - Detailed project descriptions beyond what's on the homepage
**philosophy.md** - Development philosophy, approach to building software
**contact.md** - How to reach out, collaboration preferences
