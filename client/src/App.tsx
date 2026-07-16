import { useEffect, useState } from 'react'

type Article = {
  id: number
  title: string
  url: string
  publishedAt: string
  body: string
  source?: string
}

type FeedDocument = {
  resourceName: string
  articles: Article[]
}

type ResourceSummary = {
  id: string
  name: string
  type: 'rss'
}

type WorkflowStage =
  | 'loading_article'
  | 'researching'
  | 'searching_related_articles'
  | 'technical_analysis'
  | 'impact_analysis'
  | 'synthesizing'
  | 'saving'
  | 'completed'
  | 'failed'

type WorkflowEvent = {
  runId: string
  eventType:
    | 'workflow_started'
    | 'stage_started'
    | 'stage_completed'
    | 'stage_failed'
    | 'workflow_completed'
    | 'workflow_failed'
  stage: WorkflowStage
  timestamp: string
  result?: unknown
  error?: string
}

type AnalysisRecord = {
  status: 'running' | 'completed' | 'failed'
  currentStage: WorkflowStage | null
  stageResults: Record<string, unknown>
  result: FinalAnalysis | null
  errorMessage: string | null
}

type FinalAnalysis = {
  overview: string
  whatHappened: Array<{ statement: string; sourceType: string }>
  background: Array<{ statement: string; sourceType: string }>
  technicalConcepts: Array<{ term: string; explanation: string; relevance: string }>
  stakeholderImpacts: Array<{
    stakeholder: string
    impact: string
    reasoning: string
    confidence: string
  }>
  uncertainties: Array<{ issue: string; explanation: string }>
  relatedArticles: Array<{
    articleId: number
    title: string
    url: string
    publishedAt: string | null
  }>
  contextLimitations: string[]
}

type TechnicalConcept = FinalAnalysis['technicalConcepts'][number]

