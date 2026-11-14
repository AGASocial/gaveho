import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BlogAgentError,
  isOwnedByAgent,
  patchAgentBlogPost,
  PUBLISHED_POSTS_LOCKED_MSG,
  setBlogAgentAdminForTests,
  setBlogRevalidateForTests,
  type BlogAgentPostRow,
} from './agent-posts'

const KEY = 'key-a'
const base = {
  id: '11111111-2222-4333-8444-555555555555',
  slug: 'x',
  title: 'T',
  excerpt: '',
  content: '',
  tags: [] as string[],
  language: 'es' as const,
  published: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  agent_key_id: KEY,
}

afterEach(() => {
  setBlogAgentAdminForTests(null)
  setBlogRevalidateForTests(null)
})

test('isOwnedByAgent requires matching non-null agent_key_id', () => {
  const owned: BlogAgentPostRow = { ...base, agent_key_id: 'key-a' }
  const human: BlogAgentPostRow = { ...base, agent_key_id: null }
  const missing: BlogAgentPostRow = { ...base }
  delete missing.agent_key_id
  assert.equal(isOwnedByAgent(owned, 'key-a'), true)
  assert.equal(isOwnedByAgent(owned, 'key-b'), false)
  assert.equal(isOwnedByAgent(owned, null), false)
  assert.equal(isOwnedByAgent(human, 'key-a'), false)
  assert.equal(isOwnedByAgent(missing, 'key-a'), false)
})

type EqCall = [string, unknown]
type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }

/** Minimal chainable Supabase mock that records filter eqs and returns queued results. */
function mockAdmin(opts: {
  lookups: BlogAgentPostRow[]
  updates?: Array<{ result: QueryResult; expectEqs?: EqCall[] }>
}) {
  const updateQueue = [...(opts.updates ?? [])]
  const lookupQueue = [...opts.lookups]
  const recorded: EqCall[][] = []

  const makeSelectChain = (kind: 'lookup' | 'update') => {
    const eqs: EqCall[] = []
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = self
    chain.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return chain
    }
    chain.maybeSingle = async () => {
      recorded.push([...eqs])
      if (kind === 'lookup') {
        const row = lookupQueue.shift() ?? null
        return { data: row, error: null }
      }
      const next = updateQueue.shift()
      if (!next) return { data: null, error: { message: 'unexpected update' } }
      if (next.expectEqs) {
        assert.deepEqual(eqs, next.expectEqs)
      }
      return next.result
    }
    chain.single = chain.maybeSingle
    return chain
  }

  return {
    recorded,
    factory: () =>
      ({
        from: () => ({
          select: () => makeSelectChain('lookup'),
          update: () => makeSelectChain('update'),
          insert: () => makeSelectChain('lookup'),
        }),
      }) as unknown as ReturnType<typeof import('@/lib/supabase').supabaseAdmin>,
  }
}

test('atomic draft PATCH requires published=false and returns 422 when 0 rows', async () => {
  const draft = { ...base, published: false }
  const { factory } = mockAdmin({
    lookups: [draft],
    updates: [
      {
        expectEqs: [
          ['id', draft.id],
          ['agent_key_id', KEY],
          ['published', false],
        ],
        result: { data: null, error: null },
      },
    ],
  })
  setBlogAgentAdminForTests(factory)
  setBlogRevalidateForTests(() => {})

  await assert.rejects(
    () => patchAgentBlogPost(draft.id, { action: 'update', title: 'New' }, KEY),
    (e: unknown) =>
      e instanceof BlogAgentError && e.status === 422 && e.message === PUBLISHED_POSTS_LOCKED_MSG,
  )
})

test('atomic draft PATCH succeeds when update matches unpublished owned row', async () => {
  const draft = { ...base, published: false }
  const updated = { ...draft, title: 'New', updated_at: '2026-01-02T00:00:00Z' }
  const { factory } = mockAdmin({
    lookups: [draft],
    updates: [
      {
        expectEqs: [
          ['id', draft.id],
          ['agent_key_id', KEY],
          ['published', false],
        ],
        result: { data: updated, error: null },
      },
    ],
  })
  setBlogAgentAdminForTests(factory)
  setBlogRevalidateForTests(() => {})

  const out = await patchAgentBlogPost(draft.id, { action: 'update', title: 'New' }, KEY)
  assert.equal(out.title, 'New')
  assert.equal(out.published, false)
})

test('atomic publish transitions published false→true for owning key', async () => {
  const draft = { ...base, published: false }
  const published = { ...draft, published: true, updated_at: '2026-01-02T00:00:00Z' }
  let revalidated: string | null = null
  const { factory } = mockAdmin({
    lookups: [draft],
    updates: [
      {
        expectEqs: [
          ['id', draft.id],
          ['agent_key_id', KEY],
          ['published', false],
        ],
        result: { data: published, error: null },
      },
    ],
  })
  setBlogAgentAdminForTests(factory)
  setBlogRevalidateForTests((slug) => {
    revalidated = slug
  })

  const out = await patchAgentBlogPost(draft.id, { action: 'publish' }, KEY)
  assert.equal(out.published, true)
  assert.equal(revalidated, draft.slug)
})

test('repeated publish is idempotent when already published', async () => {
  const live = { ...base, published: true }
  const { factory } = mockAdmin({ lookups: [live], updates: [] })
  setBlogAgentAdminForTests(factory)
  setBlogRevalidateForTests(() => {
    assert.fail('should not revalidate on idempotent publish')
  })

  const out = await patchAgentBlogPost(live.id, { action: 'publish' }, KEY)
  assert.equal(out.published, true)
  assert.equal(out.id, live.id)
})

test('concurrent publish (0 rows) returns idempotent success if already published', async () => {
  const draft = { ...base, published: false }
  const live = { ...base, published: true }
  // find → draft; publish update → 0 rows; re-find → published
  const { factory } = mockAdmin({
    lookups: [draft, live],
    updates: [
      {
        expectEqs: [
          ['id', draft.id],
          ['agent_key_id', KEY],
          ['published', false],
        ],
        result: { data: null, error: null },
      },
    ],
  })
  setBlogAgentAdminForTests(factory)
  setBlogRevalidateForTests(() => {
    assert.fail('lost race should not revalidate again')
  })

  const out = await patchAgentBlogPost(draft.id, { action: 'publish' }, KEY)
  assert.equal(out.published, true)
})
