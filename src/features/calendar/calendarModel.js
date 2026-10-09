const pad = (value) => String(value).padStart(2, '0')
export const dateKey = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`
export const fromDateKey = (key) => { const [year, month, day] = key.split('-').map(Number); return { year, month, day } }
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate()
export const monthGrid = (year, month) => {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  return Array.from({ length: Math.ceil((firstWeekday + daysInMonth(year, month)) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1
    return day > 0 && day <= daysInMonth(year, month) ? { date: dateKey(year, month, day), day } : null
  })
}
export const shiftMonth = ({ year, month }, delta) => { const date = new Date(year, month - 1 + delta, 1); return { year: date.getFullYear(), month: date.getMonth() + 1 } }
export const displayMonth = ({ year, month }) => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
const calendarDayNumber = (date) => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86400000
}
const addCalendarDays = (date, days) => {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return dateKey(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate())
}

export const cycleLengthsFromStarts = (starts) => {
  const confirmedStarts = [...new Set(starts.map((start) => start.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
  return confirmedStarts.map((startDate, index) => {
    const followingStart = confirmedStarts[index + 1] ?? null
    const lengthDays = followingStart ? calendarDayNumber(followingStart) - calendarDayNumber(startDate) : null
    return { startDate, endDate: followingStart ? addCalendarDays(followingStart, -1) : null, lengthDays, source: 'confirmed', isComplete: followingStart !== null }
  })
}
