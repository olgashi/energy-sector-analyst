import type { Resource } from '../resources/config.js';
import {
  getOrCreateSource,
  insertArticles,
  listRecentArticlesBySource,
  type StoredArticle,
} from '../db/articles.js';
import { fetchRssDocument } from './rss.js';

export type PersistedFeedDocument = {
  resourceId: string;
  resourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  articles: StoredArticle[];
};

export async function fetchAndPersistRssDocument(
  resource: Resource,
): Promise<PersistedFeedDocument> {
  const document = await fetchRssDocument(resource);
  const sourceId = await getOrCreateSource(resource);

  await insertArticles(sourceId, document.articles);

  const articles = await listRecentArticlesBySource(sourceId);

  return {
    resourceId: document.resourceId,
    resourceName: document.resourceName,
    sourceUrl: document.sourceUrl,
    fetchedAt: document.fetchedAt,
    articles,
  };
}
