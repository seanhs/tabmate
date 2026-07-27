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

  if (initialized) {
    try {
      posthog.capture(event, { ...cleanProps, trip_id: tripId ?? null, trip_slug: tripSlug ?? null })
    } catch (e) {
      console.warn('[analytics] posthog capture failed:', e)
    }
  }

  supabase.from('analytics_events').insert({
    event_name: event,
    trip_id: tripId ?? null,
    trip_slug: tripSlug ?? null,
    properties: cleanProps,
  }).then(({ error }) => {
    if (error) console.warn('[analytics] failed to log event:', event, error.message)
  })
}
