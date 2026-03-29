/**
 * DiffViewer - Displays file changes in split or unified view
 */

import { useMemo } from 'react';
import { createTwoFilesPatch } from 'diff';
import { useDiffStore, type DiffEntry } from '../stores/diff';
import { cn } from '../lib/utils';
import {
  FileText,
  Check,
  X,
  SplitSquareVertical,
  AlignJustify,
  Plus,
  Minus,
} from 'lucide-react';

interface DiffViewerProps {
  entry?: DiffEntry;
  className?: string;
}

/**
 * Parse a unified diff patch into renderable hunks
 */
function parsePatch(patch: string): Array<{
  header: string;
  lines: Array<{
    type: 'add' | 'remove' | 'context';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
  }>;
}> {
  const lines = patch.split('\n');
  const hunks: Array<{
    header: string;
    lines: Array<{
      type: 'add' | 'remove' | 'context';
      content: string;
      oldLineNumber?: number;
      newLineNumber?: number;
    }>;
  }> = [];

  let currentHunk: (typeof hunks)[0] | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Skip file headers
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('===')) {
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)$/);
    if (hunkMatch) {
      currentHunk = {
        header: line,
        lines: [],
      };
      hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLine++,
      });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNumber: oldLine++,
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    }
  }

  return hunks;
}

/**
 * Unified diff view (GitHub-style)
 */
function UnifiedDiffView({ patch }: { patch: string }) {
  const hunks = useMemo(() => parsePatch(patch), [patch]);

  if (hunks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No changes detected
      </div>
    );
  }

  return (
    <div className="text-sm">
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex} className="border-b border-gray-700">
          <div className="bg-gray-800 px-4 py-1 text-blue-400 text-xs">
            {hunk.header}
          </div>
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className={cn(
                'px-4 py-0.5 flex items-start gap-2',
                line.type === 'add' && 'bg-green-900/30 text-green-400',
                line.type === 'remove' && 'bg-red-900/30 text-red-400',
                line.type === 'context' && 'text-gray-400'
              )}
            >
              <span className="text-gray-600 w-8 text-right shrink-0">
                {line.oldLineNumber || ''}
              </span>
              <span className="text-gray-600 w-8 text-right shrink-0">
                {line.newLineNumber || ''}
              </span>
              <span className="w-4 shrink-0">
                {line.type === 'add' && <Plus className="w-3 h-3" />}
                {line.type === 'remove' && <Minus className="w-3 h-3" />}
              </span>
              <span className="whitespace-pre-wrap break-all">{line.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Split diff view (side-by-side)
 */
function SplitDiffView({ patch }: { patch: string }) {
  const hunks = useMemo(() => parsePatch(patch), [patch]);

  if (hunks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No changes detected
      </div>
    );
  }

  return (
    <div className="text-sm grid grid-cols-2 gap-0">
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex} className="col-span-2">
          <div className="bg-gray-800 px-4 py-1 text-blue-400 text-xs col-span-2">
            {hunk.header}
          </div>
          <div className="grid grid-cols-2 gap-0">
            {/* Left side (old) */}
            <div className="border-r border-gray-700">
              {hunk.lines
                .filter((l) => l.type !== 'add')
                .map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    className={cn(
                      'px-2 py-0.5 flex items-start gap-2',
                      line.type === 'remove' && 'bg-red-900/30 text-red-400',
                      line.type === 'context' && 'text-gray-400'
                    )}
                  >
                    <span className="text-gray-600 w-8 text-right shrink-0">
                      {line.oldLineNumber || ''}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{line.content}</span>
                  </div>
                ))}
            </div>

            {/* Right side (new) */}
            <div>
              {hunk.lines
                .filter((l) => l.type !== 'remove')
                .map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    className={cn(
                      'px-2 py-0.5 flex items-start gap-2',
                      line.type === 'add' && 'bg-green-900/30 text-green-400',
                      line.type === 'context' && 'text-gray-400'
                    )}
                  >
                    <span className="text-gray-600 w-8 text-right shrink-0">
                      {line.newLineNumber || ''}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{line.content}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Main DiffViewer component
 */
export function DiffViewer({ entry, className }: DiffViewerProps) {
  const { viewMode, setViewMode, updateEntryStatus } = useDiffStore();

  const patch = useMemo(() => {
    if (!entry) return '';

    return createTwoFilesPatch(
      entry.filePath,
      entry.filePath,
      entry.oldContent,
      entry.newContent,
      'original',
      'modified'
    );
  }, [entry]);

  if (!entry) {
    return (
      <div className={cn('flex items-center justify-center h-full text-gray-500', className)}>
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Select a file to view changes</p>
        </div>
      </div>
    );
  }

  const fileName = entry.filePath.split('/').pop() || entry.filePath;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-white">{fileName}</span>
          <span className="text-xs text-gray-500">{entry.filePath}</span>
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded',
              entry.status === 'pending' && 'bg-yellow-900/50 text-yellow-400',
              entry.status === 'applied' && 'bg-green-900/50 text-green-400',
              entry.status === 'rejected' && 'bg-red-900/50 text-red-400'
            )}
          >
            {entry.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-700 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('split')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'split' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              )}
              title="Split view"
            >
              <SplitSquareVertical className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'unified' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              )}
              title="Unified view"
            >
              <AlignJustify className="w-4 h-4" />
            </button>
          </div>

          {/* Action buttons (only for pending) */}
          {entry.status === 'pending' && (
            <>
              <button
                onClick={() => updateEntryStatus(entry.id, 'applied')}
                className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-sm text-white transition-colors"
              >
                <Check className="w-4 h-4" />
                Apply
              </button>
              <button
                onClick={() => updateEntryStatus(entry.id, 'rejected')}
                className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-sm text-white transition-colors"
              >
                <X className="w-4 h-4" />
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto bg-gray-900">
        {viewMode === 'unified' ? (
          <UnifiedDiffView patch={patch} />
        ) : (
          <SplitDiffView patch={patch} />
        )}
      </div>
    </div>
  );
}

/**
 * DiffPanel - Shows list of file changes with preview
 */
export function DiffPanel({ className }: { className?: string }) {
  const { entries, selectedEntryId, selectEntry } = useDiffStore();

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* File list */}
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No file changes</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {entries.map((entry) => {
              const fileName = entry.filePath.split('/').pop() || entry.filePath;
              const isSelected = entry.id === selectedEntryId;

              return (
                <button
                  key={entry.id}
                  onClick={() => selectEntry(entry.id)}
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors',
                    isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-800'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-white">{fileName}</span>
                    </div>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded',
                        entry.status === 'pending' && 'bg-yellow-900/50 text-yellow-400',
                        entry.status === 'applied' && 'bg-green-900/50 text-green-400',
                        entry.status === 'rejected' && 'bg-red-900/50 text-red-400'
                      )}
                    >
                      {entry.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {entry.filePath}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="border-t border-gray-700 px-4 py-2 bg-gray-800 text-xs text-gray-400">
        {entries.length} changes ({entries.filter((e) => e.status === 'pending').length} pending)
      </div>
    </div>
  );
}

export default DiffViewer;
