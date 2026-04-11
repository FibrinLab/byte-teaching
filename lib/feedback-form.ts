import type {
  DepartmentFeedbackField,
  FeedbackAnswerInput,
  FeedbackFieldType,
  SubmittedFeedbackAnswer,
} from '@/lib/types'

export const FEEDBACK_RATING_OPTIONS = [
  { value: '1', label: '1 - Very poor' },
  { value: '2', label: '2 - Poor' },
  { value: '3', label: '3 - Satisfactory' },
  { value: '4', label: '4 - Good' },
  { value: '5', label: '5 - Excellent' },
] as const

export const DEFAULT_FEEDBACK_FORM_FIELDS: DepartmentFeedbackField[] = [
  {
    id: 'teaching_objectives',
    type: 'rating',
    label: 'How well were the teaching objectives outlined and delivered?',
    required: true,
    commentLabel: 'Any further comments on teaching objectives outline or delivery?',
  },
  {
    id: 'learner_engagement',
    type: 'rating',
    label: 'How well did the teacher engage the learners?',
    required: true,
    commentLabel: 'Any further comments on engaging learners?',
  },
  {
    id: 'session_structure',
    type: 'rating',
    label: 'How well did the teacher structure their session?',
    required: true,
    commentLabel: 'Any further comments on structure?',
  },
  {
    id: 'group_participation',
    type: 'rating',
    label: 'How well did the teacher use group participation/ interaction?',
    required: true,
    commentLabel: 'Any further comments on group participation/ interaction?',
  },
  {
    id: 'teaching_methodology',
    type: 'rating',
    label: 'How well did the teacher use teaching style and methodology?',
    required: true,
    commentLabel: 'Any further comments on teaching style or methodology?',
  },
  {
    id: 'additional_comments',
    type: 'textarea',
    label: 'Any additional comments?',
    required: false,
    placeholder: 'Add any final observations here...',
  },
]

const VALID_FIELD_TYPES = new Set<FeedbackFieldType>(['rating', 'textarea', 'text'])
const VALID_RATING_VALUES = new Set<string>(FEEDBACK_RATING_OPTIONS.map((option) => option.value))

function cleanString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function cloneField(field: DepartmentFeedbackField): DepartmentFeedbackField {
  return {
    id: field.id,
    type: field.type,
    label: field.label,
    required: field.required,
    commentLabel: field.commentLabel ?? null,
    placeholder: field.placeholder ?? null,
  }
}

function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return slug || 'field'
}

function resolveUniqueId(rawId: unknown, label: string, index: number, usedIds: Set<string>) {
  const candidate = cleanString(rawId) || `${slugify(label)}_${index + 1}`
  let resolved = candidate
  let counter = 2

  while (usedIds.has(resolved)) {
    resolved = `${candidate}_${counter}`
    counter += 1
  }

  usedIds.add(resolved)
  return resolved
}

export function cloneDefaultFeedbackFormFields() {
  return DEFAULT_FEEDBACK_FORM_FIELDS.map(cloneField)
}

export function normalizeDepartmentFeedbackFields(rawFields: unknown): DepartmentFeedbackField[] {
  if (!Array.isArray(rawFields)) {
    return cloneDefaultFeedbackFormFields()
  }

  const usedIds = new Set<string>()
  const normalizedFields: DepartmentFeedbackField[] = []

  rawFields.forEach((rawField, index) => {
    if (!rawField || typeof rawField !== 'object') {
      return
    }

    const label = cleanString((rawField as { label?: unknown }).label)
    if (!label) {
      return
    }

    const rawType = cleanString((rawField as { type?: unknown }).type)
    const type: FeedbackFieldType = rawType && VALID_FIELD_TYPES.has(rawType as FeedbackFieldType)
      ? (rawType as FeedbackFieldType)
      : 'rating'

    normalizedFields.push({
      id: resolveUniqueId((rawField as { id?: unknown }).id, label, index, usedIds),
      type,
      label,
      required: Boolean((rawField as { required?: unknown }).required),
      commentLabel:
        type === 'rating'
          ? cleanString((rawField as { commentLabel?: unknown }).commentLabel) ??
            'Any further comments?'
          : null,
      placeholder:
        type === 'rating'
          ? null
          : cleanString((rawField as { placeholder?: unknown }).placeholder),
    })
  })

  return normalizedFields.length > 0 ? normalizedFields : cloneDefaultFeedbackFormFields()
}

