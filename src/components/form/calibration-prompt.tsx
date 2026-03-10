import { Card, CardContent } from '@/components/ui/card'

interface CalibrationPromptProps {
  text: string
}

export default function CalibrationPrompt({ text }: CalibrationPromptProps) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <p className="text-sm leading-relaxed italic text-muted-foreground">
          <span className="mr-1 not-italic font-medium text-primary">
            Avant de noter :
          </span>
          {text}
        </p>
      </CardContent>
    </Card>
  )
}
