'use client'

import { useEffect, useState } from 'react'
import { Card } from './Card'

interface FeedbackQuestionSummary {
  fieldId: string
  label: string
  averageRating: number
  responseCount: number
  commentsCount: number
}

interface FeedbackCommentEntry {
  id: string
  rating: number | null
  created_at: string
  responses: { label: string; text: string }[]
}

interface FeedbackStats {
  total: number
  averageRating: number
  ratingDistribution: { [key: number]: number }
  commentsCount: number
  comments: FeedbackCommentEntry[]
  questionSummaries: FeedbackQuestionSummary[]
}

interface FeedbackAnalysisPanelProps {
  sessionId: string
}

export function FeedbackAnalysisPanel({ sessionId }: FeedbackAnalysisPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<FeedbackStats | null>(null)

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true)
        const response = await fetch(`/api/sessions/${sessionId}/feedback/stats`)
        if (!response.ok) {
          throw new Error('Failed to load feedback')
        }
        const data = await response.json()
        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load feedback')
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [sessionId])

  if (loading) {
    return <p className="font-mono text-sm">Loading feedback...</p>
  }

  if (error) {
    return (
      <div className="p-4 border border-red-500 bg-red-50">
        <p className="font-mono text-sm text-red-800">{error}</p>
      </div>
    )
  }

  if (!stats || stats.total === 0) {
    return (
      <div>
        <p className="font-mono text-sm text-gray-600 mb-4">No feedback received yet.</p>
        <p className="font-mono text-sm">
          Share the feedback link or QR code with attendees to collect feedback.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="mb-1 font-mono text-sm text-gray-600">Total Responses</p>
          <p className="text-3xl font-mono font-bold">{stats.total}</p>
        </Card>
        <Card>
          <p className="mb-1 font-mono text-sm text-gray-600">Average Score</p>
          <p className="text-3xl font-mono font-bold">{stats.averageRating.toFixed(1)}</p>
          <p className="mt-1 font-mono text-xs text-gray-600">derived from scored questions</p>
        </Card>
        <Card>
          <p className="mb-1 font-mono text-sm text-gray-600">Text Responses</p>
          <p className="text-3xl font-mono font-bold">{stats.commentsCount}</p>
        </Card>
      </div>

      <Card>
        <h3 className="mb-4 font-mono font-bold">Overall Score Distribution</h3>
        <div className="space-y-3">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = stats.ratingDistribution[rating] || 0
            const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0
            return (
              <div key={rating} className="flex items-center gap-3">
                <span className="w-8 font-mono text-sm font-bold">{rating}</span>
                <div className="relative h-6 flex-1 bg-gray-200">
                  <div className="h-full bg-black" style={{ width: `${percentage}%` }} />
                </div>
                <span className="w-12 text-right font-mono text-sm">{count}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {stats.questionSummaries.length > 0 ? (
        <Card>
          <h3 className="mb-4 font-mono font-bold">RCPCH Question Summary</h3>
          <div className="space-y-4">
            {stats.questionSummaries.map((question) => (
              <div key={question.fieldId} className="border border-gray-300 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-sm font-bold leading-6">{question.label}</p>
                    <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-gray-500">
                      {question.responseCount} scored response
                      {question.responseCount !== 1 ? 's' : ''}
                      {question.commentsCount > 0
                        ? ` · ${question.commentsCount} follow-up comment${question.commentsCount !== 1 ? 's' : ''}`
                        : ''}
                    </p>
                  </div>
                  <p className="font-mono text-2xl font-bold">{question.averageRating.toFixed(1)}/5</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {stats.comments.length > 0 ? (
        <Card>
          <h3 className="mb-4 font-mono font-bold">Written Feedback</h3>
          <div className="space-y-4">
            {stats.comments.map((entry) => (
              <div key={entry.id} className="border border-gray-300 p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-gray-500">
                    {new Date(entry.created_at).toLocaleDateString('en-GB')}
                  </p>
                  {entry.rating !== null ? (
                    <p className="font-mono text-sm font-bold">{entry.rating.toFixed(1)}/5 overall</p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {entry.responses.map((response, index) => (
                    <div key={`${entry.id}-${index}`} className="border-l-2 border-black pl-3">
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-gray-500">
                        {response.label}
                      </p>
                      <p className="mt-2 font-mono text-sm leading-6">{response.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
