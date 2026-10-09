export const DEMO_NOW = '2025-03-20T18:00:00+08:00'
export const DEMO_DATE = '2025-03-20'
export const DEMO_TIME = '18:00'

export const nowIso = () => DEMO_NOW
export const systemNowIso = () => new Date().toISOString()
export const systemDateTimeParts = (date = new Date()) => ({
  date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
})
const offsetForLocalDateTime = (date, time) => {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const offsetMinutes = -new Date(year, month - 1, day, hour, minute).getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}
export const toIsoWithOffset = (date, time, offset = null) => date && time ? `${date}T${time}:00${offset ?? offsetForLocalDateTime(date, time)}` : null
export const toInputParts = (iso) => iso ? { date: iso.slice(0, 10), time: iso.slice(11, 16) } : { date: '', time: '' }
export const asMillis = (iso) => iso ? Date.parse(iso) : null
