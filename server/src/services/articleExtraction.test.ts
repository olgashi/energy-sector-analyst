import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArticleTextFromUrl } from './articleExtraction.js';

test('extractArticleTextFromUrl extracts readable page text', async (context) => {
  const originalFetch = globalThis.fetch;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response(
      `
        <html>
          <head><title>Grid upgrade plan</title></head>
          <body>
            <article>
              <h1>Grid upgrade plan</h1>
              <p>The utility filed a plan to upgrade substations.</p>
              <p>The filing says the work is intended to improve reliability.</p>
            </article>
          </body>
        </html>
      `,
      {
        status: 200,
        headers: { 'content-type': 'text/html' },
      },
    );

  const result = await extractArticleTextFromUrl('https://example.com/article');

  assert.equal(result.status, 'extracted');
  assert.match(result.text, /utility filed a plan/);
  assert.match(result.text, /improve reliability/);
});

test('extractArticleTextFromUrl returns failed status for HTTP errors', async (context) => {
  const originalFetch = globalThis.fetch;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response('', { status: 403 });

  const result = await extractArticleTextFromUrl('https://example.com/article');

  assert.equal(result.status, 'failed');
  assert.equal(result.text, '');
  assert.equal(result.error, 'HTTP 403');
});
