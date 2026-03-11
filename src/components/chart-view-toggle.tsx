import { Radar, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChartView } from '@/hooks/use-chart-view'

interface ChartViewToggleProps {
  view: ChartView
  onChange: (view: ChartView) => void
}

export default function ChartViewToggle({ view, onChange }: ChartViewToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-border">
      <Button
        variant={view === 'radar' ? 'default' : 'ghost'}
        size="sm"
        className="gap-1.5 rounded-r-none text-xs"
        onClick={() => onChange('radar')}
      >
        <Radar className="h-3.5 w-3.5" />
        Radar
      </Button>
      <Button
        variant={view === 'barres' ? 'default' : 'ghost'}
        size="sm"
        className="gap-1.5 rounded-l-none text-xs"
        onClick={() => onChange('barres')}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Barres
      </Button>
    </div>
  )
}
