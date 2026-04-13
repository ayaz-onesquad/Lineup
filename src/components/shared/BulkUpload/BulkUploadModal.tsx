/**
 * BulkUploadModal
 * 3-step wizard for bulk importing records from Excel/CSV or pasted data
 */

import { useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, ClipboardPaste } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

import { DataPreviewTable } from './DataPreviewTable'
import { ColumnMapper } from './ColumnMapper'
import {
  parseExcelFile,
  parsePastedTable,
  fuzzyMatchColumns,
  validateData,
  resolveReferences,
  generateErrorReport,
  downloadCSV,
  ENTITY_FIELD_DEFINITIONS,
  ENTITY_DISPLAY_NAMES,
  MAX_ROWS,
  type BulkUploadEntityType,
  type ParsedData,
  type ValidationResult,
} from '@/lib/bulkUpload'
import { supabase } from '@/services/supabase'
import { useTenantStore } from '@/stores'

import { useSetMutations } from '@/hooks/useSets'
import { usePitchMutations } from '@/hooks/usePitches'
import { useRequirementMutations } from '@/hooks/useRequirements'
import { usePhaseMutations } from '@/hooks/usePhases'
import { useProjectMutations } from '@/hooks/useProjects'
import { useClientMutations } from '@/hooks/useClients'
import { useContactMutations } from '@/hooks/useContacts'
import type {
  CreateSetInput,
  CreatePitchInput,
  CreateRequirementInput,
  CreatePhaseInput,
  CreateProjectInput,
  CreateClientInput,
  CreateContactInput,
} from '@/types/database'

interface BulkUploadModalProps {
  isOpen: boolean
  onClose: () => void
  defaultEntity?: BulkUploadEntityType
  /** Pre-fill context values (e.g., client_id, set_id) that will be applied to all imported records */
  contextValues?: Record<string, string>
}

type ImportStep = 'input' | 'mapping' | 'import'

interface ImportProgress {
  total: number
  completed: number
  failed: number
  inProgress: boolean
}

const ENTITY_OPTIONS = [
  { value: 'sets', label: 'Sets' },
  { value: 'pitches', label: 'Pitches' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'phases', label: 'Phases' },
  { value: 'projects', label: 'Projects' },
  { value: 'clients', label: 'Clients' },
  { value: 'contacts', label: 'Contacts' },
]

