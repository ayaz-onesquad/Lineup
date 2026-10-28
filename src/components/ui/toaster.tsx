import { useState } from "react"
import { Check, Copy } from "lucide-react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { toastText, useToast } from "@/hooks/use-toast"

/** Copies the error with the page and time, ready to paste into a ticket. */
function CopyErrorButton({ title, description }: { title: string; description: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const text = [
      title,
      description,
      "",
      `Page: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
    ]
      .filter((line, i) => line || i === 2)
      .join("\n")
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Older browsers / insecure contexts: fall back to a hidden textarea.
      const area = document.createElement("textarea")
      area.value = text
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      document.execCommand("copy")
      area.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      // Stop the toast's swipe-to-dismiss from treating the tap as a drag.
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-white/40 px-2.5 text-xs font-medium opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/70 coarse:h-11 coarse:px-3"
      aria-label="Copy error details"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy error"}
    </button>
  )
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const isError = props.variant === "destructive"
        return (
          <Toast key={id} {...props}>
            <div className="grid min-w-0 gap-1 select-text">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription className="break-words">{description}</ToastDescription>
              )}
              {isError && (
                <CopyErrorButton title={toastText(title)} description={toastText(description)} />
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
