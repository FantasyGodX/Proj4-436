import type { NextFunction, Request, Response } from 'express'

// Logs one line per request once the response has finished:
// METHOD /path STATUS 12ms
export function logger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`)
  })
  next()
}
