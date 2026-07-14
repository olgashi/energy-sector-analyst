import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { getResourceArticles } from './resources.js';

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

test('getResourceArticles returns a parsed RSS document', async () => {
  const originalFetch = globalThis.fetch;
  const req = {
    params: { resourceId: 'utility-dive' },
  } as Request;
  const res = createResponseMock();
  const nextCalls: unknown[] = [];
  const next: NextFunction = (error?: unknown) => {
    nextCalls.push(error);
  };

  globalThis.fetch = async () =>
    new Response(
      `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Utility Dive</title>
          <item>
            <title>Fresh article</title>
            <link>https://example.com/fresh</link>
            <pubDate>${new Date().toUTCString()}</pubDate>
            <description><![CDATA[<p>Article body for preview testing.</p>]]></description>
          </item>
          <item>
            <title>Old article</title>
            <link>https://example.com/old</link>
            <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
            <description>Old body</description>
          </item>
        </channel>
      </rss>`,
      {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      },
    );

  try {
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getResourceArticles returns 404 for an unknown resource', async () => {
  const req = {
    params: { resourceId: 'missing' },
  } as Request;
  const res = createResponseMock();
  const nextCalls: unknown[] = [];
  const next: NextFunction = (error?: unknown) => {
    nextCalls.push(error);
  };

  await getResourceArticles(req, res, next);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Resource not found' });
  assert.deepEqual(nextCalls, []);
});
