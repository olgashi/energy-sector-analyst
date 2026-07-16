import { createHash, randomUUID } from 'node:crypto';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import {
  getArticleById,
  searchStoredArticles,
  type ArticleForAnalysis,
  type RelatedStoredArticle,
} from '../db/articles.js';
import {
  findTechnicalConcepts,
  upsertTechnicalConcepts,
} from '../db/technicalConcepts.js';
import { extractArticleTextFromUrl } from '../services/articleExtraction.js';
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
  AiGenerationMetadata,
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
const analysisPromptVersion = 'analysis-workflow-v1';

const StateAnnotation = Annotation.Root({
  articleId: Annotation<number>,
  analysisVersion: Annotation<string>,
  article: Annotation<ArticleForAnalysis | undefined>,
  researcher: Annotation<ResearcherOutput | undefined>,
  relatedArticleSearch: Annotation<RelatedArticleSearchOutput | undefined>,
  cachedTechnicalConcepts: Annotation<
    Awaited<ReturnType<typeof findTechnicalConcepts>> | undefined
  >,
  technicalExplainer: Annotation<TechnicalExplainerOutput | undefined>,
  impactAnalyst: Annotation<ImpactAnalystOutput | undefined>,
  finalAnalysis: Annotation<FinalAnalysis | undefined>,
});

export type AnalysisWorkflowDeps = {
  getArticle?: typeof getArticleById;
  searchArticles?: typeof searchStoredArticles;
  findConcepts?: typeof findTechnicalConcepts;
  saveConcepts?: typeof upsertTechnicalConcepts;
  extractArticleText?: typeof extractArticleTextFromUrl;
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
  const findConcepts = deps.findConcepts ?? findTechnicalConcepts;
  const saveConcepts = deps.saveConcepts ?? upsertTechnicalConcepts;
  const extractArticleText = deps.extractArticleText ?? extractArticleTextFromUrl;
  const generateJson = deps.generateJson ?? createOpenAiJsonGenerator();
  const generations: AiGenerationMetadata[] = [];

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

        const storedSummary = article.body.trim();
        const extracted = await extractArticleText(article.url);
        const extractedText = extracted.text.trim();
        const selectedBody =
          extracted.status === 'extracted' &&
          extractedText.length > storedSummary.length
            ? extractedText
            : storedSummary;

        console.info('Article content selected for analysis', {
          articleId: state.articleId,
          extractedStatus: extracted.status,
          extractedLength: extractedText.length,
          storedSummaryLength: storedSummary.length,
          selectedSource:
            selectedBody === extractedText && extractedText.length > 0
              ? 'extracted'
              : 'stored_summary',
          extractionError: extracted.error ?? null,
        });

        if (selectedBody.length < minimumArticleContentLength) {
          throw new UserSafeError('Article content is too short to analyze.');
        }

        return {
          article: {
            ...article,
            body: selectedBody,
          },
        };
      }),
    )
    .addNode('research', async (state: AnalysisWorkflowState) =>
      withStage('researching', emit, async () => {
        const article = requireStateValue(state.article, 'article');
        const generated = await generateJson({
          schemaName: 'researcher_output',
          schema: researcherSchema,
          system:
            'You are the researcher agent for an energy-sector article analysis workflow. Return only structured JSON matching the schema. Do not include hidden reasoning.',
          prompt: [
            'Identify the central event, entities, terms, background questions, and context limitations.',
            'Do not invent current facts. If the article lacks context, say so in contextLimitations.',
            formatArticleForPrompt(article),
          ].join('\n\n'),
        });
        generations.push(generated.metadata);
        const researcher = validateResearcherOutput(
          generated.data,
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
        const cachedTechnicalConcepts = await findConcepts(researcher.keyTerms);
        console.info('Technical concept cache lookup completed', {
          articleId: state.articleId,
          requestedTerms: researcher.keyTerms.length,
          cacheHits: cachedTechnicalConcepts.length,
        });
        const generated = await generateJson({
          schemaName: 'technical_explainer_output',
          schema: technicalExplainerSchema,
          system:
            'You are the technical explainer agent. Explain stable energy industry, technical, regulatory, or market concepts. Return only structured JSON.',
          prompt: [
            'Explain important concepts needed to understand this article.',
            'Keep each explanation concise: target 2-4 sentences and no more than 120 words.',
            'Keep each relevance field to 1 sentence focused on this article.',
            'Use stable model knowledge only for general explanations.',
            'Cached concept definitions, when supplied, are reusable background. Reuse their substance and avoid unnecessary redefinition, but still write article-specific relevance.',
            'Do not invent current laws, decisions, company actions, dates, or numerical claims.',
            formatArticleForPrompt(article),
            `Research notes:\n${JSON.stringify(researcher)}`,
            `Related articles:\n${JSON.stringify(summarizeRelatedArticles(relatedArticleSearch.articles))}`,
            `Cached concept definitions:\n${JSON.stringify(cachedTechnicalConcepts)}`,
          ].join('\n\n'),
        });
        generations.push(generated.metadata);
        const technicalExplainer = validateTechnicalExplainerOutput(
          generated.data,
        );
        await saveConcepts(
          technicalExplainer.technicalConcepts.map((concept) => ({
            term: concept.term,
            explanation: concept.explanation,
          })),
        );
        console.info('Technical concept cache upsert completed', {
          articleId: state.articleId,
          conceptCount: technicalExplainer.technicalConcepts.length,
        });

        return { cachedTechnicalConcepts, technicalExplainer };
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
        const generated = await generateJson({
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
        });
        generations.push(generated.metadata);
        const impactAnalyst = validateImpactAnalystOutput(
          generated.data,
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
        const generated = await generateJson({
          schemaName: 'final_article_analysis',
          schema: finalAnalysisSchema,
          system:
            'You are the synthesizer and verifier. Combine prior structured outputs, remove unsupported claims, preserve uncertainty, and return only structured JSON.',
          prompt: [
            'Produce the final article analysis.',
            'Keep the final analysis concise without dropping essential context.',
            'Overview: exactly 1 short sentence for schema compatibility. It must not repeat specific details that belong in whatHappened.',
            'What happened: 3-5 short items maximum.',
            'Background: 4 short items maximum, only context that directly changes interpretation.',
            'Technical concept explanations should stay concise because the UI can expand them.',
            'Stakeholder impacts: prioritize the most material stakeholders and keep reasoning direct.',
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
        });
        generations.push(generated.metadata);
        const rawAnalysis = validateFinalAnalysis(generated.data);
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
          aiMetadata: {
            promptVersion: analysisPromptVersion,
            promptVersionHash: hashText(analysisPromptVersion),
            generations: [...generations],
          },
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
      result: extractStageResult(stage, result),
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

function extractStageResult(
  stage: WorkflowStage,
  result: Partial<AnalysisWorkflowState>,
): unknown {
  if (stage === 'loading_article' && result.article) {
    return {
      id: result.article.id,
      url: result.article.url,
      title: result.article.title,
      publishedAt: result.article.publishedAt,
      source: result.article.source,
      contentLength: result.article.body.length,
    };
  }

  return (
    result.researcher ??
    result.relatedArticleSearch ??
    result.technicalExplainer ??
    result.impactAnalyst ??
    result.finalAnalysis ??
    result
  );
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
    `Content:\n${article.body}`,
  ].join('\n');
}
