import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyableErrorProps {
  title?: string
  message: string
  details?: string
  className?: string
}

export function CopyableError({ title = 'Error', message, details, className }: CopyableErrorProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const textToCopy = details ? `${message}\n\nDetails:\n${details}` : message
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = textToCopy
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Alert variant="destructive" className={cn('relative', className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        {title}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-destructive-foreground hover:bg-destructive-foreground/10"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm select-all cursor-text">{message}</p>
        {details && (
          <pre className="mt-2 p-2 bg-destructive-foreground/10 rounded text-xs overflow-auto max-h-32 select-all cursor-text">
            {details}
          </pre>
        )}
      </AlertDescription>
    </Alert>
  )
}
