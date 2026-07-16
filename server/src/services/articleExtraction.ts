import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export type ExtractedArticleText = {
  text: string;
  status: 'extracted' | 'failed';
  error?: string;
};

const DEFAULT_EXTRACTION_TIMEOUT_MS = 12000;

export async function extractArticleTextFromUrl(
  url: string,
): Promise<ExtractedArticleText> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    Number(process.env.ARTICLE_EXTRACTION_TIMEOUT_MS) ||
      DEFAULT_EXTRACTION_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          process.env.ARTICLE_FETCH_USER_AGENT ??
          'EnergySectorAnalyst/0.1 article analysis',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        text: '',
        status: 'failed',
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const parsed = new Readability(
      dom.window.document.cloneNode(true) as Document,
    ).parse();

    return {
      text: cleanText(parsed?.textContent ?? ''),
      status: 'extracted',
    };
  } catch (error) {
    return {
      text: '',
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
