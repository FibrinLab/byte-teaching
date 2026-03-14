'use client'

import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Textarea } from './Textarea'
import { submitFeedback } from '@/app/actions/feedback'

interface FeedbackFormProps {
  sessionId: string
  sessionTitle: string
}

export function FeedbackForm({ sessionId, sessionTitle }: FeedbackFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please fill in your name and email')
      return
    }

    if (!rating) {
      setError('Please select a rating')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      await submitFeedback(sessionId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        rating,
        comment: comment.trim() || undefined,
      })
      setSuccess(true)
      setFirstName('')
      setLastName('')
      setEmail('')
      setRating(null)
      setComment('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 border border-red-500 bg-red-50">
          <p className="font-mono text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 border border-green-500 bg-green-50">
          <p className="font-mono text-sm text-green-800">
            Thank you for your feedback! Your attendance has been recorded.
          </p>
        </div>
      )}

      <p className="font-mono text-xs text-gray-500 italic">
        Your feedback is completely anonymous — teachers will not see your name or email.
        This information is only used to issue your attendance certificate.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="First Name *"
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Enter your first name"
          required
        />
        <Input
          label="Last Name *"
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Enter your last name"
          required
        />
      </div>

      <Input
        label="Email *"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email address"
        required
      />

      <div>
        <label className="block text-sm font-mono font-bold mb-3">
          How would you rate this session? *
        </label>
        <div className="flex gap-2 sm:gap-4">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              className={`w-12 h-12 sm:w-16 sm:h-16 border-2 font-mono text-lg sm:text-xl font-bold transition-colors ${
                rating === value
                  ? 'border-black bg-black text-white'
                  : 'border-gray-400 bg-white text-black hover:border-gray-600'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-2 font-mono text-xs text-gray-600">
          <span>Poor</span>
          <span>Excellent</span>
        </div>
      </div>

      <Textarea
        label="Comments (optional)"
        name="comment"
        rows={6}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your thoughts about this session..."
      />

      <div className="flex gap-4">
        <Button type="submit" disabled={loading || !rating || !firstName.trim() || !lastName.trim() || !email.trim()} className="w-full sm:w-auto">
          {loading ? 'Submitting...' : 'Submit Feedback'}
        </Button>
      </div>
    </form>
  )
}
