import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import {
  createGetResourceArticles,
  listConfiguredResources,
} from './resources.js';

function createResponseMock() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response as Response & { statusCode: number; body: unknown };
}

test('listConfiguredResources returns available RSS sources', () => {
  const req = {} as Request;
  const res = createResponseMock();

  listConfiguredResources(req, res, () => undefined);

  const resources = res.body as Array<{ id: string; name: string }>;

  assert.equal(res.statusCode, 200);
  assert.ok(resources.some((resource) => resource.id === 'utility-dive'));
  assert.ok(resources.some((resource) => resource.id === 'canary-media'));
  assert.ok(
    resources.some((resource) => resource.id === 'energy-storage-news'),
  );
  assert.ok(resources.some((resource) => resource.id === 'cleantechnica'));
  assert.ok(resources.some((resource) => resource.id === 'power-technology'));
});

test('getResourceArticles returns a parsed RSS document', async () => {
  const req = {
    params: { resourceId: 'utility-dive' },
  } as unknown as Request;
  const res = createResponseMock();
  const nextCalls: unknown[] = [];
  const next: NextFunction = (error?: unknown) => {
    nextCalls.push(error);
  };
  const getResourceArticles = createGetResourceArticles(async (resource) => ({
    resourceId: resource.id,
    resourceName: resource.name,
    sourceUrl: resource.url,
    fetchedAt: '2026-07-14T10:30:00.000Z',
    articles: [
      {
        id: 12,
        title: 'Fresh article',
        url: 'https://example.com/fresh',
        publishedAt: new Date().toISOString(),
        body: 'Article body for preview testing.',
      },
    ],
  }));

  await getResourceArticles(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { resourceId: string }).resourceId, 'utility-dive');
  assert.equal(
    (res.body as { articles: Array<{ title: string }> }).articles.length,
    1,
  );
  assert.equal(
    (res.body as { articles: Array<{ title: string }> }).articles[0]?.title,
    'Fresh article',
  );
  assert.equal(
    (res.body as { articles: Array<{ body: string }> }).articles[0]?.body,
    'Article body for preview testing.',
  );
  assert.deepEqual(nextCalls, []);
});

test('getResourceArticles returns 404 for an unknown resource', async () => {
  const req = {
    params: { resourceId: 'missing' },
  } as unknown as Request;
  const res = createResponseMock();
  const nextCalls: unknown[] = [];
  const next: NextFunction = (error?: unknown) => {
    nextCalls.push(error);
  };
  const getResourceArticles = createGetResourceArticles(async () => {
    throw new Error('should not be called');
  });

  await getResourceArticles(req, res, next);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Resource not found' });
  assert.deepEqual(nextCalls, []);
});
