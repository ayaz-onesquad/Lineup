---
phase: quick-02
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/api/documents.ts
  - src/components/shared/DocumentsTable.tsx
  - src/components/shared/DocumentViewCard.tsx
  - src/components/portal/PortalDocumentsGrid.tsx
autonomous: true

must_haves:
  truths:
    - "Clicking download triggers actual file save dialog, not browser render"
    - "Downloaded .md and .txt files have correct UTF-8 encoding"
    - "Downloaded .docx/.xlsx files are not corrupted"
  artifacts:
    - path: "src/services/api/documents.ts"
      provides: "downloadFile() helper with fetch+blob pattern"
      exports: ["downloadFile"]
    - path: "src/components/shared/DocumentsTable.tsx"
      provides: "Uses downloadFile() for downloads"
    - path: "src/components/shared/DocumentViewCard.tsx"
      provides: "Uses downloadFile() for downloads"
    - path: "src/components/portal/PortalDocumentsGrid.tsx"
      provides: "Uses downloadFile() for downloads"
  key_links:
    - from: "All download handlers"
      to: "documentsApi.downloadFile()"
      via: "async function call"
      pattern: "downloadFile\\(signedUrl"
---

<objective>
Fix document download bugs: (1) files rendering inline instead of downloading, (2) text files showing encoding corruption.

Purpose: Users need to actually download files, not view them in browser. Text files must preserve UTF-8 encoding.

Output: Working download functionality across all document components.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/services/api/documents.ts
@src/components/shared/DocumentsTable.tsx
@src/components/shared/DocumentViewCard.tsx
@src/components/portal/PortalDocumentsGrid.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create downloadFile helper in documents API</name>
  <files>src/services/api/documents.ts</files>
  <action>
Add a new `downloadFile` function to `documentsApi` that properly forces download:

```typescript
/**
 * Download a file using fetch+blob pattern to force actual download
 * (not browser rendering) and preserve encoding
 */
downloadFile: async (signedUrl: string, fileName: string): Promise<void> => {
  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

Keep the existing `download()` method but mark it as deprecated with a comment. The new method:
- Uses fetch() to get the file as a Blob (preserves binary data)
- Creates object URL from blob
- Uses anchor element with `download` attribute (NO `target="_blank"`)
- Cleans up object URL after download starts
  </action>
  <verify>TypeScript compiles: `npm run build` passes</verify>
  <done>documentsApi.downloadFile() exists and is exported</done>
</task>

<task type="auto">
  <name>Task 2: Update all download handlers to use downloadFile</name>
  <files>src/components/shared/DocumentsTable.tsx, src/components/shared/DocumentViewCard.tsx, src/components/portal/PortalDocumentsGrid.tsx</files>
  <action>
Update each component's download handler:

**DocumentsTable.tsx** - `handleDownload` function (around line 159-182):
- Replace anchor element approach with: `await documentsApi.downloadFile(url, doc.name)`
- Remove the manual anchor creation code

**DocumentViewCard.tsx** - `handleDownload` function (around line 87-104):
- Replace `window.open(signedUrl, '_blank')` with: `await documentsApi.downloadFile(signedUrl, document.name)`

**PortalDocumentsGrid.tsx** - `handleDownload` function (around line 45-68):
- Replace `window.open(signedUrl, '_blank')` with: `await documentsApi.downloadFile(signedUrl, doc.name)`

Each handler pattern should be:
```typescript
const handleDownload = async () => {
  if (!doc.file_url) return
  setDownloadLoading(true)
  try {
    const signedUrl = await documentsApi.getSignedUrl(doc.file_url)
    await documentsApi.downloadFile(signedUrl, doc.name)
  } catch (error) {
    console.error('Download failed:', error)
    toast({ title: 'Download failed', ... })
  } finally {
    setDownloadLoading(false)
  }
}
```
  </action>
  <verify>
Build passes: `npm run build`
Test manually: Upload a .md file, download it, verify it saves to disk (not opens in browser) with correct encoding
  </verify>
  <done>All three components use downloadFile() helper; window.open pattern removed from download handlers</done>
</task>

</tasks>

<verification>
1. `npm run build` - no TypeScript errors
2. Manual test: Upload a .md or .txt file, click download, file saves to disk
3. Manual test: Upload a .docx file, click download, file opens correctly in Word
4. Visual test: Download button shows loading state during download
</verification>

<success_criteria>
- Downloads trigger save dialog instead of opening in browser
- Text files (.md, .txt) preserve UTF-8 encoding
- Binary files (.docx, .xlsx, .pdf) are not corrupted
- No regressions in View functionality (still uses window.open)
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-file-encoding-corruption-and-inline-/2-SUMMARY.md`
</output>
