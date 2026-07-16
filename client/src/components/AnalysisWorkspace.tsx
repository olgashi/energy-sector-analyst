import { useEffect, useState } from 'react';
import type {
  AnalysisUiState,
  Article,
  FinalAnalysis,
  TechnicalConcept,
  WorkflowStage,
} from '../types';
import { formatDate } from '../format';

const activityMessages = [
  'Reading the article and identifying the central event...',
  'Separating reported facts from interpretation...',
  'Checking stored articles for useful context...',
  'Mapping technical, market, and regulatory concepts...',
  'Assessing who may be affected...',
  'Verifying uncertainty and confidence levels...',
  'Preparing the final analysis...',
];

export function AnalysisWorkspace({
  article,
  state,
  onAnalyze,
}: {
  article: Article | null
  state: AnalysisUiState | undefined
  onAnalyze: (articleId: number) => void
}) {
  if (!article) {
    return (
      <aside className="analysis-workspace">
        <div className="analysis-empty-state">
          <p className="analysis-empty-title">Select an article</p>
          <p>
            Choose a story from the list to review its saved analysis or generate a
            new one.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="analysis-workspace">
      <div className="analysis-workspace-header">
        <p className="eyebrow">Selected article</p>
        <h2>{article.title}</h2>
        <p className="article-date">
          {article.source ? `${article.source} · ` : ''}
          {formatDate(article.publishedAt)}
        </p>
        <a className="source-link" href={article.url} target="_blank" rel="noreferrer">
          Open original article
        </a>
      </div>

      {state ? (
        <>
          <AnalysisPanel state={state} />
          {state.status === 'failed' ? (
            <button
              className="analyze-button"
              type="button"
              onClick={() => onAnalyze(article.id)}
            >
              Try again
            </button>
          ) : null}
        </>
      ) : (
        <div className="analysis-empty-state">
          <p className="analysis-empty-title">No analysis yet</p>
          <p>
            Generate a structured analysis covering what happened, stakeholder
            impact, uncertainty, and related stored coverage.
          </p>
          <button
            className="analyze-button"
            type="button"
            onClick={() => onAnalyze(article.id)}
          >
            Analyze article
          </button>
        </div>
      )}
    </aside>
  );
}

function AnalysisPanel({ state }: { state: AnalysisUiState }) {
  const currentStageLabel = state.currentStage ? stageLabel(state.currentStage) : 'Pending';
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (state.status !== 'running') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [state.status]);

  const elapsedSeconds =
    state.status === 'running' && state.startedAtMs
      ? Math.max(0, Math.floor((nowMs - state.startedAtMs) / 1000))
      : 0;
  const activityIndex =
    elapsedSeconds === 0
      ? 0
      : Math.floor(elapsedSeconds / 3) % activityMessages.length;

  return (
    <section className="analysis-panel">
      <div className={`analysis-stage-banner ${state.status}`}>
        {state.status === 'running' ? <span className="analysis-spinner" /> : null}
        <div>
          <p className="analysis-stage-kicker">
            {state.status === 'running'
              ? 'Analysis in progress'
              : state.status === 'failed'
                ? 'Analysis failed'
                : 'Analysis complete'}
          </p>
          <p className="analysis-stage-current">{currentStageLabel}</p>
          {state.status === 'running' ? (
            <>
              <p className="analysis-activity">{activityMessages[activityIndex]}</p>
              <p className="analysis-elapsed">
                {elapsedSeconds === 0 ? 'Starting...' : `${elapsedSeconds}s elapsed`}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {state.error ? <p className="status error">{state.error}</p> : null}

      {state.analysis ? <FinalAnalysisView analysis={state.analysis} /> : null}
    </section>
  );
}

function FinalAnalysisView({ analysis }: { analysis: FinalAnalysis }) {
  const [activeConcept, setActiveConcept] = useState<TechnicalConcept | null>(null);
  const conceptMatches = buildConceptMatches(analysis.technicalConcepts);

  return (
    <div className="final-analysis">
      <h2>Analysis</h2>
      <AnalysisList
        title="What happened"
        items={analysis.whatHappened.map((item) => `${item.statement} (${item.sourceType})`)}
        conceptMatches={conceptMatches}
        onExplainConcept={setActiveConcept}
      />
      <AnalysisList
        title="Background"
        items={analysis.background.map((item) => `${item.statement} (${item.sourceType})`)}
        conceptMatches={conceptMatches}
        onExplainConcept={setActiveConcept}
      />
      {activeConcept ? (
        <div className="concept-explanation">
          <button
            className="concept-close"
            type="button"
            onClick={() => setActiveConcept(null)}
            aria-label="Close explanation"
          >
            x
          </button>
          <strong>{activeConcept.term}</strong>
          <p>{activeConcept.explanation}</p>
          <p>{activeConcept.relevance}</p>
        </div>
      ) : null}
      <section>
        <h3>Stakeholder impact</h3>
        {analysis.stakeholderImpacts.map((impact) => (
          <div className="analysis-item" key={`${impact.stakeholder}-${impact.impact}`}>
            <strong>
              {impact.stakeholder} ({impact.confidence})
            </strong>
            <p>
              <HighlightedText
                text={impact.impact}
                conceptMatches={conceptMatches}
                onExplainConcept={setActiveConcept}
              />
            </p>
            <p>
              <HighlightedText
                text={impact.reasoning}
                conceptMatches={conceptMatches}
                onExplainConcept={setActiveConcept}
              />
            </p>
          </div>
        ))}
      </section>
      <AnalysisList
        title="Uncertainty"
        items={analysis.uncertainties.map((item) => `${item.issue}: ${item.explanation}`)}
        conceptMatches={conceptMatches}
        onExplainConcept={setActiveConcept}
      />
      <section>
        <h3>Related articles</h3>
        {analysis.relatedArticles.length > 0 ? (
          <ul>
            {analysis.relatedArticles.map((article) => (
              <li key={article.articleId}>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No related stored articles found.</p>
        )}
      </section>
      <AnalysisList title="Context limitations" items={analysis.contextLimitations} />
    </div>
  );
}

type ConceptMatch = {
  concept: TechnicalConcept
  normalizedTerm: string
}

function buildConceptMatches(concepts: TechnicalConcept[]): ConceptMatch[] {
  const seen = new Set<string>();

  return concepts
    .map((concept) => ({
      concept,
      normalizedTerm: normalizeConceptTerm(concept.term),
    }))
    .filter((entry) => {
      if (entry.normalizedTerm.length < 4 || seen.has(entry.normalizedTerm)) {
        return false;
      }

      seen.add(entry.normalizedTerm);
      return true;
    })
    .sort((left, right) => right.normalizedTerm.length - left.normalizedTerm.length);
}

function normalizeConceptTerm(term: string) {
  return term.trim().toLowerCase().replace(/\s+/g, ' ');
}

function AnalysisList({
  title,
  items,
  conceptMatches,
  onExplainConcept,
}: {
  title: string
  items: string[]
  conceptMatches?: ConceptMatch[]
  onExplainConcept?: (concept: TechnicalConcept) => void
}) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>
              <HighlightedText
                text={item}
                conceptMatches={conceptMatches ?? []}
                onExplainConcept={onExplainConcept ?? (() => {})}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p>None provided.</p>
      )}
    </section>
  );
}

function HighlightedText({
  text,
  conceptMatches,
  onExplainConcept,
}: {
  text: string
  conceptMatches: ConceptMatch[]
  onExplainConcept: (concept: TechnicalConcept) => void
}) {
  if (conceptMatches.length === 0) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const ranges: Array<{ start: number; end: number; concept: TechnicalConcept }> = [];

  for (const match of conceptMatches) {
    let searchFrom = 0;

    while (searchFrom < text.length) {
      const index = lowerText.indexOf(match.normalizedTerm, searchFrom);

      if (index === -1) {
        break;
      }

      const end = index + match.normalizedTerm.length;

      if (isWordBoundary(text, index - 1) && isWordBoundary(text, end)) {
        const overlaps = ranges.some(
          (range) => index < range.end && end > range.start,
        );

        if (!overlaps) {
          ranges.push({ start: index, end, concept: match.concept });
        }
      }

      searchFrom = end;
    }
  }

  if (ranges.length === 0) {
    return <>{text}</>;
  }

  ranges.sort((left, right) => left.start - right.start);

  const parts = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }

    parts.push(
      <button
        className="concept-term"
        type="button"
        key={`${range.start}-${range.end}-${range.concept.term}`}
        onClick={() => onExplainConcept(range.concept)}
        title="Explain this"
      >
        {text.slice(range.start, range.end)}
      </button>,
    );
    cursor = range.end;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}

function stageLabel(stage: WorkflowStage) {
  switch (stage) {
    case 'loading_article':
      return 'Loading article';
    case 'researching':
      return 'Researching article';
    case 'searching_related_articles':
      return 'Searching stored articles';
    case 'technical_analysis':
      return 'Explaining key concepts';
    case 'impact_analysis':
      return 'Assessing stakeholder impact';
    case 'synthesizing':
      return 'Synthesizing final analysis';
    case 'saving':
      return 'Saving result';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
  }
}

function isWordBoundary(text: string, index: number) {
  if (index < 0 || index >= text.length) {
    return true;
  }

  return !/[a-z0-9]/i.test(text[index]);
}
