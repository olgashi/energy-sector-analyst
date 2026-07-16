import { useEffect, useState } from 'react'
import {
  apiBaseUrl,
  fetchResourceArticles,
  fetchResources,
  fetchStoredAnalysis,
  startArticleAnalysis,
} from './api'
import {
  analysisRecordToUiState,
  applyWorkflowEvent,
  createInitialAnalysisState,
} from './analysisState'
import {
  AnalysisWorkspace,
} from './components/AnalysisWorkspace'
import { formatDate, toPreview } from './format'
import { readEventStream } from './stream'
import type { AnalysisUiState, Article, FeedDocument, ResourceSummary } from './types'

function App() {
  const [resources, setResources] = useState<ResourceSummary[]>([])
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null)
  const [document, setDocument] = useState<FeedDocument | null>(null)
  const [loadingResources, setLoadingResources] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analysisByArticle, setAnalysisByArticle] = useState<Record<number, AnalysisUiState>>({})
  const selectedArticle =
    document?.articles.find((article) => article.id === selectedArticleId) ?? null

  async function analyzeArticle(articleId: number) {
    console.info('[article-analysis] analyze clicked', { articleId, apiBaseUrl })
    setAnalysisByArticle((current) => ({
      ...current,
      [articleId]: createInitialAnalysisState(),
    }))

    try {
      const stream = await startArticleAnalysis(articleId)

      await readEventStream(stream, (event) => {
        console.info('[article-analysis] stream event', {
          articleId,
          eventType: event.eventType,
          stage: event.stage,
          hasResult: event.result !== undefined,
          error: event.error ?? null,
        })
        setAnalysisByArticle((current) => ({
          ...current,
          [articleId]: applyWorkflowEvent(
            current[articleId] ?? createInitialAnalysisState(),
            event,
          ),
        }))
      })
      console.info('[article-analysis] stream completed', { articleId })
    } catch (analysisError) {
      console.error('[article-analysis] analyze failed', {
        articleId,
        error: analysisError,
      })
      setAnalysisByArticle((current) => ({
        ...current,
        [articleId]: {
          ...(current[articleId] ?? createInitialAnalysisState()),
          status: 'failed',
          loading: false,
          currentStage: 'failed',
          error:
            analysisError instanceof Error
              ? analysisError.message
              : 'Analysis failed',
          startedAtMs: null,
        },
      }))
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadArticlesFromAllSources() {
      try {
        setLoadingResources(true)
        setError(null)
        setDocument(null)
        setSelectedArticleId(null)

        const data = await fetchResources()
        console.info('[article-analysis] resources loaded', {
          resourceCount: data.length,
        })

        const documentResults = await Promise.allSettled(
          data.map(async (resource) => fetchResourceArticles(resource)),
        )
        const documents = documentResults.flatMap((result, index) => {
          if (result.status === 'fulfilled') {
            return [result.value]
          }

          console.warn('[article-analysis] source articles skipped', {
            resourceId: data[index]?.id,
            resourceName: data[index]?.name,
            error: result.reason,
          })

          return []
        })

        if (data.length > 0 && documents.length === 0) {
          throw new Error('Failed to load articles')
        }

        const articles = documents
          .flatMap((sourceDocument) =>
            sourceDocument.articles.map((article) => ({
              ...article,
              source: sourceDocument.resourceName,
            })),
          )
          .sort(
            (left, right) =>
              new Date(right.publishedAt).getTime() -
              new Date(left.publishedAt).getTime(),
          )

        console.info('[article-analysis] all source articles loaded', {
          articleCount: articles.length,
          resourceCount: data.length,
        })

        if (!cancelled) {
          setResources(data)
          setDocument({
            resourceName: `${data.length} sources`,
            articles,
          })
          void loadStoredAnalyses(articles, () => cancelled)
        }
      } catch (resourceError) {
        console.error('[article-analysis] all source article load failed', {
          error: resourceError,
        })
        if (!cancelled) {
          setError(resourceError instanceof Error ? resourceError.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) {
          setLoadingResources(false)
        }
      }
    }

    void loadArticlesFromAllSources()

    return () => {
      cancelled = true
    }
  }, [])

  async function loadStoredAnalyses(
    articles: Article[],
    isCancelled: () => boolean,
  ) {
    console.info('[article-analysis] loading stored analyses', {
      articleCount: articles.length,
    })
    const entries = await Promise.all(
      articles.map(async (article) => {
        const record = await fetchStoredAnalysis(article.id)

        if (!record) {
          return null
        }

        console.info('[article-analysis] stored analysis loaded', {
          articleId: article.id,
          status: record.status,
          currentStage: record.currentStage,
          hasResult: Boolean(record.result),
          errorMessage: record.errorMessage,
        })

        return [article.id, analysisRecordToUiState(record)] as const
      }),
    )

    if (isCancelled()) {
      console.info('[article-analysis] skipped stored analysis state update after cancellation')
      return
    }

    console.info('[article-analysis] applying stored analyses', {
      loadedCount: entries.filter((entry) => entry !== null).length,
    })
    setAnalysisByArticle((current) => ({
      ...current,
      ...Object.fromEntries(entries.filter((entry) => entry !== null)),
    }))
  }

  return (
    <main className="app-shell">
      <section className="app-panel">
        <header className="app-header">
          <img className="app-logo" src="/logo.png" alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">Energy Sector Analyst</p>
            <h1>Recent utility news</h1>
            <p className="intro">
              Articles from the last 72 hours across {resources.length || 'configured'} sources.
            </p>
          </div>
        </header>

        {loadingResources ? <p className="status">Loading articles...</p> : null}
        {error ? <p className="status error">{error}</p> : null}

        {!loadingResources && !error && document ? (
          <div className="analysis-layout">
            <section className="article-column" aria-label="Articles">
              {document.articles.length > 0 ? (
                <div className="article-list">
                  {document.articles.map((article) => (
                    <article
                      className={`article-card ${
                        selectedArticleId === article.id ? 'selected' : ''
                      }`}
                      key={article.url}
                    >
                      <div className="article-card-header">
                        <a
                          className="article-title"
                          href={article.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {article.title}
                        </a>
                        {analysisByArticle[article.id] ? (
                          <span className={`analysis-badge ${analysisByArticle[article.id].status}`}>
                            {analysisByArticle[article.id].loading
                              ? 'Running'
                              : analysisByArticle[article.id].status}
                          </span>
                        ) : null}
                      </div>
                      <p className="article-date">
                        {article.source ? `${article.source} · ` : ''}
                        {formatDate(article.publishedAt)}
                      </p>
                      <p className="article-preview">{toPreview(article.body)}</p>
                      <button
                        className="select-article-button"
                        type="button"
                        onClick={() => setSelectedArticleId(article.id)}
                      >
                        {selectedArticleId === article.id ? 'Selected' : 'View analysis'}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="status">No recent articles found.</p>
              )}
            </section>
            <AnalysisWorkspace
              article={selectedArticle}
              state={selectedArticle ? analysisByArticle[selectedArticle.id] : undefined}
              onAnalyze={(articleId) => void analyzeArticle(articleId)}
            />
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
