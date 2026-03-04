import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let serviceClient: SupabaseClient | null = null

if (SUPABASE_URL && SERVICE_ROLE_KEY) {
  serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
}

export function getServiceSupabase(): SupabaseClient {
  if (!serviceClient) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for background document processing. Set it in your environment.',
    )
  }
  return serviceClient
}

export function hasServiceSupabase(): boolean {
  return Boolean(serviceClient)
}
