import express from 'express'
import { logger } from './middleware/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import questsRouter from './routes/quests.js'

const app = express()

app.use(express.json())
app.use(logger)

app.get('/', (_req, res) => {
  res.json({
    name: 'Quest Board API',
    endpoints: [
      'GET /api/health',
      'GET /quests',
      'GET /quests/:id',
      'POST /quests',
      'PUT /quests/:id',
      'PATCH /quests/:id',
      'DELETE /quests/:id',
    ],
  })
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/quests', questsRouter)

// These two must come last.
app.use(notFoundHandler)
app.use(errorHandler)

// Vercel runs the exported app as a serverless function; locally we listen on a port.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000
  app.listen(port, () => console.log(`Quest Board API listening on http://localhost:${port}`))
}

export default app
