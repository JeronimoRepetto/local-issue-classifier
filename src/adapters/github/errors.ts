// Typed errors of the GitHub adapter (SPEC §5.6). Messages carry the status only:
// never a token, a request header or a response body.

/** Any GitHub response the HTTP core could not turn into a success. */
export class GitHubHttpError extends Error {
  readonly status: number

  constructor(status: number, message = `GitHub request failed with status ${status}`) {
    super(message)
    this.name = 'GitHubHttpError'
    this.status = status
  }
}

/** 401: the token is invalid or expired. The caller has already been told to clear it. */
export class AuthError extends GitHubHttpError {
  constructor() {
    super(401, 'Token invalid or expired')
    this.name = 'AuthError'
  }
}

/** 404: the resource does not exist or the token cannot see it. */
export class NotFoundError extends GitHubHttpError {
  constructor() {
    super(404, 'Not found')
    this.name = 'NotFoundError'
  }
}

/** The rate limit is exhausted. `resetAt` is epoch milliseconds; the UI offers Resume after it. */
export class RateLimitedError extends GitHubHttpError {
  readonly resetAt: number

  constructor(status: number, resetAt: number) {
    super(status, `GitHub rate limit reached; resets at ${new Date(resetAt).toISOString()}`)
    this.name = 'RateLimitedError'
    this.resetAt = resetAt
  }
}
