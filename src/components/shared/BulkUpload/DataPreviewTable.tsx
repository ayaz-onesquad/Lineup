/**
 * DataPreviewTable
 * Shows first N rows of parsed data for user review before import
 */

interface DataPreviewTableProps {
  headers: string[]
  rows: string[][]
  maxRows?: number
}

export function DataPreviewTable({
  headers,
  rows,
  maxRows = 5,
}: DataPreviewTableProps) {
  const displayRows = rows.slice(0, maxRows)

  if (headers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No data to preview
      </div>
    )
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">
                #
              </th>
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-3 py-2 text-left font-medium truncate max-w-[200px]"
                  title={header}
                >
                  {header || `Column ${idx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                  {rowIdx + 1}
                </td>
                {headers.map((_, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-3 py-2 truncate max-w-[200px]"
                    title={row[colIdx] || ''}
                  >
                    {row[colIdx] || (
                      <span className="text-muted-foreground italic">empty</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > maxRows && (
        <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/30 border-t">
          Showing {maxRows} of {rows.length} rows
        </div>
      )}
    </div>
  )
}
