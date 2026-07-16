import type {
  AnalysisRecord,
  AnalysisUiState,
  WorkflowEvent,
  WorkflowStage,
} from './types'

export function createInitialAnalysisState(): AnalysisUiState {
  return {
    status: 'running',
    loading: true,
    currentStage: 'loading_article',
    completedStages: [],
    events: [],
    stageResults: {},
    analysis: null,
    error: null,
    startedAtMs: Date.now(),
  }
}

export function applyWorkflowEvent(
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
      startedAtMs: null,
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
      startedAtMs: null,
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
    startedAtMs: state.startedAtMs ?? Date.now(),
  }
}

export function analysisRecordToUiState(record: AnalysisRecord): AnalysisUiState {
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
    startedAtMs: null,
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
