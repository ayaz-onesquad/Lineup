import { Button } from '@/components/ui/button'

interface PhaseFormProps {
  onSuccess?: () => void
}

export function PhaseForm({ onSuccess }: PhaseFormProps) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Phase form coming soon</p>
      <Button onClick={onSuccess}>Close</Button>
    </div>
  )
}
