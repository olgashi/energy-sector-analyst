import test from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import { createHealthHandler } from './health.js';

function createResponseMock() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response as Response & { statusCode: number; body: unknown };
}

test('health handler returns ok when the database is reachable', async () => {
  const res = createResponseMock();
  const handler = createHealthHandler(async () => {});

  await handler({} as never, res, (() => {}) as never);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'ok', database: 'ok' });
});

test('health handler returns 503 when the database is unavailable', async () => {
  const res = createResponseMock();
  const handler = createHealthHandler(async () => {
    throw new Error('database unavailable');
  });

  await handler({} as never, res, (() => {}) as never);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { status: 'error', database: 'unavailable' });
});
