import type { Trip } from './supabase'

const STORAGE_KEY = 'tabmate:local_trips'

export type LocalTrip = {
  id: string
  slug: string
  name: string
  created_at: string
  last_opened_at: string
}

function read(): LocalTrip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t): t is LocalTrip =>
        t && typeof t.id === 'string' && typeof t.slug === 'string',
    )
  } catch {
    return []
  }
}

function write(trips: LocalTrip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips))
  } catch {
    // storage full or unavailable — silently ignore; feature is non-critical
  }
}

export function getLocalTrips(): LocalTrip[] {
  return read().sort(
    (a, b) => new Date(b.last_opened_at).getTime() - new Date(a.last_opened_at).getTime(),
  )
}

export function addLocalTrip(trip: Pick<Trip, 'id' | 'slug' | 'name' | 'created_at'>) {
  const trips = read().filter((t) => t.id !== trip.id)
  const now = new Date().toISOString()
  trips.push({
    id: trip.id,
    slug: trip.slug,
    name: trip.name,
    created_at: trip.created_at,
    last_opened_at: now,
  })
  write(trips)
}

export function touchLocalTrip(trip: Pick<Trip, 'id' | 'slug' | 'name' | 'created_at'>) {
  const trips = read()
  const existing = trips.find((t) => t.id === trip.id)
  const now = new Date().toISOString()
  if (existing) {
    existing.last_opened_at = now
    existing.name = trip.name
  } else {
    trips.push({
      id: trip.id,
      slug: trip.slug,
      name: trip.name,
      created_at: trip.created_at,
      last_opened_at: now,
    })
  }
  write(trips)
}

export function removeLocalTrip(slug: string) {
  write(read().filter((t) => t.slug !== slug))
}
