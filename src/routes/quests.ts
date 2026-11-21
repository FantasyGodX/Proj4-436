import { Router, type NextFunction, type Request, type Response } from 'express'
import { getDb } from '../lib/supabase.js'
import { badRequest, HttpError, notFound } from '../lib/errors.js'
import {
  assertUuid,
  DIFFICULTIES,
  parseQuestCreate,
  parseQuestPatch,
  STATUSES,
} from '../lib/validate.js'
import type { TablesUpdate } from '../types/database.types.js'

const router = Router()

const SORTABLE = ['created_at', 'title', 'reward_gold', 'difficulty', 'status'] as const
type SortField = (typeof SORTABLE)[number]

// Sends any rejected promise to the centralized error handler via next().
type Handler = (req: Request, res: Response) => Promise<void>
const wrap =
  (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

// A Supabase error becomes a 500 that the error handler turns into JSON.
function dbError(message: string, detail: string): HttpError {
  console.error(`${message}: ${detail}`)
  return new HttpError(500, message)
}

// GET /quests?status=open&difficulty=easy&sort=reward_gold&order=desc&limit=10
router.get(
  '/',
  wrap(async (req, res) => {
    const { status, difficulty, sort = 'created_at', order = 'desc', limit } = req.query

    // Validate every query param first so bad input always gets a 400.
    if (status !== undefined) {
      if (!STATUSES.includes(status as never)) {
        throw badRequest(`status must be one of: ${STATUSES.join(', ')}`)
      }
    }
    if (difficulty !== undefined) {
      if (!DIFFICULTIES.includes(difficulty as never)) {
        throw badRequest(`difficulty must be one of: ${DIFFICULTIES.join(', ')}`)
      }
    }
    if (!SORTABLE.includes(sort as never)) {
      throw badRequest(`sort must be one of: ${SORTABLE.join(', ')}`)
    }
    if (order !== 'asc' && order !== 'desc') {
      throw badRequest('order must be "asc" or "desc"')
    }
    const n = limit === undefined ? undefined : Number(limit)
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 100)) {
      throw badRequest('limit must be an integer between 1 and 100')
    }

    // Now build the Supabase query.
    let query = getDb().from('quests').select('*')
    if (status !== undefined) query = query.eq('status', status as string)
    if (difficulty !== undefined) query = query.eq('difficulty', difficulty as string)
    query = query.order(sort as SortField, { ascending: order === 'asc' })
    if (n !== undefined) query = query.limit(n)

    const { data, error } = await query
    if (error) throw dbError('Failed to fetch quests', error.message)
    res.status(200).json(data)
  })
)

// GET /quests/:id
router.get(
  '/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    assertUuid(id)

    // maybeSingle() returns null (not an error) when no row matches.
    const { data, error } = await getDb().from('quests').select('*').eq('id', id).maybeSingle()
    if (error) throw dbError('Failed to fetch quest', error.message)
    if (!data) throw notFound(`Quest ${id} not found`)
    res.status(200).json(data)
  })
)

// POST /quests
router.post(
  '/',
  wrap(async (req, res) => {
    const newQuest = parseQuestCreate(req.body)

    const { data, error } = await getDb().from('quests').insert(newQuest).select().single()
    if (error) throw dbError('Failed to create quest', error.message)
    res.status(201).json(data)
  })
)

// PUT /quests/:id  (full replace: title required, omitted fields reset to defaults)
router.put(
  '/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    assertUuid(id)
    const fields = parseQuestCreate(req.body)

    const replacement: TablesUpdate<'quests'> = {
      description: null,
      status: 'open',
      difficulty: 'easy',
      reward_gold: 0,
      claimed_by: null,
      ...fields,
      updated_at: new Date().toISOString(),
    }
    await updateQuest(id, replacement, res)
  })
)

// PATCH /quests/:id  (partial update)
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    assertUuid(id)
    const fields = parseQuestPatch(req.body)

    await updateQuest(id, { ...fields, updated_at: new Date().toISOString() }, res)
  })
)

async function updateQuest(id: string, changes: TablesUpdate<'quests'>, res: Response) {
  const { data, error } = await getDb()
    .from('quests')
    .update(changes)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw dbError('Failed to update quest', error.message)
  if (!data) throw notFound(`Quest ${id} not found`)
  res.status(200).json(data)
}

// DELETE /quests/:id
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    assertUuid(id)

    const { data, error } = await getDb()
      .from('quests')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) throw dbError('Failed to delete quest', error.message)
    if (!data) throw notFound(`Quest ${id} not found`)
    res.status(200).json({ message: 'Quest deleted', quest: data })
  })
)

export default router
