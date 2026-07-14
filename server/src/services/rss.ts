import Parser from 'rss-parser';
import type { Resource } from '../resources/config.js';

export type FeedArticle = {
  title: string;
  link: string;
  publishedAt: string;
  body: string;
};

export type FeedDocument = {
  resourceId: string;
  resourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  articles: FeedArticle[];
};

type ParserItem = Parser.Item & {
  'content:encoded'?: string;
  contentSnippet?: string;
};

const parser = new Parser<Record<string, never>, ParserItem>();
const RECENT_WINDOW_HOURS = 72;

export async function fetchRssText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status}`);
  }

  return response.text();
}

export async function parseRssFeed(
  xml: string,
  feedUrl: string,
): Promise<Parser.Output<ParserItem>> {
  try {
    return await parser.parseString(xml);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown RSS parsing error';
    throw new Error(`Failed to parse RSS feed ${feedUrl}: ${message}`);
  }
}

export function extractBodyText(rawValue: string | undefined): string {
  if (!rawValue) {
    return '';
  }

  return rawValue
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeArticle(item: ParserItem): FeedArticle | null {
  const title = item.title?.trim();
  const link = item.link?.trim();
  const publishedValue = item.isoDate ?? item.pubDate;

  if (!title || !link || !publishedValue) {
    return null;
  }

  const publishedDate = new Date(publishedValue);

  if (Number.isNaN(publishedDate.valueOf())) {
    return null;
  }

  return {
    title,
    link,
    publishedAt: publishedDate.toISOString(),
    body: extractBodyText(
      item.contentSnippet ??
        item.content ??
        item['content:encoded'] ??
        item.summary,
    ),
  };
}

export function filterRecentArticles(
  articles: FeedArticle[],
  now: Date = new Date(),
): FeedArticle[] {
  const windowStart = now.getTime() - RECENT_WINDOW_HOURS * 60 * 60 * 1000;

  return articles
    .filter((article) => new Date(article.publishedAt).getTime() >= windowStart)
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    );
}

export async function fetchRssDocument(
  resource: Resource,
): Promise<FeedDocument> {
  const xml = await fetchRssText(resource.url);
  const parsedFeed = await parseRssFeed(xml, resource.url);
  const items: ParserItem[] = parsedFeed.items ?? [];
  const articles = filterRecentArticles(
    items
      .map((item) => normalizeArticle(item))
      .filter((item): item is FeedArticle => item !== null),
  );

  return {
    resourceId: resource.id,
    resourceName: resource.name,
    sourceUrl: resource.url,
    fetchedAt: new Date().toISOString(),
    articles,
  };
}
