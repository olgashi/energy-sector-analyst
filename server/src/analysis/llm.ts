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

    return JSON.parse(response.output_text);
  };
}
