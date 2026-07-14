import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { createAnalyzeArticleHandler } from './articles.js';
import type { AnalysisRecord } from '../db/analysis.js';
import type { FinalAnalysis, WorkflowProgressEvent } from '../analysis/types.js';
import { UserSafeError } from '../analysis/errors.js';

function createResponseMock() {
  const chunks: string[] = [];
  const headers = new Map<string, string>();
  const response = {
    chunks,
    headers,
    statusCode: 200,
    body: undefined as unknown,
    writableEnded: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      this.writableEnded = true;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    flushHeaders() {},
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      this.writableEnded = true;
      return this;
    },
  };

  return response as Response & {
    statusCode: number;
    body: unknown;
    chunks: string[];
    headers: Map<string, string>;
  } & typeof response;
}

const article = {
  id: 10,
  title: 'Utility plans grid upgrade',
  url: 'https://example.com/article',
  publishedAt: '2026-07-14T10:00:00.000Z',
  body: 'A long enough article body for analysis.'.repeat(10),
  source: 'Utility Dive',
};

const finalAnalysis: FinalAnalysis = {
  articleId: 10,
  analysisVersion: 'v1',
  overview: 'A utility plans a grid upgrade.',
  whatHappened: [{ statement: 'The plan was announced.', sourceType: 'article' }],
  background: [
    {
      statement: 'Grid upgrades can support reliability.',
      sourceType: 'model_background',
    },
  ],
  technicalConcepts: [
    {
      term: 'Grid upgrade',
      explanation: 'Investment in grid infrastructure.',
      relevance: 'It is the subject of the article.',
    },
  ],
  stakeholderImpacts: [
    {
      stakeholder: 'Customers',
      impact: 'Reliability may improve.',
      reasoning: 'Grid investments can reduce outages.',
      confidence: 'medium',
    },
  ],
  uncertainties: [
    {
      issue: 'Cost recovery',
      explanation: 'The article does not report a final decision.',
    },
  ],
  relatedArticles: [],
  contextLimitations: ['No related articles found.'],
  generatedAt: '2026-07-14T12:00:00.000Z',
};

function createRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: 50,
    articleId: 10,
    analysisVersion: 'v1',
    status: 'running',
    currentStage: 'loading_article',
    stageResults: {},
    result: null,
    errorMessage: null,
    startedAt: '2026-07-14T12:00:00.000Z',
    completedAt: null,
    createdAt: '2026-07-14T12:00:00.000Z',
    updatedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  };
}

function readEvents(chunks: string[]): WorkflowProgressEvent[] {
  return chunks
    .join('')
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const dataLine = block.split('\n').find((line) => line.startsWith('data: '));

      assert.ok(dataLine);

      return JSON.parse(dataLine.slice('data: '.length)) as WorkflowProgressEvent;
    });
}

test('unknown article returns 404', async () => {
  const req = { params: { articleId: '999' } } as unknown as Request;
  const res = createResponseMock();
  const next: NextFunction = () => {};
  const handler = createAnalyzeArticleHandler({
    getArticle: async () => null,
  });

  await handler(req, res, next);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Article not found' });
});

test('existing completed analysis is returned without rerunning workflow', async () => {
  let workflowCalls = 0;
  const res = createResponseMock();
  const handler = createAnalyzeArticleHandler({
    getArticle: async () => article,
    findAnalysis: async () =>
      createRecord({
        status: 'completed',
        currentStage: 'completed',
        result: finalAnalysis,
      }),
    runWorkflow: async () => {
      workflowCalls += 1;
      return finalAnalysis;
    },
  });

  await handler(
    { params: { articleId: '10' } } as unknown as Request,
    res,
    (() => {}) as NextFunction,
  );

  const events = readEvents(res.chunks);

  assert.equal(workflowCalls, 0);
  assert.equal(events[0].eventType, 'workflow_completed');
  assert.equal((events[0].result as { result: FinalAnalysis }).result.overview, finalAnalysis.overview);
});

