import { connectDB } from './db';
import { ErrorLog } from './models';

// Logs to the terminal and saves to the `errorlogs` collection for debugging later.
// Logging must never crash the app, so database problems are only printed.
export async function logError(source: string, error: unknown, details?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${new Date().toISOString()}] [${source}] ${message}`, details ?? '');

  try {
    await connectDB();
    await ErrorLog.create({ source, message, details: { errorName: error instanceof Error ? error.name : typeof error, ...details } });
  } catch {
    // Database is down - the console line above is all we can do
  }
}

// Thrown by tools with a message that is already safe to show to users
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

// Turns any error into a short message that is safe to show to users
export function friendlyError(error: unknown): string {
  // The AI SDK sometimes passes tool errors as plain text
  if (typeof error === 'string') {
    return error.startsWith('Invalid input for tool')
      ? 'The AI built an invalid query and will try again.'
      : 'Something went wrong. Please try again.';
  }
  if (error instanceof Error) {
    switch (error.name) {
      case 'ToolError':
      case 'ApiError': // our tools write these messages for users
        return error.message;
      case 'DatabaseError':
        return 'The database is not available right now. Please check that MongoDB is running.';
      case 'CircuitOpenError':
      case 'RateLimitError':
        return error.message;
      case 'QueryValidationError':
        return `I could not run that query: ${error.message}`;
      case 'AI_InvalidToolInputError':
        return 'The AI built an invalid query and will try again.';
      case 'ZodError':
        return 'The request had invalid input.';
    }
  }
  return 'Something went wrong. Please try again.';
}
