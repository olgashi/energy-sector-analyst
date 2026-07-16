// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from './App';

const article = {
  id: 101,
  title: 'Grid reliability plan advances',
  url: 'https://example.com/grid-reliability',
  publishedAt: '2026-07-14T12:00:00.000Z',
  body: 'A utility proposed upgrades to improve local grid reliability.',
};

const finalAnalysis = {
  overview: 'A utility is advancing a grid reliability plan.',
  whatHappened: [
    {
      statement: 'The utility announced a proposed grid upgrade program.',
      sourceType: 'article',
    },
  ],
  background: [
    {
      statement: 'Distribution upgrades can reduce outage risk.',
      sourceType: 'model_background',
    },
  ],
  technicalConcepts: [
    {
      term: 'Distribution grid',
      explanation: 'The local system that delivers electricity to customers.',
      relevance: 'The article focuses on local reliability work.',
    },
  ],
  stakeholderImpacts: [
    {
      stakeholder: 'Customers',
      impact: 'Reliability may improve.',
      reasoning: 'Grid upgrades can reduce equipment-related outages.',
      confidence: 'medium',
    },
  ],
  uncertainties: [
    {
      issue: 'Cost recovery',
      explanation: 'The article does not report a final regulatory decision.',
    },
  ],
  relatedArticles: [],
  contextLimitations: ['The article does not include project-level cost details.'],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(handleFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('loads articles, streams analysis, and renders final analysis', async () => {
  const user = userEvent.setup();

  render(<App />);

  expect(await screen.findByText(article.title)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /view analysis/i }));
  await user.click(screen.getByRole('button', { name: /analyze article/i }));

  expect(
    await screen.findByText('The utility announced a proposed grid upgrade program. (article)'),
  ).toBeInTheDocument();
  expect(screen.getByText('Customers (medium)')).toBeInTheDocument();
  expect(screen.getByText('No related stored articles found.')).toBeInTheDocument();
});

async function handleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  const method = init?.method ?? 'GET';

  if (url.endsWith('/api/resources')) {
    return jsonResponse([
      {
        id: 'utility-dive',
        name: 'Utility Dive',
        type: 'rss',
      },
    ]);
  }

  if (url.endsWith('/api/resources/utility-dive/articles')) {
    return jsonResponse({
      resourceName: 'Utility Dive',
      articles: [article],
    });
  }

  if (url.endsWith('/api/articles/101/analysis') && method === 'GET') {
    return jsonResponse({ error: 'Analysis not found' }, 404);
  }

  if (url.endsWith('/api/articles/101/analysis') && method === 'POST') {
    return sseResponse([
      {
        runId: 'run-smoke',
        eventType: 'stage_started',
        stage: 'researching',
        timestamp: '2026-07-14T12:00:00.000Z',
      },
      {
        runId: 'run-smoke',
        eventType: 'workflow_completed',
        stage: 'completed',
        timestamp: '2026-07-14T12:00:01.000Z',
        result: {
          id: 501,
          articleId: 101,
          analysisVersion: 'v1',
          status: 'completed',
          currentStage: 'completed',
          stageResults: {},
          result: finalAnalysis,
          errorMessage: null,
          startedAt: '2026-07-14T12:00:00.000Z',
          completedAt: '2026-07-14T12:00:01.000Z',
          createdAt: '2026-07-14T12:00:00.000Z',
          updatedAt: '2026-07-14T12:00:01.000Z',
        },
      },
    ]);
  }

  return jsonResponse({ error: `Unhandled request: ${method} ${url}` }, 500);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(
              `event: ${(event as { eventType: string }).eventType}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        }

        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
      },
    },
  );
}
