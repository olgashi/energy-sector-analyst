import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBodyText,
  filterRecentArticles,
  normalizeArticle,
  parseRssFeed,
} from './rss.js';

test('extractBodyText strips html and preserves full text', () => {
  const body = extractBodyText(`<p>${'A'.repeat(340)}</p>`);

  assert.equal(body.length, 340);
  assert.equal(body.includes('<p>'), false);
});

test('normalizeArticle returns null when required fields are missing', () => {
  assert.equal(normalizeArticle({ title: 'Missing link' }), null);
});

test('filterRecentArticles keeps only items from the last 72 hours', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const articles = filterRecentArticles(
    [
      {
        title: 'Recent',
        link: 'https://example.com/recent',
        publishedAt: '2026-07-13T12:00:00.000Z',
        body: 'recent',
      },
      {
        title: 'Old',
        link: 'https://example.com/old',
        publishedAt: '2026-07-10T11:59:59.000Z',
        body: 'old',
      },
    ],
    now,
  );

  assert.deepEqual(
    articles.map((article) => article.title),
    ['Recent'],
  );
});

test('parseRssFeed parses a basic RSS document', async () => {
  const feed = await parseRssFeed(
    `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Example Feed</title>
        <item>
          <title>Article One</title>
          <link>https://example.com/article-one</link>
          <pubDate>Mon, 13 Jul 2026 10:00:00 GMT</pubDate>
          <description><![CDATA[<p>Example description</p>]]></description>
        </item>
      </channel>
    </rss>`,
    'https://example.com/feed.xml',
  );

  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0]?.title, 'Article One');
});
