import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrCreateSource,
  insertArticles,
  listRecentArticlesBySource,
  searchStoredArticles,
} from './articles.js';

test('getOrCreateSource returns the source id', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return { rows: [{ id: 5 }] };
    },
  };

  const sourceId = await getOrCreateSource(
    {
      id: 'utility-dive',
      name: 'Utility Dive',
      type: 'rss',
      url: 'https://www.utilitydive.com/feeds/news/',
    },
    db as never,
  );

  assert.equal(sourceId, 5);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO source/);
});

test('insertArticles skips the query when there are no articles', async () => {
  let queryCount = 0;
  const db = {
    async query() {
      queryCount += 1;
      return { rows: [] };
    },
  };

  await insertArticles(1, [], db as never);

  assert.equal(queryCount, 0);
});

test('insertArticles inserts normalized article rows', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };

  await insertArticles(
    7,
    [
      {
        title: 'Fresh article',
        link: 'https://example.com/fresh',
        publishedAt: '2026-07-14T10:00:00.000Z',
        body: 'body',
      },
    ],
    db as never,
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ON CONFLICT \(source_id, url\) DO NOTHING/);
  assert.deepEqual(calls[0].params, [
    7,
    'https://example.com/fresh',
    'Fresh article',
    '2026-07-14T10:00:00.000Z',
    'body',
  ]);
});

test('listRecentArticlesBySource maps database rows to API rows', async () => {
  const db = {
    async query() {
      return {
        rows: [
          {
            id: 10,
            url: 'https://example.com/fresh',
            title: 'Fresh article',
            published_at: new Date('2026-07-14T10:00:00.000Z'),
            content: 'body',
          },
        ],
      };
    },
  };

  const articles = await listRecentArticlesBySource(7, 72, db as never);

  assert.deepEqual(articles, [
    {
      id: 10,
      url: 'https://example.com/fresh',
      title: 'Fresh article',
      publishedAt: '2026-07-14T10:00:00.000Z',
      body: 'body',
    },
  ]);
});

test('searchStoredArticles excludes the selected article and maps results', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return {
        rows: [
          {
            id: 12,
            url: 'https://example.com/related',
            title: 'Related article',
            published_at: new Date('2026-07-14T11:00:00.000Z'),
            content: 'related body',
            source: 'Utility Dive',
          },
        ],
      };
    },
  };

  const articles = await searchStoredArticles('solar interconnection', 10, 3, db as never);

  assert.match(calls[0].sql, /article\.id <> \$2/);
  assert.deepEqual(calls[0].params, ['solar interconnection', 10, 3]);
  assert.deepEqual(articles, [
    {
      articleId: 12,
      title: 'Related article',
      publishedAt: '2026-07-14T11:00:00.000Z',
      url: 'https://example.com/related',
      source: 'Utility Dive',
      content: 'related body',
    },
  ]);
});

test('searchStoredArticles returns empty results for an empty query', async () => {
  let queryCount = 0;
  const db = {
    async query() {
      queryCount += 1;
      return { rows: [] };
    },
  };

  const articles = await searchStoredArticles(' ', 10, 3, db as never);

  assert.deepEqual(articles, []);
  assert.equal(queryCount, 0);
});
