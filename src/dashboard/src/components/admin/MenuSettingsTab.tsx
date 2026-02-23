import { useEffect, useState, useRef, useCallback } from 'react'
import { Save, Check, GripVertical } from 'lucide-react'
import type { UserRole } from '../../stores/auth'
import type { MenuVisibility } from './types'
import { MENU_LABELS, ROLE_LABELS, ROLE_COLORS } from './types'
import { fetchMenuVisibilityData, saveMenuVisibility } from './api'
import { useMenuVisibilityStore } from '../../stores/menuVisibility'

// 기본 메뉴 순서 (Sidebar와 동일) — Single Source of Truth
const DEFAULT_MENU_ORDER: string[] = [
  'dashboard', 'projects', 'sessions', 'agents',
  'monitor', 'claude-sessions', 'project-configs', 'project-management', 'git',
  'organizations', 'audit', 'notifications', 'analytics', 'playground', 'workflows',
  'external-usage',
]

/**
 * 서버에서 받은 menu_order와 DEFAULT_MENU_ORDER를 동기화.
 * - 서버에 없지만 DEFAULT에 있는 항목 → 끝에 추가
 * - 서버에 있지만 DEFAULT에 없는 항목 → 제거 (삭제된 메뉴)
 */
function syncMenuOrder(serverOrder: string[]): string[] {
  const defaultSet = new Set(DEFAULT_MENU_ORDER)
  // 서버 순서에서 유효한 항목만 유지
  const synced = serverOrder.filter((key) => defaultSet.has(key))
  // 서버에 없는 새 항목을 끝에 추가
  const existingSet = new Set(synced)
  for (const key of DEFAULT_MENU_ORDER) {
    if (!existingSet.has(key)) {
      synced.push(key)
    }
  }
  return synced
}

/**
 * visibility 데이터에 새 메뉴의 기본값 추가.
 * 새 메뉴는 모든 역할에 대해 기본 표시(true)로 설정.
 */
function syncVisibility(vis: MenuVisibility): MenuVisibility {
  const synced = { ...vis }
  for (const key of DEFAULT_MENU_ORDER) {
    if (!synced[key]) {
      synced[key] = { user: true, manager: true, admin: true }
    }
  }
  return synced
}

export function MenuSettingsTab() {
  const [visibility, setVisibility] = useState<MenuVisibility | null>(null)
  const [menuOrder, setMenuOrder] = useState<string[]>(DEFAULT_MENU_ORDER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragNodeRef = useRef<HTMLTableRowElement | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMenuVisibilityData()
      const syncedOrder = data.menu_order?.length
        ? syncMenuOrder(data.menu_order)
        : DEFAULT_MENU_ORDER
      const syncedVisibility = syncVisibility(data.visibility)
      setVisibility(syncedVisibility)
      setMenuOrder(syncedOrder)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleToggle = (menuKey: string, role: string) => {
    if (!visibility) return
    if (role === 'admin') return

    setVisibility((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [menuKey]: {
          ...prev[menuKey],
          [role]: !prev[menuKey]?.[role],
        },
      }
    })
    setSaved(false)
    setIsDirty(true)
  }

  const handleSave = async () => {
    if (!visibility) return
    setSaving(true)
    setError(null)
    try {
      const data = await saveMenuVisibility(visibility, menuOrder)
      setVisibility(data.visibility)
      setMenuOrder(data.menu_order?.length ? data.menu_order : menuOrder)
      setSaved(true)
      setIsDirty(false)
      // 글로벌 store도 업데이트하여 Sidebar에 즉시 반영
      useMenuVisibilityStore.setState({
        visibility: data.visibility,
        menuOrder: data.menu_order || menuOrder,
        isLoaded: true,
      })
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Drag & Drop handlers ──
  const handleDragStart = useCallback((e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    setDragIndex(index)
    dragNodeRef.current = e.currentTarget
    e.dataTransfer.effectAllowed = 'move'
    // 투명도 적용 (약간 지연하여 드래그 이미지에는 적용되지 않도록)
    requestAnimationFrame(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.4'
      }
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTableRowElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1'
    }
    setDragIndex(null)
    setOverIndex(null)
    dragNodeRef.current = null
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLTableRowElement>, dropIndex: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      handleDragEnd()
      return
    }

    setMenuOrder((prev) => {
      const newOrder = [...prev]
      const [removed] = newOrder.splice(dragIndex, 1)
      newOrder.splice(dropIndex, 0, removed)
      return newOrder
    })
    setSaved(false)
    setIsDirty(true)
    handleDragEnd()
  }, [dragIndex, handleDragEnd])

  if (loading) {
    return <div className="text-gray-500 py-8 text-center">Loading...</div>
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
        {error}
      </div>
    )
  }

  if (!visibility) return null

  const roles: UserRole[] = ['user', 'manager', 'admin']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            메뉴 노출 설정
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            역할별 메뉴 노출을 설정하고, 드래그로 순서를 변경합니다. 최고관리자는 항상 모든 메뉴에 접근할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && !saved && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              저장되지 않은 변경사항
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              saved
                ? 'bg-green-600 text-white'
                : isDirty
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
            } disabled:opacity-60`}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                저장됨
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {saving ? '저장 중...' : '저장'}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 w-10">
                {/* Drag handle column */}
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                메뉴
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400"
                >
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {menuOrder.map((menuKey, index) => {
              const isDragging = dragIndex === index
              const isOver = overIndex === index && dragIndex !== index
              const isAbove = overIndex !== null && dragIndex !== null && overIndex < dragIndex

              return (
                <tr
                  key={menuKey}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`
                    transition-colors cursor-grab active:cursor-grabbing select-none
                    ${isDragging ? 'opacity-40 bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}
                    ${isOver ? (isAbove ? 'border-t-2 border-t-primary-500' : 'border-b-2 border-b-primary-500') : ''}
                  `}
                >
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500">
                    <GripVertical className="w-4 h-4" />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {MENU_LABELS[menuKey] || menuKey}
                  </td>
                  {roles.map((role) => {
                    const isChecked = visibility[menuKey]?.[role] ?? false
                    const isDisabled = role === 'admin'
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(menuKey, role)}
                            disabled={isDisabled}
                            className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </label>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
