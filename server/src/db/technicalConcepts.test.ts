import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findTechnicalConcepts,
  normalizeTerm,
  upsertTechnicalConcepts,
} from './technicalConcepts.js';

test('normalizeTerm lowercases and collapses whitespace', () => {
  assert.equal(normalizeTerm('  Virtual   Power Plant  '), 'virtual power plant');
});

test('findTechnicalConcepts skips empty terms', async () => {
  let queryCount = 0;
  const db = {
    async query() {
      queryCount += 1;
      return { rows: [] };
    },
  };

  const concepts = await findTechnicalConcepts([' ', ''], db as never);

  assert.deepEqual(concepts, []);
  assert.equal(queryCount, 0);
});

test('findTechnicalConcepts maps cached rows', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return {
        rows: [
          {
            normalized_term: 'virtual power plant',
            display_term: 'Virtual power plant',
            explanation: 'An aggregation of distributed resources.',
          },
        ],
      };
    },
  };

  const concepts = await findTechnicalConcepts(
    ['Virtual Power Plant', 'virtual  power plant'],
    db as never,
  );

  assert.deepEqual(calls[0].params, [['virtual power plant']]);
  assert.deepEqual(concepts, [
    {
      normalizedTerm: 'virtual power plant',
      displayTerm: 'Virtual power plant',
      explanation: 'An aggregation of distributed resources.',
    },
  ]);
});

test('upsertTechnicalConcepts deduplicates and stores definitions', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };

  await upsertTechnicalConcepts(
    [
      {
        term: 'Virtual Power Plant',
        explanation: 'An aggregation of distributed resources.',
      },
      {
        term: ' virtual power  plant ',
        explanation: 'Duplicate.',
      },
    ],
    db as never,
  );

  assert.match(calls[0].sql, /ON CONFLICT \(normalized_term\)/);
  assert.deepEqual(calls[0].params, [
    'virtual power plant',
    'Virtual Power Plant',
    'An aggregation of distributed resources.',
  ]);
});
