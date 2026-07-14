import type {
  ArticleForAnalysis,
  RelatedStoredArticle,
} from '../db/articles.js';
import type { CachedTechnicalConcept } from '../db/technicalConcepts.js';

export const workflowStages = [
  'loading_article',
  'researching',
  'searching_related_articles',
  'technical_analysis',
  'impact_analysis',
  'synthesizing',
  'saving',
  'completed',
  'failed',
] as const;

export type WorkflowStage = (typeof workflowStages)[number];

export const workflowEventTypes = [
  'workflow_started',
  'stage_started',
  'stage_completed',
  'stage_failed',
  'workflow_completed',
  'workflow_failed',
] as const;

export type WorkflowEventType = (typeof workflowEventTypes)[number];

export type Confidence = 'high' | 'medium' | 'low';

export type SourceType =
  | 'article'
  | 'related_article'
  | 'model_background'
  | 'agent_interpretation';

export type ResearcherOutput = {
  centralEvent: string;
  keyEntities: string[];
  keyTerms: string[];
  backgroundQuestions: string[];
  relatedArticleIds: number[];
  contextLimitations: string[];
};

export type RelatedArticleSearchOutput = {
  performed: boolean;
  query: string;
  articles: RelatedStoredArticle[];
};

export type TechnicalConcept = {
  term: string;
  explanation: string;
  relevance: string;
};

export type TechnicalExplainerOutput = {
  technicalConcepts: TechnicalConcept[];
};

export type CausalContext = {
  explanation: string;
  confidence: Confidence;
};

export type StakeholderImpact = {
  stakeholder: string;
  impact: string;
  reasoning: string;
  confidence: Confidence;
};

export type ImpactAnalystOutput = {
  causalContext: CausalContext[];
  stakeholderImpacts: StakeholderImpact[];
  uncertainties: string[];
};

export type FinalAnalysis = {
  articleId: number;
  analysisVersion: string;
  overview: string;
  whatHappened: Array<{
    statement: string;
    sourceType: SourceType;
  }>;
  background: Array<{
    statement: string;
    sourceType: SourceType;
  }>;
  technicalConcepts: TechnicalConcept[];
  stakeholderImpacts: StakeholderImpact[];
  uncertainties: Array<{
    issue: string;
    explanation: string;
  }>;
  relatedArticles: Array<{
    articleId: number;
    title: string;
    url: string;
    publishedAt: string | null;
  }>;
  contextLimitations: string[];
  generatedAt: string;
};

export type StageResults = {
  researcher?: ResearcherOutput;
  relatedArticleSearch?: RelatedArticleSearchOutput;
  technicalExplainer?: TechnicalExplainerOutput;
  impactAnalyst?: ImpactAnalystOutput;
  synthesizer?: FinalAnalysis;
};

export type WorkflowProgressEvent = {
  runId: string;
  eventType: WorkflowEventType;
  stage: WorkflowStage;
  timestamp: string;
  result?: unknown;
  error?: string;
};

export type AnalysisWorkflowState = {
  articleId: number;
  analysisVersion: string;
  article?: ArticleForAnalysis;
  researcher?: ResearcherOutput;
  relatedArticleSearch?: RelatedArticleSearchOutput;
  cachedTechnicalConcepts?: CachedTechnicalConcept[];
  technicalExplainer?: TechnicalExplainerOutput;
  impactAnalyst?: ImpactAnalystOutput;
  finalAnalysis?: FinalAnalysis;
};
