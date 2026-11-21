import type { NextFunction, Request, Response } from 'express'
import { HttpError, notFound } from '../lib/errors.js'

// Runs when no route matched.
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(notFound(`Route not found: ${req.method} ${req.originalUrl}`))
}

// Express recognizes an error handler by its four arguments.
// Every error in the app ends up here and leaves as JSON, never as an HTML stack trace.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // express.json() throws this when the body is not valid JSON.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON in request body' })
    return
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }

  // Anything unexpected: log the details, but do not leak them to the client.
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