export function BulkUploadModal({
  isOpen,
  onClose,
  defaultEntity = 'sets',
  contextValues = {},
}: BulkUploadModalProps) {
  // State
  const [step, setStep] = useState<ImportStep>('input')
  const [entityType, setEntityType] = useState<BulkUploadEntityType>(defaultEntity)
  const [inputMethod, setInputMethod] = useState<'upload' | 'paste'>('upload')
  const [pastedData, setPastedData] = useState('')
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [mappings, setMappings] = useState<Record<string, string | null>>({})
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [progress, setProgress] = useState<ImportProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: false,
  })
  const [importErrors, setImportErrors] = useState<Array<{ row: number; error: string }>>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tenant
  const { currentTenant } = useTenantStore()

  // Mutations
  const { createSet } = useSetMutations()
  const { createPitch } = usePitchMutations()
  const { createRequirement } = useRequirementMutations()
  const { createPhase } = usePhaseMutations()
  const { createProject } = useProjectMutations()
  const { createClient } = useClientMutations()
  const { createContact } = useContactMutations()

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setStep('input')
    setParsedData(null)
    setMappings({})
    setValidation(null)
    setPastedData('')
    setProgress({ total: 0, completed: 0, failed: 0, inProgress: false })
    setImportErrors([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClose()
  }, [onClose])

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = await parseExcelFile(file)

      if (data.rows.length > MAX_ROWS) {
        toast({
          title: 'Too many rows',
          description: `Maximum ${MAX_ROWS} rows allowed. Your file has ${data.rows.length} rows.`,
          variant: 'destructive',
        })
        return
      }

      setParsedData(data)
      const autoMappings = fuzzyMatchColumns(
        data.headers,
        ENTITY_FIELD_DEFINITIONS[entityType]
      )
      setMappings(autoMappings)
      setStep('mapping')
    } catch (error) {
      toast({
        title: 'Failed to parse file',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  // Handle pasted data
  const handleParsePaste = () => {
    if (!pastedData.trim()) {
      toast({
        title: 'No data',
        description: 'Please paste your data first.',
        variant: 'destructive',
      })
      return
    }

    try {
      const data = parsePastedTable(pastedData)

      if (data.rows.length === 0) {
        toast({
          title: 'No data rows',
          description: 'The pasted content has no data rows.',
          variant: 'destructive',
        })
        return
      }

      if (data.rows.length > MAX_ROWS) {
        toast({
          title: 'Too many rows',
          description: `Maximum ${MAX_ROWS} rows allowed. Your data has ${data.rows.length} rows.`,
          variant: 'destructive',
        })
        return
      }

      setParsedData(data)
      const autoMappings = fuzzyMatchColumns(
        data.headers,
        ENTITY_FIELD_DEFINITIONS[entityType]
      )
      setMappings(autoMappings)
      setStep('mapping')
    } catch (error) {
      toast({
        title: 'Failed to parse data',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  // Validate and proceed to import
  const handleValidate = () => {
    if (!parsedData) return

    const result = validateData(parsedData, mappings, entityType)
    setValidation(result)
    setStep('import')
  }

  // Execute the import
  const handleImport = async () => {
    if (!validation || validation.validRows.length === 0 || !currentTenant?.id) return

    setProgress({
      total: validation.validRows.length,
      completed: 0,
      failed: 0,
      inProgress: true,
    })
    setImportErrors([])

    const errors: Array<{ row: number; error: string }> = []

    // Step 1: Resolve display_id and name references to UUIDs
    const { resolvedRows, errors: resolutionErrors } = await resolveReferences(
      validation.validRows,
      entityType,
      currentTenant.id,
      supabase
    )

    // Add resolution errors
    for (const err of resolutionErrors) {
      errors.push({ row: err.row, error: `${err.field}: ${err.message}` })
    }

    // If all rows failed resolution, stop here
    if (resolvedRows.length === 0) {
      setProgress({
        total: validation.validRows.length,
        completed: 0,
        failed: validation.validRows.length,
        inProgress: false,
      })
      setImportErrors(errors)
      toast({
        title: 'Import failed',
        description: 'Could not resolve any references. Check that display IDs or names exist.',
        variant: 'destructive',
      })
      return
    }

    // Step 2: Process resolved rows with Promise.allSettled for partial success
    const results = await Promise.allSettled(
      resolvedRows.map(async (rowData, idx) => {
        // Merge context values (client_id, set_id, etc.)
        const mergedData = { ...contextValues, ...rowData }

        try {
          switch (entityType) {
            case 'sets':
              await createSet.mutateAsync(mergedData as CreateSetInput)
              break
            case 'pitches':
              await createPitch.mutateAsync(mergedData as CreatePitchInput)
              break
            case 'requirements':
              await createRequirement.mutateAsync(mergedData as CreateRequirementInput)
              break
            case 'phases':
              await createPhase.mutateAsync(mergedData as CreatePhaseInput)
              break
            case 'projects':
              await createProject.mutateAsync(mergedData as CreateProjectInput)
              break
            case 'clients':
              await createClient.mutateAsync(mergedData as CreateClientInput)
              break
            case 'contacts':
              await createContact.mutateAsync(mergedData as CreateContactInput)
              break
          }
          return { success: true, idx }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          errors.push({ row: idx + 1, error: errorMsg })
          return { success: false, idx, error: errorMsg }
        }
      })
    )

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value.success
    ).length
    const totalFailed = validation.validRows.length - succeeded

    setProgress({
      total: validation.validRows.length,
      completed: succeeded,
      failed: totalFailed,
      inProgress: false,
    })
    setImportErrors(errors)

    if (succeeded > 0) {
      toast({
        title: 'Import complete',
        description: `${succeeded} ${ENTITY_DISPLAY_NAMES[entityType].toLowerCase()} imported successfully${totalFailed > 0 ? `, ${totalFailed} failed` : ''}.`,
      })
    }

    if (totalFailed === 0) {
      // All succeeded, close modal after a brief delay
      setTimeout(handleClose, 1500)
    }
  }

  // Download error report
  const handleDownloadErrors = () => {
    if (!parsedData || !validation) return

    const report = generateErrorReport(parsedData, validation.errors)
    downloadCSV(report, `import-errors-${entityType}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  // Download runtime errors report
  const handleDownloadImportErrors = () => {
    if (importErrors.length === 0) return

    const lines = ['Row,Error']
    importErrors.forEach(({ row, error }) => {
      lines.push(`${row},"${error.replace(/"/g, '""')}"`)
    })
    downloadCSV(lines.join('\n'), `import-runtime-errors-${entityType}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  // Step indicator
  const renderStepIndicator = () => {
    const steps = [
      { key: 'input', label: 'Select & Upload', number: 1 },
      { key: 'mapping', label: 'Map Columns', number: 2 },
      { key: 'import', label: 'Import', number: 3 },
    ]

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center">
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                step === s.key
                  ? 'bg-primary text-primary-foreground'
                  : steps.findIndex((x) => x.key === step) > idx
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {s.number}
            </div>
            <span
              className={cn(
                'ml-2 text-sm hidden sm:inline',
                step === s.key ? 'font-medium' : 'text-muted-foreground'
              )}
            >
              {s.label}
            </span>
            {idx < steps.length - 1 && (
              <div className="w-8 sm:w-12 h-px bg-border mx-2" />
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import</DialogTitle>
          <DialogDescription>
            Import multiple records from an Excel file or pasted data
          </DialogDescription>
        </DialogHeader>

        {renderStepIndicator()}

        {/* Step 1: Select Entity & Input */}
        {step === 'input' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <SearchableSelect
                options={ENTITY_OPTIONS}
                value={entityType}
                onValueChange={(val) => val && setEntityType(val as BulkUploadEntityType)}
                placeholder="Select entity type..."
              />
            </div>

            <Tabs value={inputMethod} onValueChange={(v) => setInputMethod(v as 'upload' | 'paste')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload" className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Upload Excel/CSV
                </TabsTrigger>
                <TabsTrigger value="paste" className="flex items-center gap-2">
                  <ClipboardPaste className="h-4 w-4" />
                  Paste Table
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload an Excel (.xlsx) or CSV file with headers in the first row
                  </p>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="max-w-xs mx-auto"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Maximum {MAX_ROWS} rows per import
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="paste" className="mt-4 space-y-4">
                <div>
                  <Label>Paste data from Excel or Google Sheets</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Select cells in your spreadsheet (including headers), copy, and paste here
                  </p>
                  <Textarea
                    value={pastedData}
                    onChange={(e) => setPastedData(e.target.value)}
                    placeholder="Paste your table data here (tab-separated)..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <Button onClick={handleParsePaste} disabled={!pastedData.trim()}>
                  Parse Data
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Step 2: Preview & Mapping */}
        {step === 'mapping' && parsedData && (
          <div className="space-y-6">
            <div>
              <h3 className="font-medium mb-2">Data Preview</h3>
              <DataPreviewTable headers={parsedData.headers} rows={parsedData.rows} />
            </div>

            <div>
              <h3 className="font-medium mb-2">Column Mapping</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Map your source columns to {ENTITY_DISPLAY_NAMES[entityType]} fields.
                Auto-suggested mappings are pre-filled based on column names.
              </p>
              <ColumnMapper
                sourceColumns={parsedData.headers}
                entityType={entityType}
                mappings={mappings}
                onChange={setMappings}
              />
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('input')
                  setParsedData(null)
                  setMappings({})
                }}
              >
                Back
              </Button>
              <Button onClick={handleValidate}>Validate & Continue</Button>
            </div>
          </div>
        )}

        {/* Step 3: Validation & Import */}
        {step === 'import' && validation && (
          <div className="space-y-6">
            {/* Validation Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div
                className={cn(
                  'p-4 rounded-lg border',
                  validation.validRows.length > 0
                    ? 'bg-green-50 border-green-200'
                    : 'bg-muted'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Ready to Import</span>
                </div>
                <p className="text-2xl font-bold">{validation.validRows.length}</p>
                <p className="text-sm text-muted-foreground">rows</p>
              </div>

              <div
                className={cn(
                  'p-4 rounded-lg border',
                  validation.errors.length > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-muted'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium">Errors</span>
                </div>
                <p className="text-2xl font-bold">{validation.errors.length}</p>
                <p className="text-sm text-muted-foreground">issues found</p>
              </div>
            </div>

            {/* Error Details */}
            {validation.errors.length > 0 && (
              <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-red-700">Validation Errors</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadErrors}
                    className="text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download Report
                  </Button>
                </div>
                <ul className="space-y-1 text-sm">
                  {validation.errors.slice(0, 10).map((err, idx) => (
                    <li key={idx} className="text-red-600">
                      Row {err.row}: {err.message}
                      {err.value && (
                        <span className="text-muted-foreground ml-1">
                          (value: "{err.value}")
                        </span>
                      )}
                    </li>
                  ))}
                  {validation.errors.length > 10 && (
                    <li className="text-muted-foreground">
                      ... and {validation.errors.length - 10} more errors
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Import Progress */}
            {progress.inProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importing...</span>
                  <span>
                    {progress.completed + progress.failed} / {progress.total}
                  </span>
                </div>
                <Progress
                  value={((progress.completed + progress.failed) / progress.total) * 100}
                />
              </div>
            )}

            {/* Import Results */}
            {!progress.inProgress && progress.total > 0 && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted">
                  <h4 className="font-medium mb-2">Import Results</h4>
                  <div className="flex gap-6">
                    <div>
                      <span className="text-green-600 font-bold">{progress.completed}</span>
                      <span className="text-sm text-muted-foreground ml-1">succeeded</span>
                    </div>
                    <div>
                      <span className="text-red-600 font-bold">{progress.failed}</span>
                      <span className="text-sm text-muted-foreground ml-1">failed</span>
                    </div>
                  </div>
                </div>

                {importErrors.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-red-700">Import Errors</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadImportErrors}
                        className="text-xs"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                    <ul className="space-y-1 text-sm max-h-32 overflow-y-auto">
                      {importErrors.slice(0, 5).map(({ row, error }, idx) => (
                        <li key={idx} className="text-red-600">
                          Row {row}: {error}
                        </li>
                      ))}
                      {importErrors.length > 5 && (
                        <li className="text-muted-foreground">
                          ... and {importErrors.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('mapping')
                  setValidation(null)
                  setProgress({ total: 0, completed: 0, failed: 0, inProgress: false })
                  setImportErrors([])
                }}
                disabled={progress.inProgress}
              >
                Back
              </Button>
              <div className="flex gap-2">
                {progress.total > 0 && !progress.inProgress && (
                  <Button variant="outline" onClick={handleClose}>
                    Close
                  </Button>
                )}
                {(progress.total === 0 || progress.inProgress) && (
                  <Button
                    onClick={handleImport}
                    disabled={
                      validation.validRows.length === 0 || progress.inProgress
                    }
                  >
                    {progress.inProgress ? (
                      <>Importing...</>
                    ) : (
                      <>Import {validation.validRows.length} Records</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
