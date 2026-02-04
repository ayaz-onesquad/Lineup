interface PhaseDetailProps {
  id: string
}

export function PhaseDetail({ id }: PhaseDetailProps) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Phase detail for {id}</p>
    </div>
  )
}
