import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssignedByMeRequirements } from '@/hooks/useMyWork'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Users, Calendar, Inbox } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { getStatusLabel, getStatusColor, computeRequirementStatus, isPastDueStatus } from '@/utils/statusUtils'
import { cn } from '@/lib/utils'

export function AssignedByMeWidget() {
  const navigate = useNavigate()
  const { data, isLoading } = useAssignedByMeRequirements(50)
  const [activeTab, setActiveTab] = useState<'active' | 'past_due'>('active')

  const items = activeTab === 'active' ? data?.active || [] : data?.pastDue || []
  const pastDueCount = data?.pastDue?.length || 0

  const getInitials = (name?: string) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card className="relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-100" />
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-100">
              <Users className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">Tasks I Assigned</CardTitle>
              <CardDescription>Track work you've delegated to others</CardDescription>
            </div>
          </div>
          {pastDueCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {pastDueCount} Past Due
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'past_due')}>
          <div className="px-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active" className="flex items-center gap-2">
                Active ({data?.active?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="past_due" className="flex items-center gap-2">
                Past Due
                {pastDueCount > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                    {pastDueCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            <ScrollArea className="h-[350px]">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !items.length ? (
                <div className="text-center text-muted-foreground py-12 px-4">
                  <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">
                    {activeTab === 'past_due' ? 'No past due tasks' : 'No tasks assigned to others'}
                  </p>
                  <p className="text-xs mt-1">
                    {activeTab === 'past_due'
                      ? 'All delegated work is on track'
                      : 'Tasks you create and assign will appear here'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Set</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const status = computeRequirementStatus({
                        completed_date: item.completed_date || null,
                        actual_due_date: item.actual_due_date || null,
                        expected_due_date: item.expected_due_date || null,
                        actual_start_date: item.actual_start_date || null,
                        expected_start_date: item.expected_start_date || null,
                      })
                      const dueDate = item.actual_due_date || item.expected_due_date
                      const assignee = item.assigned_to as { id: string; full_name: string; avatar_url?: string } | null
                      const setData = item.sets as { id: string; name: string; clients?: { name: string } } | null

                      return (
                        <TableRow
                          key={item.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/requirements/${item.id}`)}
                        >
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {item.title || 'Untitled'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={assignee?.avatar_url} />
                                <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700">
                                  {getInitials(assignee?.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate max-w-[100px]">
                                {assignee?.full_name || 'Unknown'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm truncate max-w-[120px]">
                            {setData?.name || '-'}
                          </TableCell>
                          <TableCell>
                            {dueDate ? (
                              <span
                                className={cn(
                                  'text-sm flex items-center gap-1',
                                  isPastDueStatus(status) && 'text-red-600 font-medium'
                                )}
                              >
                                <Calendar className="h-3 w-3" />
                                {formatDate(dueDate)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-xs', getStatusColor(status))}>
                              {getStatusLabel(status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
