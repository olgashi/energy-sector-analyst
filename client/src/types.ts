export type Article = {
  id: number
  title: string
  url: string
  publishedAt: string
  body: string
  source?: string
}

export type FeedDocument = {
  resourceName: string
  articles: Article[]
}

export type ResourceSummary = {
  id: string
  name: string
  type: 'rss'
}

export type WorkflowStage =
  | 'loading_article'
  | 'researching'
  | 'searching_related_articles'
  | 'technical_analysis'
  | 'impact_analysis'
  | 'synthesizing'
  | 'saving'
  | 'completed'
  | 'failed'

export type WorkflowEvent = {
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

export type AiGenerationMetadata = {
  schemaName: string
  model: string
  responseId: string | null
  promptHash: string
  promptLength: number
  generatedAt: string
}

export type AiAnalysisMetadata = {
  promptVersion: string
  promptVersionHash: string
  generations: AiGenerationMetadata[]
}

export type FinalAnalysis = {
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
  aiMetadata?: AiAnalysisMetadata
}

export type TechnicalConcept = FinalAnalysis['technicalConcepts'][number]

export type AnalysisRecord = {
  status: 'running' | 'completed' | 'failed'
  currentStage: WorkflowStage | null
  stageResults: Record<string, unknown>
  result: FinalAnalysis | null
  errorMessage: string | null
}

export type AnalysisUiState = {
  status: 'running' | 'completed' | 'failed'
  loading: boolean
  currentStage: WorkflowStage | null
  completedStages: WorkflowStage[]
  events: WorkflowEvent[]
  stageResults: Record<string, unknown>
  analysis: FinalAnalysis | null
  error: string | null
  startedAtMs: number | null
}
