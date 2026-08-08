/**
 * Hunk 단위 스테이징 UI — WorkingDirectory 내부 전용.
 */

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DiffHunk } from '@/stores/git'

export function HunkStagingPanel({
  hunks,
  onStageHunks,
  isLoading,
}: {
  hunks: DiffHunk[]
  onStageHunks: (indices: number[]) => Promise<boolean>
  isLoading: boolean
}) {
  const [selectedHunks, setSelectedHunks] = useState<Set<number>>(new Set())

  const toggleHunk = (idx: number) => {
    setSelectedHunks((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleStage = async () => {
    if (selectedHunks.size === 0) return
    const success = await onStageHunks(Array.from(selectedHunks))
    if (success) setSelectedHunks(new Set())
  }

  return (
    <div className="ml-6 mr-3 mb-2 space-y-2">
      {hunks.map((hunk) => (
        <div key={hunk.index} className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800">
            <input
              type="checkbox"
              checked={selectedHunks.has(hunk.index)}
              onChange={() => toggleHunk(hunk.index)}
              className="w-3.5 h-3.5 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-xs text-blue-400">{hunk.header}</span>
          </div>
          <div className="text-xs max-h-32 overflow-y-auto">
            {hunk.content.split('\n').map((line, i) => (
              <div
                key={i}
                className={cn(
                  'px-3 py-0.5',
                  line.startsWith('+') && 'bg-green-900/30 text-green-400',
                  line.startsWith('-') && 'bg-red-900/30 text-red-400',
                  line.startsWith(' ') && 'text-gray-500'
                )}
              >
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      ))}
      {selectedHunks.size > 0 && (
        <button
          onClick={handleStage}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Stage {selectedHunks.size} Hunk{selectedHunks.size !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
