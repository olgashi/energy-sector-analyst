import { randomUUID } from 'node:crypto';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  getArticleById,
  searchStoredArticles,
  type ArticleForAnalysis,
  type RelatedStoredArticle,
} from '../db/articles.js';
import {
  finalAnalysisSchema,
  impactAnalystSchema,
  researcherSchema,
  technicalExplainerSchema,
} from './schemas.js';
import {
  validateFinalAnalysis,
  validateImpactAnalystOutput,
  validateResearcherOutput,
  validateTechnicalExplainerOutput,
} from './validation.js';
import { NotFoundError, UserSafeError, toSafeErrorMessage } from './errors.js';
import type {
  AnalysisWorkflowState,
  FinalAnalysis,
  ImpactAnalystOutput,
  RelatedArticleSearchOutput,
  ResearcherOutput,
  TechnicalExplainerOutput,
  WorkflowProgressEvent,
  WorkflowStage,
} from './types.js';
import {
  createOpenAiJsonGenerator,
  type GenerateJson,
} from './llm.js';

const minimumArticleContentLength = 120;
const relatedArticleLimit = 5;

const StateAnnotation = Annotation.Root({
  articleId: Annotation<number>,
  analysisVersion: Annotation<string>,
  article: Annotation<ArticleForAnalysis | undefined>,
  researcher: Annotation<ResearcherOutput | undefined>,
  relatedArticleSearch: Annotation<RelatedArticleSearchOutput | undefined>,
  technicalExplainer: Annotation<TechnicalExplainerOutput | undefined>,
  impactAnalyst: Annotation<ImpactAnalystOutput | undefined>,
  finalAnalysis: Annotation<FinalAnalysis | undefined>,
});

export type AnalysisWorkflowDeps = {
  getArticle?: typeof getArticleById;
  searchArticles?: typeof searchStoredArticles;
  generateJson?: GenerateJson;
  emit?: (event: WorkflowProgressEvent) => Promise<void> | void;
  runId?: string;
  now?: () => Date;
};

