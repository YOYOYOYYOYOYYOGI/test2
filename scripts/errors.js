/*
 * errors.js - Typed errors so the UI can show precise, actionable messages
 * instead of pretending a generation succeeded.
 */

export class ReelForgeError extends Error {
  constructor(message, { code = 'error', details = '', retryable = false } = {}) {
    super(message);
    this.name = 'ReelForgeError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export class ValidationError extends ReelForgeError {
  constructor(message, details = '') {
    super(message, { code: 'validation', details });
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends ReelForgeError {
  constructor(message, details = '') {
    super(message, { code: 'configuration', details });
    this.name = 'ConfigurationError';
  }
}

export class NetworkError extends ReelForgeError {
  constructor(message, details = '') {
    super(message, { code: 'network', details, retryable: true });
    this.name = 'NetworkError';
  }
}

export class ProviderError extends ReelForgeError {
  constructor(message, { status = 0, details = '', retryable = false } = {}) {
    super(message, { code: 'provider', details, retryable });
    this.name = 'ProviderError';
    this.status = status;
  }
}

export function toReelForgeError(err) {
  if (err instanceof ReelForgeError) return err;
  if (err && err.name === 'AbortError') {
    return new NetworkError('The request timed out. Check your connection and the API status, then try again.');
  }
  return new ReelForgeError(err && err.message ? err.message : 'Unexpected error.');
}
