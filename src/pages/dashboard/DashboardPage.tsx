import { useProjects, useRequirements, useSets } from '@/hooks'
import { useAuthStore, useTenantStore } from '@/stores'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FolderKanban,
  Layers,
  CheckSquare,
  Clock,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import { formatDateTime, getHealthColor } from '@/lib/utils'
import { Link } from 'react-router-dom'

export function DashboardPage() {
  const { profile } = useAuthStore()
  const { currentTenant } = useTenantStore()
  const { data: projects, isLoading: projectsLoading } = useProjects()
  const { data: sets, isLoading: setsLoading } = useSets()
  const { data: requirements, isLoading: requirementsLoading } = useRequirements()

  const activeProjects = projects?.filter((p) => p.status === 'active') || []
  const openSets = sets?.filter((s) => s.status === 'open' || s.status === 'in_progress') || []
  const myRequirements = requirements?.filter((r) => r.assigned_to_id === profile?.user_id) || []
  const overdueRequirements = requirements?.filter(
    (r) => r.expected_due_date && new Date(r.expected_due_date) < new Date() && r.status !== 'completed'
  ) || []

  const stats = [
    {
      title: 'Active Projects',
      value: activeProjects.length,
      total: projects?.length || 0,
      icon: FolderKanban,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Open Sets',
      value: openSets.length,
      total: sets?.length || 0,
      icon: Layers,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'My Requirements',
      value: myRequirements.filter((r) => r.status !== 'completed').length,
      total: myRequirements.length,
      icon: CheckSquare,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Overdue',
      value: overdueRequirements.length,
      total: requirements?.length || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening in {currentTenant?.name}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`p-2 rounded-md ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {projectsLoading || setsLoading || requirementsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    of {stat.total} total
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Active Projects
            </CardTitle>
            <CardDescription>Projects currently in progress</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {projectsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : activeProjects.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No active projects
                </div>
              ) : (
                <div className="space-y-4">
                  {activeProjects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{project.name}</span>
                        <Badge
                          variant="outline"
                          className={getHealthColor(project.health)}
                        >
                          {project.health.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <span>{project.project_code}</span>
                        <span>•</span>
                        <span>{project.clients?.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={project.completion_percentage}
                          className="h-2 flex-1"
                        />
                        <span className="text-xs text-muted-foreground">
                          {project.completion_percentage}%
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* My Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              My Requirements
            </CardTitle>
            <CardDescription>Requirements assigned to you</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {requirementsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : myRequirements.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No requirements assigned to you
                </div>
              ) : (
                <div className="space-y-3">
                  {myRequirements
                    .filter((t) => t.status !== 'completed')
                    .slice(0, 8)
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            task.status === 'in_progress'
                              ? 'bg-blue-500'
                              : task.status === 'blocked'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {task.sets?.projects?.name} • {task.sets?.name}
                          </p>
                        </div>
                        {task.expected_due_date && (
                          <span
                            className={`text-xs ${
                              new Date(task.expected_due_date) < new Date()
                                ? 'text-red-600'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {formatDateTime(task.expected_due_date)}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
