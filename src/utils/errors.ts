export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);

/** Re-label a unique-constraint violation (e.g. from a concurrent insert) with a specific error. */
export async function onDuplicate<T>(work: Promise<T>, error: () => AppError): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (err instanceof AppError && err.code === 'DUPLICATE_RESOURCE') throw error();
    throw err;
  }
}
