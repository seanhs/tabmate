import posthog from 'posthog-js'
import { supabase } from './supabase'

type EventProps = Record<string, string | number | boolean | null | undefined>

let initialized = false

function ensureInit() {
  if (initialized) return
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (key) {
    posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      persistence: 'localStorage',
      autocapture: false,
    })
    initialized = true
  }
}

ensureInit()

const CLIENT_ID_KEY = 'tabmate:client_id'

function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * Log an analytics event to Supabase and PostHog.
 * Fire-and-forget — never blocks the UI, never throws.
 */
export function track(event: string, properties: EventProps = {}) {
  const tripId = properties.trip_id as string | undefined
  const tripSlug = properties.trip_slug as string | undefined

  const cleanProps = { ...properties }
  delete cleanProps.trip_id
  delete cleanProps.trip_slug

  const clientId = getClientId()

  if (initialized) {
    try {
      posthog.capture(event, { ...cleanProps, trip_id: tripId ?? null, trip_slug: tripSlug ?? null, client_id: clientId })
    } catch (e) {
      console.warn('[analytics] posthog capture failed:', e)
    }
  }

  supabase.from('analytics_events').insert({
    event_name: event,
    trip_id: tripId ?? null,
    trip_slug: tripSlug ?? null,
    properties: cleanProps,
    client_id: clientId,
  }).then(({ error }) => {
    if (error) console.warn('[analytics] failed to log event:', event, error.message)
  })
}
