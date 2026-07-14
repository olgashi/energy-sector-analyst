import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler, type Response } from 'express';
import { getArticleById } from '../db/articles.js';
import {
  ANALYSIS_VERSION,
  completeAnalysis,
  failAnalysis,
  findAnalysisByArticle,
  startAnalysis,
  updateAnalysisStage,
  updateAnalysisStageResult,
  type AnalysisRecord,
} from '../db/analysis.js';
import {
  runAnalysisWorkflow,
  type AnalysisWorkflowDeps,
} from '../analysis/workflow.js';
import { NotFoundError, toSafeErrorMessage } from '../analysis/errors.js';
import type {
  WorkflowProgressEvent,
  WorkflowStage,
} from '../analysis/types.js';

const router = Router();

type AnalyzeArticleDeps = {
  getArticle?: typeof getArticleById;
  findAnalysis?: typeof findAnalysisByArticle;
  startAnalysisRecord?: typeof startAnalysis;
  updateStage?: typeof updateAnalysisStage;
  updateStageResult?: typeof updateAnalysisStageResult;
  completeAnalysisRecord?: typeof completeAnalysis;
  failAnalysisRecord?: typeof failAnalysis;
  runWorkflow?: typeof runAnalysisWorkflow;
};

export function createGetArticleAnalysisHandler(
  deps: Pick<AnalyzeArticleDeps, 'findAnalysis'> = {},
): RequestHandler {
  const findAnalysis = deps.findAnalysis ?? findAnalysisByArticle;

  return async (req, res, next) => {
    try {
      const articleId = parseArticleId(req.params.articleId);

      if (articleId === null) {
        res.status(400).json({ error: 'Invalid article id' });
        return;
      }

      const analysis = await findAnalysis(articleId, ANALYSIS_VERSION);

      if (!analysis) {
        res.status(404).json({ error: 'Analysis not found' });
        return;
      }

      res.json(analysisToResponse(analysis));
    } catch (error) {
      next(error);
    }
  };
}

export function createAnalyzeArticleHandler(
  deps: AnalyzeArticleDeps = {},
): RequestHandler {
  const getArticle = deps.getArticle ?? getArticleById;
  const findAnalysis = deps.findAnalysis ?? findAnalysisByArticle;
  const startAnalysisRecord = deps.startAnalysisRecord ?? startAnalysis;
  const updateStage = deps.updateStage ?? updateAnalysisStage;
  const updateStageResult = deps.updateStageResult ?? updateAnalysisStageResult;
  const completeAnalysisRecord = deps.completeAnalysisRecord ?? completeAnalysis;
  const failAnalysisRecord = deps.failAnalysisRecord ?? failAnalysis;
  const runWorkflow = deps.runWorkflow ?? runAnalysisWorkflow;

  return async (req, res, next) => {
    const articleId = parseArticleId(req.params.articleId);

    if (articleId === null) {
      res.status(400).json({ error: 'Invalid article id' });
      return;
    }

    try {
      const article = await getArticle(articleId);

      if (!article) {
        res.status(404).json({ error: 'Article not found' });
        return;
      }

      const existing = await findAnalysis(articleId, ANALYSIS_VERSION);

      prepareSseResponse(res);

      if (existing?.status === 'completed') {
        writeSseEvent(res, {
          runId: `stored-${existing.id}`,
          eventType: 'workflow_completed',
          stage: 'completed',
          timestamp: new Date().toISOString(),
          result: analysisToResponse(existing),
        });
        res.end();
        return;
      }

      const analysisRecord = await startAnalysisRecord(
        articleId,
        ANALYSIS_VERSION,
      );
      const runId = randomUUID();
      let currentStage: WorkflowStage = 'loading_article';
      let failed = false;

      const emit = async (event: WorkflowProgressEvent) => {
        currentStage = event.stage;

        if (event.eventType === 'stage_started') {
          await updateStage(analysisRecord.id, event.stage);
        }

        if (event.eventType === 'stage_completed') {
          const stageResultKey = toStageResultKey(event.stage);

          if (stageResultKey) {
            await updateStageResult(
              analysisRecord.id,
              event.stage,
              stageResultKey,
              event.result ?? {},
            );
          } else {
            await updateStage(analysisRecord.id, event.stage);
          }
        }

        writeSseEvent(res, event);
      };

      try {
        const finalAnalysis = await runWorkflow(articleId, ANALYSIS_VERSION, {
          emit,
          runId,
        } satisfies AnalysisWorkflowDeps);

        const savingStarted: WorkflowProgressEvent = {
          runId,
          eventType: 'stage_started',
          stage: 'saving',
          timestamp: new Date().toISOString(),
        };

        await emit(savingStarted);
        const completed = await completeAnalysisRecord(
          analysisRecord.id,
          finalAnalysis,
        );
        await emit({
          runId,
          eventType: 'stage_completed',
          stage: 'saving',
          timestamp: new Date().toISOString(),
          result: { analysisId: completed.id },
        });
        writeSseEvent(res, {
          runId,
          eventType: 'workflow_completed',
          stage: 'completed',
          timestamp: new Date().toISOString(),
          result: analysisToResponse(completed),
        });
      } catch (error) {
        failed = true;
        const safeMessage =
          error instanceof NotFoundError
            ? 'Article not found.'
            : toSafeErrorMessage(error);
        const failedRecord = await failAnalysisRecord(
          analysisRecord.id,
          currentStage,
          safeMessage,
        );

        writeSseEvent(res, {
          runId,
          eventType: 'workflow_failed',
          stage: 'failed',
          timestamp: new Date().toISOString(),
          result: analysisToResponse(failedRecord),
          error: safeMessage,
        });
      } finally {
        if (!failed || !res.writableEnded) {
          res.end();
        }
      }
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }

      next(error);
    }
  };
}

export const getArticleAnalysis = createGetArticleAnalysisHandler();
export const analyzeArticle = createAnalyzeArticleHandler();

router.get('/:articleId/analysis', getArticleAnalysis);
router.post('/:articleId/analysis', analyzeArticle);

export default router;

function parseArticleId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function prepareSseResponse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function writeSseEvent(res: Response, event: WorkflowProgressEvent): void {
  res.write(`event: ${event.eventType}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function toStageResultKey(stage: WorkflowStage): string | null {
  switch (stage) {
    case 'researching':
      return 'researcher';
    case 'searching_related_articles':
      return 'relatedArticleSearch';
    case 'technical_analysis':
      return 'technicalExplainer';
    case 'impact_analysis':
      return 'impactAnalyst';
    case 'synthesizing':
      return 'synthesizer';
    default:
      return null;
  }
}

function analysisToResponse(record: AnalysisRecord) {
  return {
    id: record.id,
    articleId: record.articleId,
    analysisVersion: record.analysisVersion,
    status: record.status,
    currentStage: record.currentStage,
    stageResults: record.stageResults,
    result: record.result,
    errorMessage: record.errorMessage,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
