import type { Pool } from 'pg';
import { getPool } from './pool.js';

export type CachedTechnicalConcept = {
  normalizedTerm: string;
  displayTerm: string;
  explanation: string;
};

type TechnicalConceptInput = {
  term: string;
  explanation: string;
};

type TechnicalConceptRow = {
  normalized_term: string;
  display_term: string;
  explanation: string;
};

type Queryable = Pick<Pool, 'query'>;

export async function findTechnicalConcepts(
  terms: string[],
  db: Queryable = getPool(),
): Promise<CachedTechnicalConcept[]> {
  const normalizedTerms = [...new Set(terms.map(normalizeTerm).filter(Boolean))];

  if (normalizedTerms.length === 0) {
    return [];
  }

  const result = await db.query<TechnicalConceptRow>(
    `
      SELECT normalized_term, display_term, explanation
      FROM technical_concept
      WHERE normalized_term = ANY($1::text[])
      ORDER BY display_term ASC
    `,
    [normalizedTerms],
  );

  return result.rows.map(mapTechnicalConceptRow);
}

export async function upsertTechnicalConcepts(
  concepts: TechnicalConceptInput[],
  db: Queryable = getPool(),
): Promise<void> {
  const uniqueConcepts = dedupeConcepts(concepts);

  if (uniqueConcepts.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = uniqueConcepts.map((concept, index) => {
    const offset = index * 3;
    values.push(normalizeTerm(concept.term), concept.term.trim(), concept.explanation.trim());

    return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
  });

  await db.query(
    `
      INSERT INTO technical_concept (normalized_term, display_term, explanation)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (normalized_term)
      DO UPDATE SET
        display_term = EXCLUDED.display_term,
        explanation = EXCLUDED.explanation,
        updated_at = NOW()
    `,
    values,
  );
}

export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeConcepts(
  concepts: TechnicalConceptInput[],
): TechnicalConceptInput[] {
  const seen = new Set<string>();
  const result: TechnicalConceptInput[] = [];

  for (const concept of concepts) {
    const normalizedTerm = normalizeTerm(concept.term);

    if (!normalizedTerm || !concept.explanation.trim() || seen.has(normalizedTerm)) {
      continue;
    }

    seen.add(normalizedTerm);
    result.push(concept);
  }

  return result;
}

function mapTechnicalConceptRow(
  row: TechnicalConceptRow,
): CachedTechnicalConcept {
  return {
    normalizedTerm: row.normalized_term,
    displayTerm: row.display_term,
    explanation: row.explanation,
  };
}
