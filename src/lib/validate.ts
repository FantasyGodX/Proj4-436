import { badRequest, notFound } from './errors.js'
import type { TablesInsert, TablesUpdate } from '../types/database.types.js'

export const STATUSES = ['open', 'claimed', 'completed'] as const
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// An id that is not a UUID cannot match any quest, so it is a 404, not a 400.
export function assertUuid(id: string): void {
  if (!UUID_RE.test(id)) throw notFound(`Quest "${id}" not found (ids are UUIDs)`)
}

function isObject(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
}

// Validates one field if it is present, collecting problems into `errors`.
function checkFields(body: Record<string, unknown>, errors: string[]) {
  const out: TablesUpdate<'quests'> = {}

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      errors.push('title must be a non-empty string')
    } else if (body.title.length > 120) {
      errors.push('title must be 120 characters or fewer')
    } else out.title = body.title.trim()
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      errors.push('description must be a string or null')
    } else out.description = body.description
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as never)) {
      errors.push(`status must be one of: ${STATUSES.join(', ')}`)
    } else out.status = body.status as string
  }

  if (body.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(body.difficulty as never)) {
      errors.push(`difficulty must be one of: ${DIFFICULTIES.join(', ')}`)
    } else out.difficulty = body.difficulty as string
  }

  if (body.reward_gold !== undefined) {
    if (!Number.isInteger(body.reward_gold) || (body.reward_gold as number) < 0) {
      errors.push('reward_gold must be a non-negative integer')
    } else out.reward_gold = body.reward_gold as number
  }

  if (body.claimed_by !== undefined) {
    if (body.claimed_by !== null && (typeof body.claimed_by !== 'string' || body.claimed_by.trim() === '')) {
      errors.push('claimed_by must be a non-empty string or null')
    } else out.claimed_by = body.claimed_by === null ? null : (body.claimed_by as string).trim()
  }

  return out
}

const ALLOWED = ['title', 'description', 'status', 'difficulty', 'reward_gold', 'claimed_by']

function rejectUnknown(body: Record<string, unknown>, errors: string[]) {
  const unknown = Object.keys(body).filter((k) => !ALLOWED.includes(k))
  if (unknown.length) errors.push(`unknown field(s): ${unknown.join(', ')}`)
}

// POST and PUT: title is required, everything else is optional (defaults in DB).
export function parseQuestCreate(body: unknown): TablesInsert<'quests'> {
  if (!isObject(body)) {
    throw badRequest('Request body must be a JSON object (send Content-Type: application/json)')
  }
  const errors: string[] = []
  if (body.title === undefined) errors.push('title is required')
  rejectUnknown(body, errors)
  const fields = checkFields(body, errors)
  if (errors.length) throw badRequest(errors.join('; '))
  return { ...fields, title: fields.title as string }
}

// PATCH: any subset of fields, but at least one.
export function parseQuestPatch(body: unknown): TablesUpdate<'quests'> {
  if (!isObject(body)) {
    throw badRequest('Request body must be a JSON object (send Content-Type: application/json)')
  }
  const errors: string[] = []
  rejectUnknown(body, errors)
  const fields = checkFields(body, errors)
  if (!errors.length && Object.keys(fields).length === 0) {
    errors.push(`provide at least one field to update: ${ALLOWED.join(', ')}`)
  }
  if (errors.length) throw badRequest(errors.join('; '))
  return fields
}
