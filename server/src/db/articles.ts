import type { Pool } from 'pg';
import { getPool } from './pool.js';
import type { Resource } from '../resources/config.js';
import type { FeedArticle } from '../services/rss.js';

export type StoredArticle = {
  id: number;
  url: string;
  title: string;
  publishedAt: string | null;
  body: string;
};

export type ArticleForAnalysis = StoredArticle & {
  source: string;
};

export type RelatedStoredArticle = {
  articleId: number;
  title: string;
  publishedAt: string | null;
  url: string;
  source: string;
  content: string;
};

type SourceRow = {
  id: number;
};

type ArticleRow = {
  id: number;
  url: string;
  title: string;
  published_at: Date | string | null;
  content: string | null;
};

type ArticleWithSourceRow = ArticleRow & {
  source: string;
};

type Queryable = Pick<Pool, 'query'>;

export async function getOrCreateSource(
  resource: Resource,
  db: Queryable = getPool(),
): Promise<number> {
  const result = await db.query<SourceRow>(
    `
      INSERT INTO source (key, name, type, url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key)
      DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        url = EXCLUDED.url
      RETURNING id
    `,
    [resource.id, resource.name, resource.type, resource.url],
  );

  return result.rows[0].id;
}

export async function insertArticles(
  sourceId: number,
  articles: FeedArticle[],
  db: Queryable = getPool(),
): Promise<void> {
  if (articles.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = articles.map((article, index) => {
    const offset = index * 5;
    values.push(
      sourceId,
      article.link,
      article.title,
      article.publishedAt,
      article.body,
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
  });

  await db.query(
    `
      INSERT INTO article (source_id, url, title, published_at, content)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (source_id, url) DO NOTHING
    `,
    values,
  );
}

export async function listRecentArticlesBySource(
  sourceId: number,
  hours: number = 72,
  db: Queryable = getPool(),
): Promise<StoredArticle[]> {
  const result = await db.query<ArticleRow>(
    `
      SELECT id, url, title, published_at, content
      FROM article
      WHERE source_id = $1
        AND published_at >= NOW() - ($2::int * INTERVAL '1 hour')
      ORDER BY published_at DESC
    `,
    [sourceId, hours],
  );

  return result.rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at,
    body: row.content ?? '',
  }));
}

export async function getArticleById(
  articleId: number,
  db: Queryable = getPool(),
): Promise<ArticleForAnalysis | null> {
  const result = await db.query<ArticleWithSourceRow>(
    `
      SELECT
        article.id,
        article.url,
        article.title,
        article.published_at,
        article.content,
        source.name AS source
      FROM article
      INNER JOIN source ON source.id = article.source_id
      WHERE article.id = $1
    `,
    [articleId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at,
    body: row.content ?? '',
    source: row.source,
  };
}

export async function searchStoredArticles(
  query: string,
  excludeArticleId: number,
  limit: number = 5,
  db: Queryable = getPool(),
): Promise<RelatedStoredArticle[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const result = await db.query<ArticleWithSourceRow>(
    `
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', $1) AS query
      )
      SELECT
        article.id,
        article.url,
        article.title,
        article.published_at,
        article.content,
        source.name AS source
      FROM article
      INNER JOIN source ON source.id = article.source_id
      CROSS JOIN search_query
      WHERE article.id <> $2
        AND search_query.query @@ to_tsvector(
          'english',
          article.title || ' ' || COALESCE(article.content, '')
        )
      ORDER BY
        ts_rank_cd(
          to_tsvector('english', article.title || ' ' || COALESCE(article.content, '')),
          search_query.query
        ) DESC,
        article.published_at DESC NULLS LAST
      LIMIT $3
    `,
    [normalizedQuery, excludeArticleId, limit],
  );

  return result.rows.map((row) => ({
    articleId: row.id,
    title: row.title,
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : row.published_at,
    url: row.url,
    source: row.source,
    content: row.content ?? '',
  }));
}
