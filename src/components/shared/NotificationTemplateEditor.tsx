import { useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, Eye, Code } from 'lucide-react'

interface NotificationTemplateEditorProps {
  htmlBody: string
  onHtmlBodyChange: (value: string) => void
  availableVariables: Record<string, string>
  activeTab: 'edit' | 'preview'
  onTabChange: (tab: 'edit' | 'preview') => void
  readOnly?: boolean
}

export function NotificationTemplateEditor({
  htmlBody,
  onHtmlBodyChange,
  availableVariables,
  activeTab,
  onTabChange,
  readOnly = false,
}: NotificationTemplateEditorProps) {
  // Generate preview HTML with placeholder values
  const previewHtml = useMemo(() => {
    let html = htmlBody

    // Replace variables with placeholder values
    Object.keys(availableVariables).forEach((key) => {
      const placeholder = `[${key}]`
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), placeholder)
    })

    return html
  }, [htmlBody, availableVariables])

  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as 'edit' | 'preview')}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="edit" className="flex items-center gap-2">
          <Code className="h-4 w-4" />
          {readOnly ? 'View HTML' : 'Edit HTML'}
        </TabsTrigger>
        <TabsTrigger value="preview" className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Preview
        </TabsTrigger>
      </TabsList>
      <TabsContent value="edit" className="mt-4">
        <div className="relative">
          <textarea
            value={htmlBody}
            onChange={(e) => onHtmlBodyChange(e.target.value)}
            readOnly={readOnly}
            className="w-full min-h-[400px] p-4 font-mono text-sm bg-muted/50 border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="HTML body content..."
            style={{ fontFamily: "'Courier New', Consolas, monospace" }}
          />
        </div>
      </TabsContent>
      <TabsContent value="preview" className="mt-4">
        <div className="border rounded-md overflow-hidden">
          <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Preview uses placeholder values for variables.
          </div>
          <iframe
            srcDoc={previewHtml}
            sandbox="allow-same-origin"
            className="w-full min-h-[400px] bg-white"
            title="Email Preview"
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}
