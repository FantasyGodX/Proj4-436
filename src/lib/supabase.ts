import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types.js'
import { HttpError } from './errors.js'

let client: SupabaseClient<Database> | undefined

// Created lazily so a missing env var becomes a readable JSON 500
// from the error handler instead of crashing the whole function on import.
export function getDb(): SupabaseClient<Database> {
  if (client) return client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new HttpError(
      500,
      'Server is missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables'
    )
  }

  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
