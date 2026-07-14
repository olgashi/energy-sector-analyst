import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFinalAnalysis,
  validateImpactAnalystOutput,
} from './validation.js';

test('final output matches the required schema', () => {
  const analysis = validateFinalAnalysis({
    articleId: 1,
    analysisVersion: 'v1',
    overview: 'A utility filed a new plan.',
    whatHappened: [
      {
        statement: 'The filing was submitted.',
        sourceType: 'article',
      },
    ],
    background: [
      {
        statement: 'Integrated resource plans describe future supply choices.',
        sourceType: 'model_background',
      },
    ],
    technicalConcepts: [
      {
        term: 'Integrated resource plan',
        explanation: 'A planning document.',
        relevance: 'It frames the article.',
      },
    ],
    stakeholderImpacts: [
      {
        stakeholder: 'Customers',
        impact: 'Rates may be affected.',
        reasoning: 'Capital plans can affect revenue requirements.',
        confidence: 'medium',
      },
    ],
    uncertainties: [
      {
        issue: 'Regulatory outcome',
        explanation: 'The article does not report a final decision.',
      },
    ],
    relatedArticles: [
      {
        articleId: 2,
        title: 'Related article',
        url: 'https://example.com/related',
        publishedAt: null,
      },
    ],
    contextLimitations: ['No related article described the final order.'],
    generatedAt: '2026-07-14T12:00:00.000Z',
  });

  assert.equal(analysis.articleId, 1);
  assert.equal(analysis.stakeholderImpacts[0].confidence, 'medium');
});

test('interpretive claims must include valid confidence', () => {
  assert.throws(
    () =>
      validateImpactAnalystOutput({
        causalContext: [
          {
            explanation: 'Demand growth may have prompted the action.',
            confidence: 'certain',
          },
        ],
        stakeholderImpacts: [],
        uncertainties: [],
      }),
    /confidence/,
  );
});
