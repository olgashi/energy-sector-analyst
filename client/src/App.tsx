import { useEffect, useState } from 'react'

type Article = {
  id: number
  title: string
  url: string
  publishedAt: string
  body: string
}

type FeedDocument = {
  resourceName: string
  articles: Article[]
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
  const [document, setDocument] = useState<FeedDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analysisByArticle, setAnalysisByArticle] = useState<Record<number, AnalysisUiState>>({})

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

    async function loadArticles() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`${apiBaseUrl}/resources/utility-dive/articles`)
        console.info('[article-analysis] resource articles response', {
          status: response.status,
          ok: response.ok,
        })

        if (!response.ok) {
          throw new Error('Failed to load articles')
        }

        const data: FeedDocument = await response.json()
        console.info('[article-analysis] articles loaded', {
          articleCount: data.articles.length,
          resourceName: data.resourceName,
        })

        if (!cancelled) {
          setDocument(data)
          void loadStoredAnalyses(data.articles, () => cancelled)
        }
      } catch (loadError) {
        console.error('[article-analysis] article load failed', {
          error: loadError,
        })
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadArticles()

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
        <p className="eyebrow">Energy Sector Analyst</p>
        <h1>Recent utility news</h1>
        <p className="intro">
          Articles from the last 72 hours for {document?.resourceName ?? 'Utility Dive'}.
        </p>

        {loading ? <p className="status">Loading articles...</p> : null}
        {error ? <p className="status error">{error}</p> : null}

        {!loading && !error && document ? (
          <div className="article-list">
            {document.articles.length > 0 ? (
              document.articles.map((article) => (
                <article className="article-card" key={article.url}>
                  <a
                    className="article-title"
                    href={article.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {article.title}
                  </a>
                  <p className="article-date">{formatDate(article.publishedAt)}</p>
                  <p className="article-preview">{toPreview(article.body)}</p>
                  <button
                    className="analyze-button"
                    type="button"
                    disabled={analysisByArticle[article.id]?.loading}
                    onClick={() => void analyzeArticle(article.id)}
                  >
                    {analysisByArticle[article.id]?.loading ? 'Analyzing...' : 'Analyze'}
                  </button>
                  {analysisByArticle[article.id] ? (
                    <AnalysisPanel state={analysisByArticle[article.id]} />
                  ) : null}
                </article>
              ))
            ) : (
              <p className="status">No recent articles found.</p>
            )}
          </div>
        ) : null}
      </section>
    </main>
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
        </div>
      </div>

      {state.completedStages.length > 0 ? (
        <div className="completed-stage-list" aria-label="Completed stages">
          {state.completedStages.map((stage) => (
            <span className="completed-stage" key={stage}>
              {stageLabel(stage)}
            </span>
          ))}
        </div>
      ) : null}

      {Object.keys(state.stageResults).length > 0 ? (
        <details className="debug-output">
          <summary>Debug details</summary>
          {Object.entries(state.stageResults).map(([key, value]) => (
            <details className="stage-output" key={key}>
              <summary>{stageResultLabel(key)}</summary>
              <pre>{JSON.stringify(value, null, 2)}</pre>
            </details>
          ))}
        </details>
      ) : null}

      {state.error ? <p className="status error">{state.error}</p> : null}

      {state.analysis ? <FinalAnalysisView analysis={state.analysis} /> : null}
    </section>
  )
}

function FinalAnalysisView({ analysis }: { analysis: FinalAnalysis }) {
  return (
    <div className="final-analysis">
      <h2>Analysis</h2>
      <AnalysisList
        title="What happened"
        items={analysis.whatHappened.map((item) => `${item.statement} (${item.sourceType})`)}
      />
      <AnalysisList
        title="Background"
        items={analysis.background.map((item) => `${item.statement} (${item.sourceType})`)}
      />
      <section>
        <h3>Important concepts</h3>
        {analysis.technicalConcepts.map((concept) => (
          <div className="analysis-item" key={concept.term}>
            <strong>{concept.term}</strong>
            <p>{concept.relevance}</p>
            <details className="concept-details">
              <summary>Definition</summary>
              <p>{concept.explanation}</p>
            </details>
          </div>
        ))}
      </section>
      <section>
        <h3>Stakeholder impact</h3>
        {analysis.stakeholderImpacts.map((impact) => (
          <div className="analysis-item" key={`${impact.stakeholder}-${impact.impact}`}>
            <strong>
              {impact.stakeholder} ({impact.confidence})
            </strong>
            <p>{impact.impact}</p>
            <p>{impact.reasoning}</p>
          </div>
        ))}
      </section>
      <AnalysisList
        title="Uncertainty"
        items={analysis.uncertainties.map((item) => `${item.issue}: ${item.explanation}`)}
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

function stageResultLabel(key: string) {
  switch (key) {
    case 'researcher':
      return 'Research notes'
    case 'relatedArticleSearch':
      return 'Stored article search'
    case 'technicalExplainer':
      return 'Concept analysis'
    case 'impactAnalyst':
      return 'Stakeholder impact analysis'
    case 'synthesizer':
      return 'Final synthesis'
    default:
      return key
  }
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>None provided.</p>
      )}
    </section>
  )
}

export default App
