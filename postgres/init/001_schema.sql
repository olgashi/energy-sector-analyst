CREATE TABLE IF NOT EXISTS source (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES source (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT article_source_url_unique UNIQUE (source_id, url)
);

CREATE INDEX IF NOT EXISTS article_published_at_idx
  ON article (published_at DESC);

CREATE INDEX IF NOT EXISTS article_source_published_at_idx
  ON article (source_id, published_at DESC);

CREATE TABLE IF NOT EXISTS article_analysis (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES article (id) ON DELETE CASCADE,
  analysis_version TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT,
  stage_results_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT article_analysis_article_version_unique UNIQUE (article_id, analysis_version),
  CONSTRAINT article_analysis_status_check CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS article_analysis_article_version_idx
  ON article_analysis (article_id, analysis_version);

CREATE INDEX IF NOT EXISTS article_analysis_status_idx
  ON article_analysis (status);
