export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UserSafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserSafeError';
  }
}

export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof NotFoundError || error instanceof UserSafeError) {
    return error.message;
  }

  if (error instanceof Error && error.name === 'ValidationError') {
    return error.message;
  }

  return 'Analysis failed. Please try again.';
}
