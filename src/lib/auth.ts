import { supabase } from './supabase'

let sessionPromise: Promise<string> | null = null

export function ensureAnonymousSession(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data: existing, error: existingError } = await supabase.auth.getSession()
      if (existingError) throw existingError
      if (existing.session?.user.id) return existing.session.user.id

      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      if (!data.user?.id) throw new Error('Anonymous sign-in did not return a user')
      return data.user.id
    })().catch((error) => {
      sessionPromise = null
      throw error
    })
  }
  return sessionPromise
}
