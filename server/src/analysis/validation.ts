import type {
  AiAnalysisMetadata,
  AiGenerationMetadata,
  Confidence,
  FinalAnalysis,
  ImpactAnalystOutput,
  ResearcherOutput,
  SourceType,
  TechnicalExplainerOutput,
} from './types.js';

const confidenceValues = new Set<Confidence>(['high', 'medium', 'low']);
const sourceTypeValues = new Set<SourceType>([
  'article',
  'related_article',
  'model_background',
  'agent_interpretation',
]);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateResearcherOutput(value: unknown): ResearcherOutput {
  const record = requireRecord(value, 'researcher output');

  return {
    centralEvent: requireString(record.centralEvent, 'centralEvent'),
    keyEntities: requireStringArray(record.keyEntities, 'keyEntities'),
    keyTerms: requireStringArray(record.keyTerms, 'keyTerms'),
    backgroundQuestions: requireStringArray(
      record.backgroundQuestions,
      'backgroundQuestions',
    ),
    relatedArticleIds: requireNumberArray(
      record.relatedArticleIds,
      'relatedArticleIds',
    ),
    contextLimitations: requireStringArray(
      record.contextLimitations,
      'contextLimitations',
    ),
  };
}

export function validateTechnicalExplainerOutput(
  value: unknown,
): TechnicalExplainerOutput {
  const record = requireRecord(value, 'technical explainer output');
  const concepts = requireArray(record.technicalConcepts, 'technicalConcepts');

  return {
    technicalConcepts: concepts.map((entry, index) => {
      const concept = requireRecord(entry, `technicalConcepts[${index}]`);

      return {
        term: requireString(concept.term, `technicalConcepts[${index}].term`),
        explanation: requireString(
          concept.explanation,
          `technicalConcepts[${index}].explanation`,
        ),
        relevance: requireString(
          concept.relevance,
          `technicalConcepts[${index}].relevance`,
        ),
      };
    }),
  };
}

export function validateImpactAnalystOutput(value: unknown): ImpactAnalystOutput {
  const record = requireRecord(value, 'impact analyst output');
  const causalContext = requireArray(record.causalContext, 'causalContext');
  const stakeholderImpacts = requireArray(
    record.stakeholderImpacts,
    'stakeholderImpacts',
  );

  return {
    causalContext: causalContext.map((entry, index) => {
      const item = requireRecord(entry, `causalContext[${index}]`);

      return {
        explanation: requireString(
          item.explanation,
          `causalContext[${index}].explanation`,
        ),
        confidence: requireConfidence(
          item.confidence,
          `causalContext[${index}].confidence`,
        ),
      };
    }),
    stakeholderImpacts: stakeholderImpacts.map((entry, index) => {
      const item = requireRecord(entry, `stakeholderImpacts[${index}]`);

      return {
        stakeholder: requireString(
          item.stakeholder,
          `stakeholderImpacts[${index}].stakeholder`,
        ),
        impact: requireString(item.impact, `stakeholderImpacts[${index}].impact`),
        reasoning: requireString(
          item.reasoning,
          `stakeholderImpacts[${index}].reasoning`,
        ),
        confidence: requireConfidence(
          item.confidence,
          `stakeholderImpacts[${index}].confidence`,
        ),
      };
    }),
    uncertainties: requireStringArray(record.uncertainties, 'uncertainties'),
  };
}

