import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MultiPosteEntry { posteId: string; posteTitre: string; tauxPoste: number }

export default function MultiPosteCard({ entries }: { entries: MultiPosteEntry[] }) {
  if (entries.length === 0) return null
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Compatibilité autres postes du pôle</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {entries.sort((a, b) => b.tauxPoste - a.tauxPoste).map(e => (
            <div key={e.posteId} className="flex items-center justify-between py-1">
              <span className="text-sm">{e.posteTitre}</span>
              <span className="text-sm font-bold">{e.tauxPoste}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
