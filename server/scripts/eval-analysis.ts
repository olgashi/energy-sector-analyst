import { readFile } from 'node:fs/promises';
import { validateFinalAnalysis } from '../src/analysis/validation.js';
import type { FinalAnalysis, SourceType } from '../src/analysis/types.js';

type AnalysisEvalFixture = {
  name: string;
  allowedRelatedArticleIds: number[];
  analysis: unknown;
};

type EvalResult = {
  name: string;
  failures: string[];
};

const allowedSourceTypes = new Set<SourceType>([
  'article',
  'related_article',
  'model_background',
  'agent_interpretation',
]);

async function main(): Promise<void> {
  const fixtureUrl = new URL('../evals/analysis-fixtures.json', import.meta.url);
  const fixtures = JSON.parse(
    await readFile(fixtureUrl, 'utf8'),
  ) as AnalysisEvalFixture[];
  const results = fixtures.map(evaluateFixture);
  const failed = results.filter((result) => result.failures.length > 0);

  for (const result of results) {
    if (result.failures.length === 0) {
      console.info(`PASS ${result.name}`);
      continue;
    }

    console.error(`FAIL ${result.name}`);
    for (const failure of result.failures) {
      console.error(`  - ${failure}`);
    }
  }

  console.info(
    `Analysis eval complete: ${results.length - failed.length}/${results.length} passed`,
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function evaluateFixture(fixture: AnalysisEvalFixture): EvalResult {
  const failures: string[] = [];
  let analysis: FinalAnalysis;

  try {
    analysis = validateFinalAnalysis(fixture.analysis);
  } catch (error) {
    return {
      name: fixture.name,
      failures: [
        error instanceof Error ? error.message : 'Analysis schema validation failed',
      ],
    };
  }

  if (analysis.contextLimitations.length === 0) {
    failures.push('expected at least one context limitation');
  }

  for (const item of [...analysis.whatHappened, ...analysis.background]) {
    if (!allowedSourceTypes.has(item.sourceType)) {
      failures.push(`invalid sourceType: ${item.sourceType}`);
    }
  }

  for (const relatedArticle of analysis.relatedArticles) {
    if (!fixture.allowedRelatedArticleIds.includes(relatedArticle.articleId)) {
      failures.push(
        `related article ${relatedArticle.articleId} is not in the allowed retrieval set`,
      );
    }
  }

  for (const impact of analysis.stakeholderImpacts) {
    if (!impact.confidence) {
      failures.push(`missing confidence for stakeholder: ${impact.stakeholder}`);
    }
  }

  if (!analysis.aiMetadata) {
    failures.push('missing AI metadata');
  } else {
    if (analysis.aiMetadata.generations.length === 0) {
      failures.push('expected at least one AI generation metadata entry');
    }

    for (const generation of analysis.aiMetadata.generations) {
      if (!generation.promptHash || generation.promptLength <= 0) {
        failures.push(
          `invalid generation metadata for schema: ${generation.schemaName}`,
        );
      }
    }
  }

  return {
    name: fixture.name,
    failures: [...new Set(failures)],
  };
}

void main();
