const stringArray = {
  type: 'array',
  items: { type: 'string' },
  additionalProperties: false,
};

const confidence = {
  type: 'string',
  enum: ['high', 'medium', 'low'],
};

const sourceType = {
  type: 'string',
  enum: [
    'article',
    'related_article',
    'model_background',
    'agent_interpretation',
  ],
};

const technicalConcept = {
  type: 'object',
  additionalProperties: false,
  required: ['term', 'explanation', 'relevance'],
  properties: {
    term: { type: 'string' },
    explanation: { type: 'string' },
    relevance: { type: 'string' },
  },
};

const stakeholderImpact = {
  type: 'object',
  additionalProperties: false,
  required: ['stakeholder', 'impact', 'reasoning', 'confidence'],
  properties: {
    stakeholder: { type: 'string' },
    impact: { type: 'string' },
    reasoning: { type: 'string' },
    confidence,
  },
};

export const researcherSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'centralEvent',
    'keyEntities',
    'keyTerms',
    'backgroundQuestions',
    'relatedArticleIds',
    'contextLimitations',
  ],
  properties: {
    centralEvent: { type: 'string' },
    keyEntities: stringArray,
    keyTerms: stringArray,
    backgroundQuestions: stringArray,
    relatedArticleIds: {
      type: 'array',
      items: { type: 'number' },
    },
    contextLimitations: stringArray,
  },
};

export const technicalExplainerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['technicalConcepts'],
  properties: {
    technicalConcepts: {
      type: 'array',
      items: technicalConcept,
    },
  },
};

export const impactAnalystSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['causalContext', 'stakeholderImpacts', 'uncertainties'],
  properties: {
    causalContext: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['explanation', 'confidence'],
        properties: {
          explanation: { type: 'string' },
          confidence,
        },
      },
    },
    stakeholderImpacts: {
      type: 'array',
      items: stakeholderImpact,
    },
    uncertainties: stringArray,
  },
};

export const finalAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'articleId',
    'analysisVersion',
    'overview',
    'whatHappened',
    'background',
    'technicalConcepts',
    'stakeholderImpacts',
    'uncertainties',
    'relatedArticles',
    'contextLimitations',
    'generatedAt',
  ],
  properties: {
    articleId: { type: 'number' },
    analysisVersion: { type: 'string' },
    overview: { type: 'string' },
    whatHappened: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement', 'sourceType'],
        properties: {
          statement: { type: 'string' },
          sourceType,
        },
      },
    },
    background: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement', 'sourceType'],
        properties: {
          statement: { type: 'string' },
          sourceType,
        },
      },
    },
    technicalConcepts: {
      type: 'array',
      items: technicalConcept,
    },
    stakeholderImpacts: {
      type: 'array',
      items: stakeholderImpact,
    },
    uncertainties: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['issue', 'explanation'],
        properties: {
          issue: { type: 'string' },
          explanation: { type: 'string' },
        },
      },
    },
    relatedArticles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['articleId', 'title', 'url', 'publishedAt'],
        properties: {
          articleId: { type: 'number' },
          title: { type: 'string' },
          url: { type: 'string' },
          publishedAt: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
      },
    },
    contextLimitations: stringArray,
    generatedAt: { type: 'string' },
  },
};
