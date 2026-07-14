import type { Pool } from 'pg';
import { getPool } from './pool.js';

export const ANALYSIS_VERSION = 'v1';

export type AnalysisStatus = 'running' | 'completed' | 'failed';

export type AnalysisRecord = {
  id: number;
  articleId: number;
  analysisVersion: string;
  status: AnalysisStatus;
  currentStage: string | null;
  stageResults: Record<string, unknown>;
  result: unknown | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AnalysisRow = {
  id: number;
  article_id: number;
  analysis_version: string;
  status: AnalysisStatus;
  current_stage: string | null;
  stage_results_json: Record<string, unknown> | null;
  result_json: unknown | null;
  error_message: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type Queryable = Pick<Pool, 'query'>;

export async function findAnalysisByArticle(
  articleId: number,
  analysisVersion: string = ANALYSIS_VERSION,
  db: Queryable = getPool(),
): Promise<AnalysisRecord | null> {
  const result = await db.query<AnalysisRow>(
    `
      SELECT
        id,
        article_id,
        analysis_version,
        status,
        current_stage,
        stage_results_json,
        result_json,
        error_message,
        started_at,
        completed_at,
        created_at,
        updated_at
      FROM article_analysis
      WHERE article_id = $1
        AND analysis_version = $2
    `,
    [articleId, analysisVersion],
  );

  return result.rows[0] ? mapAnalysisRow(result.rows[0]) : null;
}

export async function startAnalysis(
  articleId: number,
  analysisVersion: string = ANALYSIS_VERSION,
  db: Queryable = getPool(),
): Promise<AnalysisRecord> {
  const result = await db.query<AnalysisRow>(
    `
      INSERT INTO article_analysis (
        article_id,
        analysis_version,
        status,
        current_stage,
        stage_results_json,
        result_json,
        error_message,
        started_at,
        completed_at
      )
      VALUES ($1, $2, 'running', 'loading_article', '{}'::jsonb, NULL, NULL, NOW(), NULL)
      ON CONFLICT (article_id, analysis_version)
      DO UPDATE SET
        status = 'running',
        current_stage = 'loading_article',
        stage_results_json = '{}'::jsonb,
        result_json = NULL,
        error_message = NULL,
        started_at = NOW(),
        completed_at = NULL,
        updated_at = NOW()
      RETURNING
        id,
        article_id,
        analysis_version,
        status,
        current_stage,
        stage_results_json,
        result_json,
        error_message,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [articleId, analysisVersion],
  );

  return mapAnalysisRow(result.rows[0]);
}

export async function updateAnalysisStage(
  analysisId: number,
  currentStage: string,
  db: Queryable = getPool(),
): Promise<void> {
  await db.query(
    `
      UPDATE article_analysis
      SET
        current_stage = $2,
        updated_at = NOW()
      WHERE id = $1
    `,
    [analysisId, currentStage],
  );
}

export async function updateAnalysisStageResult(
  analysisId: number,
  currentStage: string,
  stageKey: string,
  result: unknown,
  db: Queryable = getPool(),
): Promise<void> {
  await db.query(
    `
      UPDATE article_analysis
      SET
        current_stage = $2,
        stage_results_json = jsonb_set(
          stage_results_json,
          ARRAY[$3],
          $4::jsonb,
          true
        ),
        updated_at = NOW()
      WHERE id = $1
    `,
    [analysisId, currentStage, stageKey, JSON.stringify(result)],
  );
}

export async function completeAnalysis(
  analysisId: number,
  resultJson: unknown,
  db: Queryable = getPool(),
): Promise<AnalysisRecord> {
  const result = await db.query<AnalysisRow>(
    `
      UPDATE article_analysis
      SET
        status = 'completed',
        current_stage = 'completed',
        result_json = $2::jsonb,
        error_message = NULL,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        article_id,
        analysis_version,
        status,
        current_stage,
        stage_results_json,
        result_json,
        error_message,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [analysisId, JSON.stringify(resultJson)],
  );

  return mapAnalysisRow(result.rows[0]);
}

export async function failAnalysis(
  analysisId: number,
  currentStage: string,
  errorMessage: string,
  db: Queryable = getPool(),
): Promise<AnalysisRecord> {
  const result = await db.query<AnalysisRow>(
    `
      UPDATE article_analysis
      SET
        status = 'failed',
        current_stage = $2,
        error_message = $3,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        article_id,
        analysis_version,
        status,
        current_stage,
        stage_results_json,
        result_json,
        error_message,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [analysisId, currentStage, errorMessage],
  );

  return mapAnalysisRow(result.rows[0]);
}

function mapAnalysisRow(row: AnalysisRow): AnalysisRecord {
  return {
    id: row.id,
    articleId: row.article_id,
    analysisVersion: row.analysis_version,
    status: row.status,
    currentStage: row.current_stage,
    stageResults: row.stage_results_json ?? {},
    result: row.result_json,
    errorMessage: row.error_message,
    startedAt: toIsoString(row.started_at),
    completedAt: toIsoString(row.completed_at),
    createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}
