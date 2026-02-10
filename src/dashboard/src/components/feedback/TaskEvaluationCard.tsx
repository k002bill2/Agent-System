import { useEffect, useRef, useState } from 'react'
import { ThumbsUp, ThumbsDown, MessageSquare, Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFeedbackStore, TaskEvaluationSubmit } from '../../stores/feedback'

interface TaskEvaluationCardProps {
  sessionId: string
  taskId: string
  agentId?: string
  contextSummary?: string
  projectName?: string
  effortLevel?: string
}

export function TaskEvaluationCard({ sessionId, taskId, agentId, contextSummary, projectName, effortLevel }: TaskEvaluationCardProps) {
  const {
    taskEvaluations,
    submitTaskEvaluation,
    fetchTaskEvaluation,
    isSubmitting,
  } = useFeedbackStore()

  const key = `${sessionId}:${taskId}`
  const existing = taskEvaluations[key]

  const [selected, setSelected] = useState<'up' | 'down' | null>(null)
  const [showComment, setShowComment] = useState(false)
  const [comment, setComment] = useState('')
  const fetchedRef = useRef(false)
  const syncedRef = useRef(false)

  // Fetch existing evaluation once on mount (StrictMode safe)
  useEffect(() => {
    if (!fetchedRef.current && !existing) {
      fetchedRef.current = true
      fetchTaskEvaluation(sessionId, taskId)
    }
  }, [sessionId, taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from server data (once)
  useEffect(() => {
    if (existing && !syncedRef.current && !selected) {
      syncedRef.current = true
      setSelected(existing.rating >= 3 ? 'up' : 'down')
    }
  }, [existing]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVote = async (vote: 'up' | 'down') => {
    // Toggle off if already selected
    if (selected === vote) {
      setSelected(null)
      return
    }
    setSelected(vote)

    const evaluation: TaskEvaluationSubmit = {
      session_id: sessionId,
      task_id: taskId,
      rating: vote === 'up' ? 5 : 1,
      result_accuracy: vote === 'up',
      speed_satisfaction: vote === 'up',
      ...(agentId && { agent_id: agentId }),
      ...(contextSummary && { context_summary: contextSummary }),
      ...(projectName && { project_name: projectName }),
      ...(effortLevel && { effort_level: effortLevel }),
    }
    await submitTaskEvaluation(evaluation)
  }

  const handleCommentSubmit = async () => {
    if (!comment.trim()) return

    const evaluation: TaskEvaluationSubmit = {
      session_id: sessionId,
      task_id: taskId,
      rating: selected === 'down' ? 1 : selected === 'up' ? 5 : 3,
      result_accuracy: selected !== 'down',
      speed_satisfaction: selected !== 'down',
      comment: comment.trim(),
      ...(agentId && { agent_id: agentId }),
      ...(contextSummary && { context_summary: contextSummary }),
      ...(projectName && { project_name: projectName }),
      ...(effortLevel && { effort_level: effortLevel }),
    }

    await submitTaskEvaluation(evaluation)
    setShowComment(false)
    setComment('')
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => handleVote('up')}
        disabled={isSubmitting}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          selected === 'up'
            ? 'text-white bg-white/10'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
        )}
        title="도움이 됐어요"
      >
        <ThumbsUp className="w-[18px] h-[18px]" />
      </button>

      <button
        onClick={() => handleVote('down')}
        disabled={isSubmitting}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          selected === 'down'
            ? 'text-white bg-white/10'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
        )}
        title="대답이 마음에 들지 않아요"
      >
        <ThumbsDown className="w-[18px] h-[18px]" />
      </button>

      <button
        onClick={() => setShowComment(!showComment)}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          showComment
            ? 'text-white bg-white/10'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
        )}
        title="코멘트"
      >
        <MessageSquare className="w-[18px] h-[18px]" />
      </button>

      {showComment && (
        <div className="flex items-center gap-1 ml-1">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit()}
            placeholder="의견을 남겨주세요..."
            className="text-xs px-2 py-1 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-48"
            autoFocus
          />
          <button
            onClick={handleCommentSubmit}
            disabled={!comment.trim() || isSubmitting}
            className="p-1 text-green-400 hover:bg-white/5 rounded disabled:opacity-30"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setShowComment(false); setComment('') }}
            className="p-1 text-gray-500 hover:bg-white/5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
