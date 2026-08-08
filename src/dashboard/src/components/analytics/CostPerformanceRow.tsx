/**
 * Cost by Model · Model Performance 2열 그리드 — AnalyticsPage 내부 전용.
 */

import { DollarSign, Users } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from './ChartCard'
import { CHART_COLORS } from './constants'
import type { AgentPerformance, CostBreakdown } from './types'

interface CostPerformanceRowProps {
  costsByModel: CostBreakdown[]
  modelPerformanceData: AgentPerformance[]
}

export function CostPerformanceRow({ costsByModel, modelPerformanceData }: CostPerformanceRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Cost by Model */}
      <ChartCard title="Cost by Model" icon={DollarSign}>
        <ResponsiveContainer width="100%" height={250} debounce={80}>
          <PieChart>
            <Pie
              data={costsByModel}
              cx="35%"
              cy="50%"
              innerRadius={70}
              outerRadius={90}
              paddingAngle={2}
              dataKey="cost"
              nameKey="value"
              label={({ value }) => `$${value.toFixed(2)}`}
            >
              {costsByModel.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, #fff)',
                borderColor: 'var(--tooltip-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '8px 12px',
              }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cost']}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: '12px', paddingLeft: '8px', left: '60%' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Model Performance */}
      <ChartCard title="Model Performance" icon={Users}>
        <ResponsiveContainer width="100%" height={250} debounce={80}>
          <BarChart data={modelPerformanceData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="agent_name"
              width={150}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, #fff)',
                borderColor: 'var(--tooltip-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '8px 12px',
              }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Success Rate']}
            />
            <Bar dataKey="success_rate" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
