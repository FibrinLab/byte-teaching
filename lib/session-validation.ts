export const SESSION_PUBLISH_PAST_END_ERROR =
  'Cannot publish a session after its end time has passed.'

function parseSessionDate(dateValue: string, label: string) {
  const parsedDate = new Date(dateValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`${label} is invalid`)
  }

  return parsedDate
}

export function getSessionDateOrderError(dateStart: string, dateEnd: string) {
  const startDate = parseSessionDate(dateStart, 'Session start time')
  const endDate = parseSessionDate(dateEnd, 'Session end time')

  if (endDate.getTime() <= startDate.getTime()) {
    return 'Session end time must be after the start time.'
  }

  return null
}

export function assertValidSessionDates(dateStart: string, dateEnd: string) {
  const error = getSessionDateOrderError(dateStart, dateEnd)

  if (error) {
    throw new Error(error)
  }
}

export function getSessionPublishBlockReason(dateEnd: string, now = new Date()) {
  const endDate = parseSessionDate(dateEnd, 'Session end time')

  if (endDate.getTime() <= now.getTime()) {
    return SESSION_PUBLISH_PAST_END_ERROR
  }

  return null
}

export function assertSessionCanBePublished(dateEnd: string, now = new Date()) {
  const error = getSessionPublishBlockReason(dateEnd, now)

  if (error) {
    throw new Error(error)
  }
}
