import { trackException } from './firebase';

function toError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === 'string') return new Error(reason);
  try {
    return new Error(JSON.stringify(reason));
  } catch {
    return new Error('Unknown asynchronous error');
  }
}

export function reportError(source: string, reason: unknown, fatal = false): Error {
  const error = toError(reason);
  console.error(`[${source}]`, error);
  trackException(error, fatal);
  return error;
}

export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    reportError('Unhandled browser error', event.error || event.message, true);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportError('Unhandled promise rejection', event.reason, true);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
