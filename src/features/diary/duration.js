import { asMillis } from '../../lib/demoClock.js'

export function durationMinutes(startAt, endAt) {
  if (!startAt || !endAt) return null
  const minutes = Math.round((asMillis(endAt) - asMillis(startAt)) / 60000)
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null
}

export function formatDuration(startAt, endAt) {
  const minutes = durationMinutes(startAt, endAt)
  if (minutes === null) return 'Ongoing'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`
}
