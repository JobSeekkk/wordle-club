import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_WORDLE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_WORDLE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabase
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null

export type StorageMode = 'supabase' | 'local'

export const storageMode: StorageMode = hasSupabase ? 'supabase' : 'local'

export const supabaseProjectRef = (() => {
  if (!supabaseUrl) {
    return null
  }

  try {
    const host = new URL(supabaseUrl).hostname
    return host.split('.')[0] ?? null
  } catch {
    return null
  }
})()
