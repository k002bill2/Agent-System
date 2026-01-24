import { useEffect } from 'react'
import { Server, Bot, Sparkles, Webhook, FolderCode } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { useProjectConfigsStore } from '../stores/projectConfigs'

const COLORS = {
  mcp: '#10B981',      // green
  agents: '#3B82F6',   // blue
  skills: '#8B5CF6',   // purple
  hooks: '#F97316',    // orange
}

export function ProjectConfigStats() {
  const { projects, fetchProjects, isLoading } = useProjectConfigsStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Calculate total stats across all projects
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

  // Data for pie chart
  const pieData = [
    { name: 'MCP Servers', value: totals.mcp, color: COLORS.mcp },
    { name: 'Agents', value: totals.agents, color: COLORS.agents },
    { name: 'Skills', value: totals.skills, color: COLORS.skills },
    { name: 'Hooks', value: totals.hooks, color: COLORS.hooks },
  ].filter(d => d.value > 0)

  // Data for bar chart (per project)
  const barData = projects.map(project => ({
    name: project.project_name.length > 12
      ? project.project_name.slice(0, 12) + '...'
      : project.project_name,
    fullName: project.project_name,
    mcp: project.mcp_server_count,
    agents: project.agent_count,
    skills: project.skill_count,
    hooks: project.hook_count,
  }))

  const totalCount = pieData.reduce((sum, d) => sum + d.value, 0)

  if (isLoading) {
    return (
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 h-72 animate-pulse" />
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 h-72 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="mt-6">
      {/* Section Header */}
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <FolderCode className="w-5 h-5" />
        Project Configurations
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stats Summary Cards */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Total Configuration Items
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatItem icon={Server} label="MCP Servers" count={totals.mcp} color="text-green-600" bgColor="bg-green-100 dark:bg-green-900/30" />
            <StatItem icon={Bot} label="Agents" count={totals.agents} color="text-blue-600" bgColor="bg-blue-100 dark:bg-blue-900/30" />
            <StatItem icon={Sparkles} label="Skills" count={totals.skills} color="text-purple-600" bgColor="bg-purple-100 dark:bg-purple-900/30" />
            <StatItem icon={Webhook} label="Hooks" count={totals.hooks} color="text-orange-600" bgColor="bg-orange-100 dark:bg-orange-900/30" />
          </div>

          {/* Donut Chart with Side Labels */}
          {totalCount > 0 ? (
            <div className="flex items-center gap-6">
              {/* Donut Chart - Left */}
              <div className="w-36 h-36 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'white',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Labels - Right */}
              <div className="flex-1 space-y-2">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {item.value}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({((item.value / totalCount) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-36 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No configuration data available
            </div>
          )}
        </div>

        {/* Per-Project Bar Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Configuration by Project ({projects.length} projects)
          </h3>

          {barData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(17, 24, 39, 0.9)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                    }}
                    formatter={(value) => [value, '']}
                    labelFormatter={(_, payload) => {
                      const item = payload?.[0]?.payload
                      return item?.fullName || ''
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
                  />
                  <Bar dataKey="mcp" stackId="a" fill={COLORS.mcp} name="mcp" />
                  <Bar dataKey="agents" stackId="a" fill={COLORS.agents} name="agents" />
                  <Bar dataKey="skills" stackId="a" fill={COLORS.skills} name="skills" />
                  <Bar dataKey="hooks" stackId="a" fill={COLORS.hooks} name="hooks" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No projects registered
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