test('workflow events are streamed in order and completed analysis is persisted', async () => {
  const persistedStages: string[] = [];
  let completedResult: unknown = null;
  const res = createResponseMock();
  const handler = createAnalyzeArticleHandler({
    getArticle: async () => article,
    findAnalysis: async () => null,
    startAnalysisRecord: async () => createRecord(),
    updateStage: async (_id, stage) => {
      persistedStages.push(stage);
    },
    updateStageResult: async (_id, stage) => {
      persistedStages.push(stage);
    },
    completeAnalysisRecord: async (_id, result) => {
      completedResult = result;
      return createRecord({
        status: 'completed',
        currentStage: 'completed',
        result,
        stageResults: {
          researcher: { centralEvent: 'Plan announced' },
        },
      });
    },
    runWorkflow: async (_articleId, _version, deps) => {
      await deps.emit?.({
        runId: 'run-1',
        eventType: 'workflow_started',
        stage: 'loading_article',
        timestamp: '2026-07-14T12:00:00.000Z',
      });
      await deps.emit?.({
        runId: 'run-1',
        eventType: 'stage_started',
        stage: 'researching',
        timestamp: '2026-07-14T12:00:01.000Z',
      });
      await deps.emit?.({
        runId: 'run-1',
        eventType: 'stage_completed',
        stage: 'researching',
        timestamp: '2026-07-14T12:00:02.000Z',
        result: { centralEvent: 'Plan announced' },
      });

      return finalAnalysis;
    },
  });

  await handler(
    { params: { articleId: '10' } } as unknown as Request,
    res,
    (() => {}) as NextFunction,
  );

  const events = readEvents(res.chunks);

  assert.deepEqual(
    events.map((event) => event.eventType),
    [
      'workflow_started',
      'stage_started',
      'stage_completed',
      'stage_started',
      'stage_completed',
      'workflow_completed',
    ],
  );
  assert.deepEqual(persistedStages, [
    'researching',
    'researching',
    'saving',
    'saving',
  ]);
  assert.deepEqual(completedResult, finalAnalysis);
  assert.deepEqual(events[2].result, { centralEvent: 'Plan announced' });
});

test('failed workflow status is persisted with safe error details', async () => {
  let failure: { stage: string; message: string } | null = null;
  const res = createResponseMock();
  const handler = createAnalyzeArticleHandler({
    getArticle: async () => article,
    findAnalysis: async () => null,
    startAnalysisRecord: async () => createRecord(),
    updateStage: async () => {},
    updateStageResult: async () => {},
    failAnalysisRecord: async (_id, stage, message) => {
      failure = { stage, message };
      return createRecord({
        status: 'failed',
        currentStage: stage,
        errorMessage: message,
      });
    },
    runWorkflow: async (_articleId, _version, deps) => {
      await deps.emit?.({
        runId: 'run-1',
        eventType: 'stage_started',
        stage: 'impact_analysis',
        timestamp: '2026-07-14T12:00:00.000Z',
      });
      throw new Error('database password leaked detail');
    },
  });

  await handler(
    { params: { articleId: '10' } } as unknown as Request,
    res,
    (() => {}) as NextFunction,
  );

  const events = readEvents(res.chunks);
  const failed = events.at(-1);

  assert.deepEqual(failure, {
    stage: 'impact_analysis',
    message: 'Analysis failed. Please try again.',
  });
  assert.equal(failed?.eventType, 'workflow_failed');
  assert.equal(failed?.stage, 'impact_analysis');
  assert.equal(failed?.error, 'Analysis failed. Please try again.');
  assert.doesNotMatch(JSON.stringify(events), /password leaked/);
});

test('safe workflow errors are returned to the frontend', async () => {
  let failureMessage: string | null = null;
  const res = createResponseMock();
  const handler = createAnalyzeArticleHandler({
    getArticle: async () => article,
    findAnalysis: async () => null,
    startAnalysisRecord: async () => createRecord(),
    updateStage: async () => {},
    updateStageResult: async () => {},
    failAnalysisRecord: async (_id, _stage, message) => {
      failureMessage = message;
      return createRecord({
        status: 'failed',
        currentStage: 'researching',
        errorMessage: message,
      });
    },
    runWorkflow: async (_articleId, _version, deps) => {
      await deps.emit?.({
        runId: 'run-1',
        eventType: 'stage_started',
        stage: 'researching',
        timestamp: '2026-07-14T12:00:00.000Z',
      });
      throw new UserSafeError(
        'OpenAI API key is not configured. Set OPENAI_API_KEY and restart the backend.',
      );
    },
  });

  await handler(
    { params: { articleId: '10' } } as unknown as Request,
    res,
    (() => {}) as NextFunction,
  );

  const failed = readEvents(res.chunks).at(-1);

  assert.equal(
    failureMessage,
    'OpenAI API key is not configured. Set OPENAI_API_KEY and restart the backend.',
  );
  assert.equal(failed?.stage, 'researching');
  assert.equal(failed?.error, failureMessage);
});