export function normalizeSubmittedFeedbackAnswers(rawAnswers: unknown): SubmittedFeedbackAnswer[] {
  if (!Array.isArray(rawAnswers)) {
    return []
  }

  return rawAnswers
    .map((rawAnswer) => {
      if (!rawAnswer || typeof rawAnswer !== 'object') {
        return null
      }

      const label = cleanString((rawAnswer as { label?: unknown }).label)
      const rawType = cleanString((rawAnswer as { type?: unknown }).type)

      if (!label || !rawType || !VALID_FIELD_TYPES.has(rawType as FeedbackFieldType)) {
        return null
      }

      return {
        fieldId: cleanString((rawAnswer as { fieldId?: unknown }).fieldId) || slugify(label),
        type: rawType as FeedbackFieldType,
        label,
        value: cleanString((rawAnswer as { value?: unknown }).value),
        commentLabel: cleanString((rawAnswer as { commentLabel?: unknown }).commentLabel),
        comment: cleanString((rawAnswer as { comment?: unknown }).comment),
      }
    })
    .filter((answer): answer is SubmittedFeedbackAnswer => Boolean(answer))
}

export function buildFeedbackSubmission(
  templateFields: DepartmentFeedbackField[],
  rawAnswers: FeedbackAnswerInput[]
) {
  const normalizedFields = normalizeDepartmentFeedbackFields(templateFields)
  const answersByFieldId = new Map(
    rawAnswers.map((answer) => [
      answer.fieldId,
      {
        value: cleanString(answer.value),
        comment: cleanString(answer.comment),
      },
    ])
  )

  const submittedAnswers: SubmittedFeedbackAnswer[] = []
  const ratingValues: number[] = []
  const textBlocks: string[] = []

  for (const field of normalizedFields) {
    const answer = answersByFieldId.get(field.id)
    const value = answer?.value ?? null
    const comment = answer?.comment ?? null

    if (field.type === 'rating') {
      if (field.required && !value) {
        throw new Error(`Please complete: ${field.label}`)
      }

      if (value && !VALID_RATING_VALUES.has(value)) {
        throw new Error(`Invalid rating supplied for: ${field.label}`)
      }

      if (value) {
        ratingValues.push(Number(value))
      }

      if (comment) {
        textBlocks.push(`${field.commentLabel || field.label}\n${comment}`)
      }

      submittedAnswers.push({
        fieldId: field.id,
        type: field.type,
        label: field.label,
        value,
        commentLabel: field.commentLabel ?? null,
        comment,
      })
      continue
    }

    if (field.required && !value) {
      throw new Error(`Please complete: ${field.label}`)
    }

    if (value) {
      textBlocks.push(`${field.label}\n${value}`)
    }

    submittedAnswers.push({
      fieldId: field.id,
      type: field.type,
      label: field.label,
      value,
      commentLabel: null,
      comment: null,
    })
  }

  const derivedRating =
    ratingValues.length > 0
      ? Math.round(ratingValues.reduce((sum, rating) => sum + rating, 0) / ratingValues.length)
      : null

  return {
    submittedAnswers,
    derivedRating,
    derivedComment: textBlocks.length > 0 ? textBlocks.join('\n\n') : null,
  }
}

export function extractTextResponses(answers: SubmittedFeedbackAnswer[]) {
  return answers.flatMap((answer) => {
    if (answer.type === 'rating') {
      return answer.comment
        ? [
            {
              label: answer.commentLabel || answer.label,
              text: answer.comment,
            },
          ]
        : []
    }

    return answer.value
      ? [
          {
            label: answer.label,
            text: answer.value,
          },
        ]
      : []
  })
}

export function formatFeedbackAnswerValue(answer: SubmittedFeedbackAnswer) {
  if (answer.type !== 'rating') {
    return answer.value || 'No response'
  }

  const matchedOption = FEEDBACK_RATING_OPTIONS.find((option) => option.value === answer.value)
  return matchedOption?.label || 'Not scored'
}

export function getFeedbackSubmissionScore(answers: SubmittedFeedbackAnswer[], fallbackRating?: number | null) {
  const ratings = answers
    .filter((answer) => answer.type === 'rating' && answer.value)
    .map((answer) => Number(answer.value))
    .filter((rating) => !Number.isNaN(rating))

  if (ratings.length === 0) {
    return fallbackRating ?? null
  }

  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
}