type AnalysisUiState = {
  status: 'running' | 'completed' | 'failed'
  loading: boolean
  currentStage: WorkflowStage | null
  completedStages: WorkflowStage[]
  events: WorkflowEvent[]
  stageResults: Record<string, unknown>
  analysis: FinalAnalysis | null
  error: string | null
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'
const activityMessages = [
  'Reading the article and identifying the central event...',
  'Separating reported facts from interpretation...',
  'Checking stored articles for useful context...',
  'Mapping technical, market, and regulatory concepts...',
  'Assessing who may be affected...',
  'Verifying uncertainty and confidence levels...',
  'Preparing the final analysis...',
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function toPreview(body: string) {
  return body.slice(0, 300)
}

function stageLabel(stage: WorkflowStage) {
  switch (stage) {
    case 'loading_article':
      return 'Loading article'
    case 'researching':
      return 'Researching article'
    case 'searching_related_articles':
      return 'Searching stored articles'
    case 'technical_analysis':
      return 'Explaining key concepts'
    case 'impact_analysis':
      return 'Assessing stakeholder impact'
    case 'synthesizing':
      return 'Synthesizing final analysis'
    case 'saving':
      return 'Saving result'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
  }
}

function createInitialAnalysisState(): AnalysisUiState {
  return {
    status: 'running',
    loading: true,
    currentStage: 'loading_article',
    completedStages: [],
    events: [],
    stageResults: {},
    analysis: null,
    error: null,
  }
}

function App() {
  const [resources, setResources] = useState<ResourceSummary[]>([])
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null)
  const [document, setDocument] = useState<FeedDocument | null>(null)
  const [loadingResources, setLoadingResources] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analysisByArticle, setAnalysisByArticle] = useState<Record<number, AnalysisUiState>>({})
  const loading = loadingResources
  const selectedArticle =
    document?.articles.find((article) => article.id === selectedArticleId) ?? null

  async function analyzeArticle(articleId: number) {
    console.info('[article-analysis] analyze clicked', { articleId, apiBaseUrl })
    setAnalysisByArticle((current) => ({
      ...current,
      [articleId]: createInitialAnalysisState(),
    }))

    try {
      const response = await fetch(`${apiBaseUrl}/articles/${articleId}/analysis`, {
        method: 'POST',
      })
      console.info('[article-analysis] POST response received', {
        articleId,
        status: response.status,
        ok: response.ok,
        hasBody: Boolean(response.body),
        contentType: response.headers.get('content-type'),
      })

      if (!response.ok || !response.body) {
        const message = response.status === 404 ? 'Article not found' : 'Analysis failed'
        throw new Error(message)
      }

      await readEventStream(response.body, (event) => {
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

        const response = await fetch(`${apiBaseUrl}/resources`)
        console.info('[article-analysis] resources response', {
          status: response.status,
          ok: response.ok,
        })

        if (!response.ok) {
          throw new Error('Failed to load news sources')
        }

        const data = (await response.json()) as ResourceSummary[]
        console.info('[article-analysis] resources loaded', {
          resourceCount: data.length,
        })

        const documentResults = await Promise.allSettled(
          data.map(async (resource) => {
            const articlesResponse = await fetch(`${apiBaseUrl}/resources/${resource.id}/articles`)
            console.info('[article-analysis] resource articles response', {
              resourceId: resource.id,
              status: articlesResponse.status,
              ok: articlesResponse.ok,
            })

            if (!articlesResponse.ok) {
              throw new Error(`Failed to load articles from ${resource.name}`)
            }

            return (await articlesResponse.json()) as FeedDocument
          }),
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
        const response = await fetch(`${apiBaseUrl}/articles/${article.id}/analysis`)
        console.debug('[article-analysis] stored analysis response', {
          articleId: article.id,
          status: response.status,
          ok: response.ok,
        })

        if (!response.ok) {
          return null
        }

        const record = (await response.json()) as AnalysisRecord
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

        {loading ? <p className="status">Loading articles...</p> : null}
        {error ? <p className="status error">{error}</p> : null}

        {!loading && !error && document ? (
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

function AnalysisWorkspace({
  article,
  state,
  onAnalyze,
}: {
  article: Article | null
  state: AnalysisUiState | undefined
  onAnalyze: (articleId: number) => void
}) {
  if (!article) {
    return (
      <aside className="analysis-workspace">
        <div className="analysis-empty-state">
          <p className="analysis-empty-title">Select an article</p>
          <p>
            Choose a story from the list to review its saved analysis or generate a
            new one.
          </p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="analysis-workspace">
      <div className="analysis-workspace-header">
        <p className="eyebrow">Selected article</p>
        <h2>{article.title}</h2>
        <p className="article-date">
          {article.source ? `${article.source} · ` : ''}
          {formatDate(article.publishedAt)}
        </p>
        <a className="source-link" href={article.url} target="_blank" rel="noreferrer">
          Open original article
        </a>
      </div>

      {state ? (
        <>
          <AnalysisPanel state={state} />
          {state.status === 'failed' ? (
            <button
              className="analyze-button"
              type="button"
              onClick={() => onAnalyze(article.id)}
            >
              Try again
            </button>
          ) : null}
        </>
      ) : (
        <div className="analysis-empty-state">
          <p className="analysis-empty-title">No analysis yet</p>
          <p>
            Generate a structured analysis covering what happened, stakeholder
            impact, uncertainty, and related stored coverage.
          </p>
          <button
            className="analyze-button"
            type="button"
            onClick={() => onAnalyze(article.id)}
          >
            Analyze article
          </button>
        </div>
      )}
    </aside>
  )
}

function applyWorkflowEvent(
  state: AnalysisUiState,
  event: WorkflowEvent,
): AnalysisUiState {
  const nextCompletedStages =
    event.eventType === 'stage_completed'
      ? [...new Set([...state.completedStages, event.stage])]
      : state.completedStages
  const nextStageResults = { ...state.stageResults }
  const completedResultKey = stageResultKey(event.stage)

  if (event.eventType === 'stage_completed' && completedResultKey) {
    nextStageResults[completedResultKey] = event.result
  }

  if (event.eventType === 'workflow_completed') {
    const record = event.result as AnalysisRecord

    return {
      ...state,
      status: 'completed',
      loading: false,
      currentStage: 'completed',
      completedStages: [...new Set([...nextCompletedStages, 'completed' as WorkflowStage])],
      events: [...state.events, event],
      stageResults: record.stageResults ?? nextStageResults,
      analysis: record.result,
      error: null,
    }
  }

  if (event.eventType === 'workflow_failed' || event.eventType === 'stage_failed') {
    return {
      ...state,
      status: 'failed',
      loading: false,
      currentStage: event.stage,
      events: [...state.events, event],
      stageResults: nextStageResults,
      error: event.error ?? 'Analysis failed',
    }
  }

  return {
    ...state,
    status: 'running',
    loading: true,
    currentStage: event.stage,
    completedStages: nextCompletedStages,
    events: [...state.events, event],
    stageResults: nextStageResults,
  }
}

function analysisRecordToUiState(record: AnalysisRecord): AnalysisUiState {
  return {
    status: record.status,
    loading: false,
    currentStage: record.currentStage,
    completedStages: Object.keys(record.stageResults)
      .map(stageFromResultKey)
      .filter((stage): stage is WorkflowStage => stage !== null),
    events: [],
    stageResults: record.stageResults,
    analysis: record.result,
    error: record.errorMessage,
  }
}

function stageFromResultKey(key: string): WorkflowStage | null {
  switch (key) {
    case 'researcher':
      return 'researching'
    case 'relatedArticleSearch':
      return 'searching_related_articles'
    case 'technicalExplainer':
      return 'technical_analysis'
    case 'impactAnalyst':
      return 'impact_analysis'
    case 'synthesizer':
      return 'synthesizing'
    default:
      return null
  }
}

function stageResultKey(stage: WorkflowStage) {
  switch (stage) {
    case 'researching':
      return 'researcher'
    case 'searching_related_articles':
      return 'relatedArticleSearch'
    case 'technical_analysis':
      return 'technicalExplainer'
    case 'impact_analysis':
      return 'impactAnalyst'
    case 'synthesizing':
      return 'synthesizer'
    default:
      return null
  }
}

async function readEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: WorkflowEvent) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const dataLine = block
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (!dataLine) {
        console.debug('[article-analysis] stream block without data line', { block })
        continue
      }

      try {
        onEvent(JSON.parse(dataLine.slice('data: '.length)) as WorkflowEvent)
      } catch (parseError) {
        console.error('[article-analysis] failed to parse stream event', {
          dataLine,
          parseError,
        })
        throw parseError
      }
    }
  }
}

function AnalysisPanel({ state }: { state: AnalysisUiState }) {
  const currentStageLabel = state.currentStage ? stageLabel(state.currentStage) : 'Pending'
  const [activityIndex, setActivityIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    setActivityIndex(0)

    if (state.status !== 'running') {
      return
    }

    const intervalId = window.setInterval(() => {
      setActivityIndex((current) => (current + 1) % activityMessages.length)
    }, 2500)

    return () => window.clearInterval(intervalId)
  }, [state.status, state.currentStage])

  useEffect(() => {
    setElapsedSeconds(0)

    if (state.status !== 'running') {
      return
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [state.status])

  return (
    <section className="analysis-panel">
      <div className={`analysis-stage-banner ${state.status}`}>
        {state.status === 'running' ? <span className="analysis-spinner" /> : null}
        <div>
          <p className="analysis-stage-kicker">
            {state.status === 'running'
              ? 'Analysis in progress'
              : state.status === 'failed'
                ? 'Analysis failed'
                : 'Analysis complete'}
          </p>
          <p className="analysis-stage-current">{currentStageLabel}</p>
          {state.status === 'running' ? (
            <>
              <p className="analysis-activity">{activityMessages[activityIndex]}</p>
              <p className="analysis-elapsed">
                {elapsedSeconds === 0 ? 'Starting...' : `${elapsedSeconds}s elapsed`}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {state.error ? <p className="status error">{state.error}</p> : null}

      {state.analysis ? <FinalAnalysisView analysis={state.analysis} /> : null}
    </section>
  )
}

function FinalAnalysisView({ analysis }: { analysis: FinalAnalysis }) {
  const [activeConcept, setActiveConcept] = useState<TechnicalConcept | null>(null)
  const conceptMatches = buildConceptMatches(analysis.technicalConcepts)

  return (
    <div className="final-analysis">
      <h2>Analysis</h2>
      <AnalysisList
        title="What happened"
        items={analysis.whatHappened.map((item) => `${item.statement} (${item.sourceType})`)}
        conceptMatches={conceptMatches}
        onExplainConcept={setActiveConcept}
      />
      <AnalysisList
        title="Background"
        items={analysis.background.map((item) => `${item.statement} (${item.sourceType})`)}
        conceptMatches={conceptMatches}
        onExplainConcept={setActiveConcept}
      />
      {activeConcept ? (
        <div className="concept-explanation">
          <button
            className="concept-close"
            type="button"
            onClick={() => setActiveConcept(null)}
            aria-label="Close explanation"
          >
            x
          </button>
          <strong>{activeConcept.term}</strong>
          <p>{activeConcept.explanation}</p>
          <p>{activeConcept.relevance}</p>
        </div>
      ) : null}
      <section>
        <h3>Stakeholder impact</h3>
        {analysis.stakeholderImpacts.map((impact) => (
          <div className="analysis-item" key={`${impact.stakeholder}-${impact.impact}`}>
            <strong>
              {impact.stakeholder} ({impact.confidence})
            </strong>
            <p>
              <HighlightedText
                text={impact.impact}
                conceptMatches={conceptMatches}
                onExplainConcept={setActiveConcept}
              />
            </p>
            <p>
              <HighlightedText
                text={impact.reasoning}
                conceptMatches={conceptMatches}
                onExplainConcept={setActiveConcept}
              />
            </p>
          </div>
        ))}
      </section>
      <AnalysisList
        title="Uncertainty"
        items={analysis.uncertainties.map((item) => `${item.issue}: ${item.explanation}`)}
        conceptMatches={conceptMatches}
        onExplainConcept={setActiveConcept}
      />
      <section>
        <h3>Related articles</h3>
        {analysis.relatedArticles.length > 0 ? (
          <ul>
            {analysis.relatedArticles.map((article) => (
              <li key={article.articleId}>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No related stored articles found.</p>
        )}
      </section>
      <AnalysisList title="Context limitations" items={analysis.contextLimitations} />
    </div>
  )
}

type ConceptMatch = {
  concept: TechnicalConcept
  normalizedTerm: string
}

function buildConceptMatches(concepts: TechnicalConcept[]): ConceptMatch[] {
  const seen = new Set<string>()

  return concepts
    .map((concept) => ({
      concept,
      normalizedTerm: normalizeConceptTerm(concept.term),
    }))
    .filter((entry) => {
      if (entry.normalizedTerm.length < 4 || seen.has(entry.normalizedTerm)) {
        return false
      }

      seen.add(entry.normalizedTerm)
      return true
    })
    .sort((left, right) => right.normalizedTerm.length - left.normalizedTerm.length)
}

function normalizeConceptTerm(term: string) {
  return term.trim().toLowerCase().replace(/\s+/g, ' ')
}

function AnalysisList({
  title,
  items,
  conceptMatches,
  onExplainConcept,
}: {
  title: string
  items: string[]
  conceptMatches?: ConceptMatch[]
  onExplainConcept?: (concept: TechnicalConcept) => void
}) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>
              <HighlightedText
                text={item}
                conceptMatches={conceptMatches ?? []}
                onExplainConcept={onExplainConcept ?? (() => {})}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p>None provided.</p>
      )}
    </section>
  )
}

function HighlightedText({
  text,
  conceptMatches,
  onExplainConcept,
}: {
  text: string
  conceptMatches: ConceptMatch[]
  onExplainConcept: (concept: TechnicalConcept) => void
}) {
  if (conceptMatches.length === 0) {
    return <>{text}</>
  }

  const lowerText = text.toLowerCase()
  const ranges: Array<{ start: number; end: number; concept: TechnicalConcept }> = []

  for (const match of conceptMatches) {
    let searchFrom = 0

    while (searchFrom < text.length) {
      const index = lowerText.indexOf(match.normalizedTerm, searchFrom)

      if (index === -1) {
        break
      }

      const end = index + match.normalizedTerm.length

      if (isWordBoundary(text, index - 1) && isWordBoundary(text, end)) {
        const overlaps = ranges.some(
          (range) => index < range.end && end > range.start,
        )

        if (!overlaps) {
          ranges.push({ start: index, end, concept: match.concept })
        }
      }

      searchFrom = end
    }
  }

  if (ranges.length === 0) {
    return <>{text}</>
  }

  ranges.sort((left, right) => left.start - right.start)

  const parts = []
  let cursor = 0

  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start))
    }

    parts.push(
      <button
        className="concept-term"
        type="button"
        key={`${range.start}-${range.end}-${range.concept.term}`}
        onClick={() => onExplainConcept(range.concept)}
        title="Explain this"
      >
        {text.slice(range.start, range.end)}
      </button>,
    )
    cursor = range.end
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

  return <>{parts}</>
}

function isWordBoundary(text: string, index: number) {
  if (index < 0 || index >= text.length) {
    return true
  }

  return !/[a-z0-9]/i.test(text[index])
}

export default App
