export const ERR = {
  VALIDATION: 'VALIDATION',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  STORAGE: 'STORAGE',
};

export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function errorMessage(e) {
  if (e instanceof AppError) return e.message;
  console.error(e);
  return 'Something went wrong. Please try again.';
}