export function validateFinalAnalysis(value: unknown): FinalAnalysis {
  const record = requireRecord(value, 'final analysis');

  const whatHappened = requireArray(record.whatHappened, 'whatHappened');
  const background = requireArray(record.background, 'background');
  const technicalConcepts = validateTechnicalExplainerOutput({
    technicalConcepts: record.technicalConcepts,
  }).technicalConcepts;
  const stakeholderImpacts = validateImpactAnalystOutput({
    causalContext: [],
    stakeholderImpacts: record.stakeholderImpacts,
    uncertainties: [],
  }).stakeholderImpacts;
  const uncertainties = requireArray(record.uncertainties, 'uncertainties');
  const relatedArticles = requireArray(record.relatedArticles, 'relatedArticles');

  const analysis: FinalAnalysis = {
    articleId: requireNumber(record.articleId, 'articleId'),
    analysisVersion: requireString(record.analysisVersion, 'analysisVersion'),
    overview: requireString(record.overview, 'overview'),
    whatHappened: whatHappened.map((entry, index) => {
      const item = requireRecord(entry, `whatHappened[${index}]`);

      return {
        statement: requireString(
          item.statement,
          `whatHappened[${index}].statement`,
        ),
        sourceType: requireSourceType(
          item.sourceType,
          `whatHappened[${index}].sourceType`,
        ),
      };
    }),
    background: background.map((entry, index) => {
      const item = requireRecord(entry, `background[${index}]`);

      return {
        statement: requireString(item.statement, `background[${index}].statement`),
        sourceType: requireSourceType(
          item.sourceType,
          `background[${index}].sourceType`,
        ),
      };
    }),
    technicalConcepts,
    stakeholderImpacts,
    uncertainties: uncertainties.map((entry, index) => {
      const item = requireRecord(entry, `uncertainties[${index}]`);

      return {
        issue: requireString(item.issue, `uncertainties[${index}].issue`),
        explanation: requireString(
          item.explanation,
          `uncertainties[${index}].explanation`,
        ),
      };
    }),
    relatedArticles: relatedArticles.map((entry, index) => {
      const item = requireRecord(entry, `relatedArticles[${index}]`);

      return {
        articleId: requireNumber(
          item.articleId,
          `relatedArticles[${index}].articleId`,
        ),
        title: requireString(item.title, `relatedArticles[${index}].title`),
        url: requireString(item.url, `relatedArticles[${index}].url`),
        publishedAt: requireOptionalStringOrNull(
          item.publishedAt,
          `relatedArticles[${index}].publishedAt`,
        ),
      };
    }),
    contextLimitations: requireStringArray(
      record.contextLimitations,
      'contextLimitations',
    ),
    generatedAt: requireString(record.generatedAt, 'generatedAt'),
  };

  if (record.aiMetadata !== undefined) {
    analysis.aiMetadata = validateAiAnalysisMetadata(record.aiMetadata);
  }

  return analysis;
}

export function validateAiAnalysisMetadata(value: unknown): AiAnalysisMetadata {
  const record = requireRecord(value, 'aiMetadata');
  const generations = requireArray(record.generations, 'aiMetadata.generations');

  return {
    promptVersion: requireString(record.promptVersion, 'aiMetadata.promptVersion'),
    promptVersionHash: requireString(
      record.promptVersionHash,
      'aiMetadata.promptVersionHash',
    ),
    generations: generations.map((entry, index) =>
      validateAiGenerationMetadata(
        entry,
        `aiMetadata.generations[${index}]`,
      ),
    ),
  };
}

function validateAiGenerationMetadata(
  value: unknown,
  fieldName: string,
): AiGenerationMetadata {
  const record = requireRecord(value, fieldName);

  return {
    schemaName: requireString(record.schemaName, `${fieldName}.schemaName`),
    model: requireString(record.model, `${fieldName}.model`),
    responseId: requireOptionalStringOrNull(
      record.responseId,
      `${fieldName}.responseId`,
    ),
    promptHash: requireString(record.promptHash, `${fieldName}.promptHash`),
    promptLength: requireNumber(record.promptLength, `${fieldName}.promptLength`),
    generatedAt: requireString(record.generatedAt, `${fieldName}.generatedAt`),
  };
}

function requireRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array.`);
  }

  return value;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function requireOptionalStringOrNull(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new ValidationError(`${fieldName} must be a string or null.`);
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  return requireArray(value, fieldName).map((entry, index) =>
    requireString(entry, `${fieldName}[${index}]`),
  );
}

function requireNumberArray(value: unknown, fieldName: string): number[] {
  return requireArray(value, fieldName).map((entry, index) =>
    requireNumber(entry, `${fieldName}[${index}]`),
  );
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${fieldName} must be a finite number.`);
  }

  return value;
}

function requireConfidence(value: unknown, fieldName: string): Confidence {
  if (typeof value !== 'string' || !confidenceValues.has(value as Confidence)) {
    throw new ValidationError(`${fieldName} must be high, medium, or low.`);
  }

  return value as Confidence;
}

function requireSourceType(value: unknown, fieldName: string): SourceType {
  if (typeof value !== 'string' || !sourceTypeValues.has(value as SourceType)) {
    throw new ValidationError(`${fieldName} has an invalid source type.`);
  }

  return value as SourceType;
}
