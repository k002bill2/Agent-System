import { useEffect } from 'react'
import { Server, Bot, Sparkles, Webhook } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { useProjectConfigsStore } from '../stores/projectConfigs'

const COLORS = {
  mcp: '#10B981',      // green
  agents: '#3B82F6',   // blue
  skills: '#8B5CF6',   // purple
  hooks: '#F97316',    // orange
}

// Total Configuration Items 카드 (별도 컴포넌트)
export function ConfigStatsCard() {
  const { projects, fetchProjects, isLoading } = useProjectConfigsStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const totals = projects.reduce(
    (acc, project) => {
      acc.mcp += project.mcp_server_count
      acc.agents += project.agent_count
      acc.skills += project.skill_count
      acc.hooks += project.hook_count
      return acc
    },
    { mcp: 0, agents: 0, skills: 0, hooks: 0 }
  )

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Total Configuration Items
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <StatItem icon={Server} label="MCP Servers" count={totals.mcp} color="text-green-600" bgColor="bg-green-100 dark:bg-green-900/30" />
        <StatItem icon={Bot} label="Agents" count={totals.agents} color="text-blue-600" bgColor="bg-blue-100 dark:bg-blue-900/30" />
        <StatItem icon={Sparkles} label="Skills" count={totals.skills} color="text-purple-600" bgColor="bg-purple-100 dark:bg-purple-900/30" />
        <StatItem icon={Webhook} label="Hooks" count={totals.hooks} color="text-orange-600" bgColor="bg-orange-100 dark:bg-orange-900/30" />
      </div>
    </div>
  )
}

// Configuration by Project 차트 카드 (별도 컴포넌트)
export function ConfigChartCard() {
  const { projects, isLoading } = useProjectConfigsStore()

  const barData = projects.map(project => ({
    name: project.project_name.length > 18
      ? project.project_name.slice(0, 18) + '...'
      : project.project_name,
    fullName: project.project_name,
    mcp: project.mcp_server_count,
    agents: project.agent_count,
    skills: project.skill_count,
    hooks: project.hook_count,
  }))

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-56 animate-pulse" />
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Configuration by Project ({projects.length} projects)
      </h3>

      {barData.length > 0 ? (
        <div style={{ height: Math.max(240, barData.length * 50) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(17, 24, 39, 0.9)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: 12,
                }}
                formatter={(value, name) => [value, (name as string).charAt(0).toUpperCase() + (name as string).slice(1)]}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload
                  return item?.fullName || ''
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10 }}
                formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
              />
              <Bar dataKey="mcp" fill={COLORS.mcp} name="mcp" radius={[0, 4, 4, 0]} />
              <Bar dataKey="agents" fill={COLORS.agents} name="agents" radius={[0, 4, 4, 0]} />
              <Bar dataKey="skills" fill={COLORS.skills} name="skills" radius={[0, 4, 4, 0]} />
              <Bar dataKey="hooks" fill={COLORS.hooks} name="hooks" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-40 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
          No projects registered
        </div>
      )}
    </div>
  )
}

// 하위 호환성을 위한 기존 컴포넌트 (사용 안 함)
export function ProjectConfigStats() {
  return null
}

interface StatItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  color: string
  bgColor: string
}

function StatItem({ icon: Icon, label, count, color, bgColor }: StatItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${bgColor}`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{count}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  )
}
