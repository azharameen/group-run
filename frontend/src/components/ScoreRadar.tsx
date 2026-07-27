import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const ALL_CRITERIA = [
  'novelty',
  'siemens_alignment',
  'technical_feasibility',
  'detectability',
  'business_value',
  'originality',
  'completeness',
]

const CRITERIA_LABELS: Record<string, string> = {
  novelty: 'Novelty',
  siemens_alignment: 'Siemens Align.',
  technical_feasibility: 'Feasibility',
  detectability: 'Detectability',
  business_value: 'Business Value',
  originality: 'Originality',
  completeness: 'Completeness',
}

interface Props {
  breakdown: Record<string, number>
  size?: number
}

export default function ScoreRadar({ breakdown, size = 280 }: Props) {
  const data = ALL_CRITERIA.map((key) => ({
    criterion: CRITERIA_LABELS[key] || key,
    score: breakdown?.[key] ?? 0,
    fullMark: 100,
  }))

  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm font-semibold">Criteria Radar Score</CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <ResponsiveContainer width="100%" height={size}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip
              formatter={(value: number) => [`${value}/100`, 'Score']}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderColor: 'hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