export async function runAnalysisWorkflow(
  articleId: number,
  analysisVersion: string,
  deps: AnalysisWorkflowDeps = {},
): Promise<FinalAnalysis> {
  const runId = deps.runId ?? randomUUID();
  const now = deps.now ?? (() => new Date());
  const emit = async (
    event: Omit<WorkflowProgressEvent, 'runId' | 'timestamp'>,
  ) => {
    await deps.emit?.({
      runId,
      timestamp: now().toISOString(),
      ...event,
    });
  };
  const getArticle = deps.getArticle ?? getArticleById;
  const searchArticles = deps.searchArticles ?? searchStoredArticles;
  const generateJson = deps.generateJson ?? createOpenAiJsonGenerator();

  await emit({
    eventType: 'workflow_started',
    stage: 'loading_article',
  });

  const graph = new StateGraph(StateAnnotation)
    .addNode('loadArticle', async (state: AnalysisWorkflowState) =>
      withStage('loading_article', emit, async () => {
        const article = await getArticle(state.articleId);

        if (!article) {
          throw new NotFoundError('Article not found.');
        }

        if (article.body.trim().length < minimumArticleContentLength) {
          throw new UserSafeError('Article content is too short to analyze.');
        }

        return { article };
      }),
    )
    .addNode('research', async (state: AnalysisWorkflowState) =>
      withStage('researching', emit, async () => {
        const article = requireStateValue(state.article, 'article');
        const researcher = validateResearcherOutput(
          await generateJson({
            schemaName: 'researcher_output',
            schema: researcherSchema,
            system:
              'You are the researcher agent for an energy-sector article analysis workflow. Return only structured JSON matching the schema. Do not include hidden reasoning.',
            prompt: [
              'Identify the central event, entities, terms, background questions, and context limitations.',
              'Do not invent current facts. If the article lacks context, say so in contextLimitations.',
              formatArticleForPrompt(article),
            ].join('\n\n'),
          }),
        );

        return { researcher };
      }),
    )
    .addNode('searchRelated', async (state: AnalysisWorkflowState) =>
      withStage('searching_related_articles', emit, async () => {
        const article = requireStateValue(state.article, 'article');
        const researcher = requireStateValue(state.researcher, 'researcher');
        const query = buildRelatedArticleQuery(article, researcher);
        const articles = await searchArticles(
          query,
          state.articleId,
          relatedArticleLimit,
        );
        const relatedArticleSearch: RelatedArticleSearchOutput = {
          performed: query.trim().length > 0,
          query,
          articles,
        };

        return { relatedArticleSearch };
      }),
    )
    .addNode('technicalAnalysis', async (state: AnalysisWorkflowState) =>
      withStage('technical_analysis', emit, async () => {
        const article = requireStateValue(state.article, 'article');
        const researcher = requireStateValue(state.researcher, 'researcher');
        const relatedArticleSearch = requireStateValue(
          state.relatedArticleSearch,
          'relatedArticleSearch',
        );
        const technicalExplainer = validateTechnicalExplainerOutput(
          await generateJson({
            schemaName: 'technical_explainer_output',
            schema: technicalExplainerSchema,
            system:
              'You are the technical explainer agent. Explain stable energy industry, technical, regulatory, or market concepts. Return only structured JSON.',
            prompt: [
              'Explain important concepts needed to understand this article.',
              'Use stable model knowledge only for general explanations.',
              'Do not invent current laws, decisions, company actions, dates, or numerical claims.',
              formatArticleForPrompt(article),
              `Research notes:\n${JSON.stringify(researcher)}`,
              `Related articles:\n${JSON.stringify(summarizeRelatedArticles(relatedArticleSearch.articles))}`,
            ].join('\n\n'),
          }),
        );

        return { technicalExplainer };
      }),
    )
    .addNode('impactAnalysis', async (state: AnalysisWorkflowState) =>
      withStage('impact_analysis', emit, async () => {
        const article = requireStateValue(state.article, 'article');
        const researcher = requireStateValue(state.researcher, 'researcher');
        const relatedArticleSearch = requireStateValue(
          state.relatedArticleSearch,
          'relatedArticleSearch',
        );
        const impactAnalyst = validateImpactAnalystOutput(
          await generateJson({
            schemaName: 'impact_analyst_output',
            schema: impactAnalystSchema,
            system:
              'You are the impact analyst agent. Distinguish article-supported facts from interpretation and attach confidence to interpretations. Return only structured JSON.',
            prompt: [
              'Explain likely prompts, stakeholders, direct consequences, and uncertainties.',
              'Keep interpretive claims qualified and assign high, medium, or low confidence.',
              'Do not invent facts beyond the article and related stored articles.',
              formatArticleForPrompt(article),
              `Research notes:\n${JSON.stringify(researcher)}`,
              `Related articles:\n${JSON.stringify(summarizeRelatedArticles(relatedArticleSearch.articles))}`,
            ].join('\n\n'),
          }),
        );

        return { impactAnalyst };
      }),
    )
    .addNode('synthesize', async (state: AnalysisWorkflowState) =>
      withStage('synthesizing', emit, async () => {
        const article = requireStateValue(state.article, 'article');
        const researcher = requireStateValue(state.researcher, 'researcher');
        const relatedArticleSearch = requireStateValue(
          state.relatedArticleSearch,
          'relatedArticleSearch',
        );
        const technicalExplainer = requireStateValue(
          state.technicalExplainer,
          'technicalExplainer',
        );
        const impactAnalyst = requireStateValue(
          state.impactAnalyst,
          'impactAnalyst',
        );
        const rawAnalysis = validateFinalAnalysis(
          await generateJson({
            schemaName: 'final_article_analysis',
            schema: finalAnalysisSchema,
            system:
              'You are the synthesizer and verifier. Combine prior structured outputs, remove unsupported claims, preserve uncertainty, and return only structured JSON.',
            prompt: [
              'Produce the final article analysis.',
              'Separate article facts, related article facts, model background, and agent interpretation using sourceType.',
              'Do not introduce major new claims.',
              'Use the articleId and analysisVersion supplied here.',
              formatArticleForPrompt(article),
              `articleId: ${state.articleId}`,
              `analysisVersion: ${state.analysisVersion}`,
              `Researcher:\n${JSON.stringify(researcher)}`,
              `Related search:\n${JSON.stringify(summarizeRelatedArticles(relatedArticleSearch.articles))}`,
              `Technical explainer:\n${JSON.stringify(technicalExplainer)}`,
              `Impact analyst:\n${JSON.stringify(impactAnalyst)}`,
            ].join('\n\n'),
          }),
        );
        const finalAnalysis: FinalAnalysis = {
          ...rawAnalysis,
          articleId: state.articleId,
          analysisVersion: state.analysisVersion,
          relatedArticles: relatedArticleSearch.articles.map((related) => ({
            articleId: related.articleId,
            title: related.title,
            url: related.url,
            publishedAt: related.publishedAt,
          })),
          contextLimitations: [
            ...new Set([
              ...rawAnalysis.contextLimitations,
              ...researcher.contextLimitations,
            ]),
          ],
          generatedAt: now().toISOString(),
        };

        return { finalAnalysis: validateFinalAnalysis(finalAnalysis) };
      }),
    )
    .addEdge(START, 'loadArticle')
    .addEdge('loadArticle', 'research')
    .addEdge('research', 'searchRelated')
    .addEdge('searchRelated', 'technicalAnalysis')
    .addEdge('searchRelated', 'impactAnalysis')
    .addEdge(['technicalAnalysis', 'impactAnalysis'], 'synthesize')
    .addEdge('synthesize', END)
    .compile();

  const finalState: AnalysisWorkflowState = await graph.invoke({
    articleId,
    analysisVersion,
  });

  return requireStateValue(finalState.finalAnalysis, 'finalAnalysis');
}

