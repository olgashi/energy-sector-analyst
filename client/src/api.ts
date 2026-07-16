import type { AnalysisRecord, FeedDocument, ResourceSummary } from './types'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export async function fetchResources(): Promise<ResourceSummary[]> {
  const response = await fetch(`${apiBaseUrl}/resources`)

  if (!response.ok) {
    throw new Error('Failed to load news sources')
  }

  return (await response.json()) as ResourceSummary[]
}

export async function fetchResourceArticles(
  resource: ResourceSummary,
): Promise<FeedDocument> {
  const response = await fetch(`${apiBaseUrl}/resources/${resource.id}/articles`)

  if (!response.ok) {
    throw new Error(`Failed to load articles from ${resource.name}`)
  }

  return (await response.json()) as FeedDocument
}

export async function fetchStoredAnalysis(
  articleId: number,
): Promise<AnalysisRecord | null> {
  const response = await fetch(`${apiBaseUrl}/articles/${articleId}/analysis`)

  if (!response.ok) {
    return null
  }

  return (await response.json()) as AnalysisRecord
}

export async function startArticleAnalysis(
  articleId: number,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(`${apiBaseUrl}/articles/${articleId}/analysis`, {
    method: 'POST',
  })

  if (!response.ok || !response.body) {
    const message = response.status === 404 ? 'Article not found' : 'Analysis failed'
    throw new Error(message)
  }

  return response.body
}
