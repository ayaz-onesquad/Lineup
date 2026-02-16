import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { documentsApi } from '@/services/api/documents'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import type { DocumentWithRelations } from '@/types/database'
import {
  FileText,
  Download,
  FileImage,
  FileSpreadsheet,
  FileCode,
  File,
} from 'lucide-react'

interface PortalDocumentsGridProps {
  documents: DocumentWithRelations[]
}

const getFileIcon = (fileType?: string | null) => {
  if (!fileType) return File

  const type = fileType.toLowerCase()
  if (type.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(type)) {
    return FileImage
  }
  if (type.includes('pdf') || type.includes('document')) {
    return FileText
  }
  if (type.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(type)) {
    return FileSpreadsheet
  }
  if (type.includes('code') || ['js', 'ts', 'jsx', 'tsx', 'json'].includes(type)) {
    return FileCode
  }
  return FileText
}

export function PortalDocumentsGrid({ documents }: PortalDocumentsGridProps) {
  const { toast } = useToast()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownload = async (doc: DocumentWithRelations) => {
    if (!doc.file_url) {
      toast({
        title: 'Error',
        description: 'No file available for download',
        variant: 'destructive',
      })
      return
    }

    try {
      setDownloadingId(doc.id)
      const signedUrl = await documentsApi.getSignedUrl(doc.file_url)
      window.open(signedUrl, '_blank')
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: error instanceof Error ? error.message : 'Failed to download document',
        variant: 'destructive',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No documents are currently shared with you.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {documents.map((doc) => {
              const FileIcon = getFileIcon(doc.file_type)
              const isDownloading = downloadingId === doc.id

              return (
                <Card
                  key={doc.id}
                  className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleDownload(doc)}
                >
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <FileIcon className="h-8 w-8 text-primary" />
                    </div>

                    <div className="w-full space-y-1">
                      <p className="font-medium truncate text-sm" title={doc.name}>
                        {doc.name}
                      </p>

                      {doc.document_catalog && (
                        <Badge variant="outline" className="text-xs">
                          {doc.document_catalog.name}
                        </Badge>
                      )}

                      <p className="text-xs text-muted-foreground">
                        {formatDate(doc.uploaded_at)}
                      </p>

                      {doc.uploader && (
                        <p className="text-xs text-muted-foreground">
                          by {doc.uploader.full_name}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={isDownloading}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownload(doc)
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {isDownloading ? 'Downloading...' : 'Download'}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
