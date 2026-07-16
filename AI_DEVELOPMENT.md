# AI Development Practices

This project treats the LLM workflow as a product subsystem, not as an opaque prompt call.

## Purpose

This document explains the engineering choices that make the AI portions of the project easier to inspect, test, and maintain. It is intended for reviewers, future maintainers, and AI coding assistants that need a quick map of the workflow boundaries.

The project uses conventional software engineering practices first: clear TypeScript types, explicit API boundaries, focused tests, readable modules, and human review. AI tools can help with implementation, refactoring, and review, but generated suggestions should be treated as drafts that still need to be read, tested, and adjusted by a developer.

## Agent Design

The analysis pipeline is split into narrow stages:

- Researcher: identifies the central event, entities, key terms, background questions, and context limitations.
- Related article search: retrieves only from articles already stored by the app.
- Technical explainer: explains stable domain concepts and reuses cached concept definitions.
- Impact analyst: separates stakeholder impact from article facts and assigns confidence.
- Synthesizer: combines prior structured outputs, preserves uncertainty, and produces the UI-ready result.

This structure keeps each prompt easier to test and review. It also gives the UI meaningful progress events instead of a single long-running loading state.

## Prompt And Model Traceability

Every model call returns structured JSON and records metadata with the saved analysis result:

- model name
- schema name
- OpenAI response ID
- prompt hash
- prompt length
- generation timestamp
- workflow prompt version hash

The prompt hash is intentionally stored instead of the full prompt so the app can support reproducibility/debugging without persisting extracted article text.

## Validation And Boundaries

Agent outputs are validated before downstream stages consume them. The final result labels claims by source type:

- `article`
- `related_article`
- `model_background`
- `agent_interpretation`

The backend emits progress over SSE, but the article-loading event only exposes metadata such as selected content length. Full extracted publisher text is used for analysis context and is not stored or streamed back to the client.

## Caching And Cost Control

Completed article analyses are reused instead of rerunning the workflow. Stable technical concept explanations are cached separately so repeated terms do not need to be re-explained from scratch.

## Lightweight Evaluation

`npm run eval:analysis` in the `server` package runs deterministic fixture checks. The harness verifies that sample final analyses:

- include context limitations
- use allowed source types
- only cite related articles from the retrieval set
- include confidence for stakeholder impacts
- include AI metadata

This is not a replacement for expert review. It is a low-cost guardrail that demonstrates how AI outputs can be checked for contract and safety properties.
