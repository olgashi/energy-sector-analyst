import OpenAI from 'openai';
import { UserSafeError } from './errors.js';

export const defaultOpenAiModel = 'gpt-5-mini';

export type GenerateJsonInput = {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
};

export type GenerateJson = (input: GenerateJsonInput) => Promise<unknown>;

export function getConfiguredOpenAiModel(): string {
  return process.env.OPENAI_MODEL || defaultOpenAiModel;
}

export function createOpenAiJsonGenerator(): GenerateJson {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return async () => {
      throw new UserSafeError(
        'OpenAI API key is not configured. Set OPENAI_API_KEY and restart the backend.',
      );
    };
  }

  const client = new OpenAI({ apiKey });
  const model = getConfiguredOpenAiModel();

  return async ({ system, prompt, schemaName, schema }) => {
    console.info('OpenAI JSON generation started', {
      model,
      schemaName,
      promptLength: prompt.length,
    });

    try {
      const response = await client.responses.create({
        model,
        input: [
          {
            role: 'system',
            content: system,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: schemaName,
            schema,
            strict: true,
          },
        },
      });
      console.info('OpenAI JSON generation completed', {
        model,
        schemaName,
        responseId: response.id,
        outputTextLength: response.output_text.length,
      });

      return JSON.parse(response.output_text);
    } catch (error) {
      console.error('OpenAI JSON generation failed', {
        model,
        schemaName,
        error: toDiagnosticError(error),
      });
      throw error;
    }
  };
}

function toDiagnosticError(error: unknown) {
  if (!(error instanceof Error)) {
    return sanitizeDiagnosticText(String(error));
  }

  const details: Record<string, unknown> = {
    name: error.name,
    message: sanitizeDiagnosticText(error.message),
  };
  const record = error as unknown as Record<string, unknown>;

  for (const key of ['status', 'code', 'type', 'param', 'request_id']) {
    if (record[key] !== undefined) {
      details[key] = sanitizeDiagnosticValue(record[key]);
    }
  }

  return details;
}

function sanitizeDiagnosticValue(value: unknown): unknown {
  return typeof value === 'string' ? sanitizeDiagnosticText(value) : value;
}

function sanitizeDiagnosticText(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}
