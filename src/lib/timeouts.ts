export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export const withTimeout = <T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new TimeoutError(message));
      }
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
};

export const withRetryableTimeout = async <T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs: number,
  message: string,
  maxAttempts = 2
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    try {
      return await withTimeout(
        operation(controller.signal),
        timeoutMs,
        message,
        () => controller.abort()
      );
    } catch (error) {
      lastError = error;
      if (!(error instanceof TimeoutError) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw lastError;
};

export const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error && error.message ? error.message : fallback;
};
