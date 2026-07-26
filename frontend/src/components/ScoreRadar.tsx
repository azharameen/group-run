import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

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

export default function ScoreRadar({ breakdown, size = 300 }: Props) {
  const data = ALL_CRITERIA.map((key) => ({
    criterion: CRITERIA_LABELS[key] || key,
    score: breakdown?.[key] ?? 0,
    fullMark: 100,
  }))

  return (
    <ResponsiveContainer width="100%" height={size}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 10, fill: '#6b7280' }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip
          formatter={(value: number) => [`${value}/100`, 'Score']}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Radar
          name="Score"
          dataKey="score"
          stroke="#009999"
          fill="#009999"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