async function withStage<T extends Partial<AnalysisWorkflowState>>(
  stage: WorkflowStage,
  emit: (event: Omit<WorkflowProgressEvent, 'runId' | 'timestamp'>) => Promise<void>,
  fn: () => Promise<T>,
): Promise<T> {
  await emit({
    eventType: 'stage_started',
    stage,
  });

  try {
    const result = await fn();
    await emit({
      eventType: 'stage_completed',
      stage,
      result: extractStageResult(result),
    });

    return result;
  } catch (error) {
    await emit({
      eventType: 'stage_failed',
      stage,
      error: toSafeErrorMessage(error),
    });
    throw error;
  }
}

function extractStageResult(result: Partial<AnalysisWorkflowState>): unknown {
  return (
    result.article ??
    result.researcher ??
    result.relatedArticleSearch ??
    result.technicalExplainer ??
    result.impactAnalyst ??
    result.finalAnalysis ??
    result
  );
}

function requireStateValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Missing workflow state: ${name}`);
  }

  return value;
}

function buildRelatedArticleQuery(
  article: ArticleForAnalysis,
  researcher: ResearcherOutput,
): string {
  return [
    researcher.centralEvent,
    ...researcher.keyEntities.slice(0, 5),
    ...researcher.keyTerms.slice(0, 5),
    article.title,
  ]
    .filter(Boolean)
    .join(' ');
}

function summarizeRelatedArticles(articles: RelatedStoredArticle[]) {
  return articles.map((article) => ({
    articleId: article.articleId,
    title: article.title,
    publishedAt: article.publishedAt,
    url: article.url,
    source: article.source,
    content: article.content.slice(0, 1200),
  }));
}

function formatArticleForPrompt(article: ArticleForAnalysis): string {
  return [
    `Article ID: ${article.id}`,
    `Source: ${article.source}`,
    `Title: ${article.title}`,
    `Published at: ${article.publishedAt ?? 'unknown'}`,
    `URL: ${article.url}`,
    `Content:\n${article.body.slice(0, 8000)}`,
  ].join('\n');
}
