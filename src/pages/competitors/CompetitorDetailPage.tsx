import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCompetitor, useCompetitorMutations } from '@/hooks/useCompetitors'
import { useClients } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AuditTrail } from '@/components/shared/AuditTrail'
import { ViewEditField } from '@/components/shared/ViewEditField'
import type { UserProfile } from '@/types/database'
import {
  ArrowLeft,
  Swords,
  Building2,
  DollarSign,
  BarChart2,
  Globe,
  Tag,
  Edit,
  X,
  Save,
  Loader2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const INDUSTRY_OPTIONS = [
  { value: 'SaaS', label: 'SaaS' },
  { value: 'Agency', label: 'Agency' },
  { value: 'Consulting', label: 'Consulting' },
  { value: 'E-commerce', label: 'E-commerce' },
  { value: 'Fintech', label: 'Fintech' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'Other', label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'acquired', label: 'Acquired' },
  { value: 'defunct', label: 'Defunct' },
]

const THREAT_LEVEL_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

// Threat level badge colors
const threatLevelColors: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-gray-400 text-white',
}

// Status badge variants
const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  inactive: 'secondary',
  acquired: 'outline',
  defunct: 'destructive',
}

const competitorDetailSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  website: z.string().optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive', 'acquired', 'defunct']),
  threat_level: z.enum(['low', 'medium', 'high', 'critical']).optional().nullable(),
  target_market: z.string().optional(),
  pricing_model: z.string().optional(),
  pricing_notes: z.string().optional(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
  differentiators: z.string().optional(),
  linkedin_url: z.string().optional(),
  twitter_url: z.string().optional(),
  crunchbase_url: z.string().optional(),
  client_id: z.string().optional().nullable(),
  tags: z.string().optional(), // comma-separated
  last_reviewed_at: z.string().optional(),
})

type CompetitorDetailFormValues = z.infer<typeof competitorDetailSchema>

export function CompetitorDetailPage() {
  const { competitorId } = useParams<{ competitorId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: competitor, isLoading } = useCompetitor(competitorId!)
  const { updateCompetitor } = useCompetitorMutations()
  const { data: clients } = useClients()

  const shouldEditOnLoad = searchParams.get('edit') === 'true'
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const clientOptions = (clients || []).map(c => ({
    value: c.id,
    label: c.name,
  }))

  const form = useForm<CompetitorDetailFormValues>({
    resolver: zodResolver(competitorDetailSchema),
    defaultValues: {
      name: '',
      website: '',
      industry: '',
      description: '',
      status: 'active',
      threat_level: null,
      target_market: '',
      pricing_model: '',
      pricing_notes: '',
      strengths: '',
      weaknesses: '',
      differentiators: '',
      linkedin_url: '',
      twitter_url: '',
      crunchbase_url: '',
      client_id: null,
      tags: '',
      last_reviewed_at: '',
    },
  })

  // Reset form when competitor data loads
  useEffect(() => {
    if (competitor && !isEditing) {
      form.reset({
        name: competitor.name,
        website: competitor.website || '',
        industry: competitor.industry || '',
        description: competitor.description || '',
        status: competitor.status,
        threat_level: competitor.threat_level || null,
        target_market: competitor.target_market || '',
        pricing_model: competitor.pricing_model || '',
        pricing_notes: competitor.pricing_notes || '',
        strengths: competitor.strengths || '',
        weaknesses: competitor.weaknesses || '',
        differentiators: competitor.differentiators || '',
        linkedin_url: competitor.linkedin_url || '',
        twitter_url: competitor.twitter_url || '',
        crunchbase_url: competitor.crunchbase_url || '',
        client_id: competitor.client_id || null,
        tags: competitor.tags?.join(', ') || '',
        last_reviewed_at: competitor.last_reviewed_at?.split('T')[0] || '',
      })
    }
  }, [competitor?.id, competitor?.updated_at, isEditing])

  // Auto-enter edit mode when ?edit=true is in URL
  useEffect(() => {
    if (shouldEditOnLoad && competitor && !isEditing) {
      setIsEditing(true)
      setSearchParams({}, { replace: true })
    }
  }, [shouldEditOnLoad, competitor])

  const handleSave = async (data: CompetitorDetailFormValues) => {
    if (!competitorId) return
    setIsSaving(true)
    try {
      // Parse comma-separated tags into array
      const tagsArray = data.tags
        ? data.tags.split(',').map(t => t.trim()).filter(Boolean)
        : []

      await updateCompetitor.mutateAsync({
        id: competitorId,
        name: data.name,
        website: data.website?.trim() || null,
        industry: data.industry || null,
        description: data.description?.trim() || null,
        status: data.status,
        threat_level: data.threat_level || null,
        target_market: data.target_market?.trim() || null,
        pricing_model: data.pricing_model?.trim() || null,
        pricing_notes: data.pricing_notes?.trim() || null,
        strengths: data.strengths?.trim() || null,
        weaknesses: data.weaknesses?.trim() || null,
        differentiators: data.differentiators?.trim() || null,
        linkedin_url: data.linkedin_url?.trim() || null,
        twitter_url: data.twitter_url?.trim() || null,
        crunchbase_url: data.crunchbase_url?.trim() || null,
        client_id: data.client_id || null,
        tags: tagsArray,
        last_reviewed_at: data.last_reviewed_at || null,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    form.reset({
      name: competitor?.name || '',
      website: competitor?.website || '',
      industry: competitor?.industry || '',
      description: competitor?.description || '',
      status: competitor?.status || 'active',
      threat_level: competitor?.threat_level || null,
      target_market: competitor?.target_market || '',
      pricing_model: competitor?.pricing_model || '',
      pricing_notes: competitor?.pricing_notes || '',
      strengths: competitor?.strengths || '',
      weaknesses: competitor?.weaknesses || '',
      differentiators: competitor?.differentiators || '',
      linkedin_url: competitor?.linkedin_url || '',
      twitter_url: competitor?.twitter_url || '',
      crunchbase_url: competitor?.crunchbase_url || '',
      client_id: competitor?.client_id || null,
      tags: competitor?.tags?.join(', ') || '',
      last_reviewed_at: competitor?.last_reviewed_at?.split('T')[0] || '',
    })
    setIsEditing(false)
  }

  const handleMarkAsReviewed = async () => {
    if (!competitorId) return
    try {
      await updateCompetitor.mutateAsync({
        id: competitorId,
        last_reviewed_at: new Date().toISOString(),
      })
      toast({
        title: 'Marked as reviewed',
        description: 'Last reviewed date has been updated to today.',
      })
    } catch (error) {
      console.error('Failed to mark as reviewed:', error)
    }
  }

  const renderLink = (url: string | null | undefined, label: string) => {
    if (!url) return <span className="text-muted-foreground">—</span>
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline flex items-center gap-1"
      >
        <ExternalLink className="h-3 w-3" />
        {label}
      </a>
    )
  }

  if (isLoading) {
    return (
      <div className="page-carbon p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!competitor) {
    return (
      <div className="text-center py-12">
        <Swords className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Competitor not found</p>
        <Button variant="link" onClick={() => navigate('/competitors')}>
          Back to Competitor Tracker
        </Button>
      </div>
    )
  }

  return (
    <div className="page-carbon p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="font-mono">
              COMP-{String(competitor.display_id).padStart(4, '0')}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditing ? form.watch('name') : competitor.name}
            </h1>
            {competitor.threat_level && (
              <Badge className={threatLevelColors[competitor.threat_level]}>
                {competitor.threat_level.charAt(0).toUpperCase() + competitor.threat_level.slice(1)}
              </Badge>
            )}
            <Badge variant={statusVariants[competitor.status]}>
              {competitor.status.charAt(0).toUpperCase() + competitor.status.slice(1)}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {competitor.industry || 'Unknown Industry'}
          </p>
        </div>
      </div>

      {/* Main Card */}
      <Card className="card-carbon">
        <CardContent className="pt-6">
          {/* Edit/Save buttons */}
          <div className="flex justify-end gap-2 mb-6">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={form.handleSubmit(handleSave)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </div>

          <div className="space-y-8">
            {/* Overview Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                Overview
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <ViewEditField
                  type="text"
                  label="Name"
                  required
                  isEditing={isEditing}
                  value={form.watch('name')}
                  onChange={(v) => form.setValue('name', v)}
                  error={form.formState.errors.name?.message}
                />
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Website
                  </label>
                  {isEditing ? (
                    <Input
                      className="mt-1"
                      placeholder="https://example.com"
                      value={form.watch('website') || ''}
                      onChange={(e) => form.setValue('website', e.target.value)}
                    />
                  ) : (
                    <p className="mt-1">
                      {renderLink(competitor.website, 'Visit Website')}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Industry
                  </label>
                  {isEditing ? (
                    <div className="mt-1">
                      <SearchableSelect
                        options={INDUSTRY_OPTIONS}
                        value={form.watch('industry') || ''}
                        onValueChange={(value) => form.setValue('industry', value || '')}
                        placeholder="Select industry..."
                        searchPlaceholder="Search industries..."
                        emptyMessage="No industries found."
                        clearable
                      />
                    </div>
                  ) : (
                    <p className="mt-1 font-medium">
                      {competitor.industry || <span className="text-muted-foreground">—</span>}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Status <span className="text-red-500">*</span>
                  </label>
                  {isEditing ? (
                    <div className="mt-1">
                      <SearchableSelect
                        options={STATUS_OPTIONS}
                        value={form.watch('status')}
                        onValueChange={(value) => form.setValue('status', (value || 'active') as 'active' | 'inactive' | 'acquired' | 'defunct')}
                        placeholder="Select status..."
                        clearable={false}
                      />
                    </div>
                  ) : (
                    <p className="mt-1">
                      <Badge variant={statusVariants[competitor.status]}>
                        {competitor.status.charAt(0).toUpperCase() + competitor.status.slice(1)}
                      </Badge>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Threat Level
                  </label>
                  {isEditing ? (
                    <div className="mt-1">
                      <SearchableSelect
                        options={THREAT_LEVEL_OPTIONS}
                        value={form.watch('threat_level') || ''}
                        onValueChange={(value) => form.setValue('threat_level', (value || null) as 'low' | 'medium' | 'high' | 'critical' | null)}
                        placeholder="Select threat level..."
                        clearable
                      />
                    </div>
                  ) : (
                    <p className="mt-1">
                      {competitor.threat_level ? (
                        <Badge className={threatLevelColors[competitor.threat_level]}>
                          {competitor.threat_level.charAt(0).toUpperCase() + competitor.threat_level.slice(1)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="col-span-full">
                  <ViewEditField
                    type="textarea"
                    label="Target Market"
                    isEditing={isEditing}
                    value={form.watch('target_market') || ''}
                    onChange={(v) => form.setValue('target_market', v)}
                    placeholder="Who do they serve?"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                Pricing
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <ViewEditField
                  type="text"
                  label="Pricing Model"
                  isEditing={isEditing}
                  value={form.watch('pricing_model') || ''}
                  onChange={(v) => form.setValue('pricing_model', v)}
                  placeholder="Subscription, Per-seat, etc."
                />
                <div className="col-span-2">
                  <ViewEditField
                    type="textarea"
                    label="Pricing Notes"
                    isEditing={isEditing}
                    value={form.watch('pricing_notes') || ''}
                    onChange={(v) => form.setValue('pricing_notes', v)}
                    placeholder="Price ranges, tiers, discounts..."
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Analysis Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-muted-foreground" />
                Analysis
              </h3>
              <div className="grid grid-cols-1 gap-6">
                <ViewEditField
                  type="textarea"
                  label="Strengths"
                  isEditing={isEditing}
                  value={form.watch('strengths') || ''}
                  onChange={(v) => form.setValue('strengths', v)}
                  placeholder="What do they do well?"
                  rows={3}
                />
                <ViewEditField
                  type="textarea"
                  label="Weaknesses"
                  isEditing={isEditing}
                  value={form.watch('weaknesses') || ''}
                  onChange={(v) => form.setValue('weaknesses', v)}
                  placeholder="Where do they fall short?"
                  rows={3}
                />
                <ViewEditField
                  type="textarea"
                  label="How We Differ"
                  isEditing={isEditing}
                  value={form.watch('differentiators') || ''}
                  onChange={(v) => form.setValue('differentiators', v)}
                  placeholder="Our differentiators vs. this competitor..."
                  rows={3}
                />
              </div>
            </div>

            {/* Online Presence Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-muted-foreground" />
                Online Presence
              </h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    LinkedIn
                  </label>
                  {isEditing ? (
                    <Input
                      className="mt-1"
                      placeholder="https://linkedin.com/company/..."
                      value={form.watch('linkedin_url') || ''}
                      onChange={(e) => form.setValue('linkedin_url', e.target.value)}
                    />
                  ) : (
                    <p className="mt-1">
                      {renderLink(competitor.linkedin_url, 'LinkedIn Profile')}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Twitter / X
                  </label>
                  {isEditing ? (
                    <Input
                      className="mt-1"
                      placeholder="https://twitter.com/..."
                      value={form.watch('twitter_url') || ''}
                      onChange={(e) => form.setValue('twitter_url', e.target.value)}
                    />
                  ) : (
                    <p className="mt-1">
                      {renderLink(competitor.twitter_url, 'Twitter Profile')}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Crunchbase
                  </label>
                  {isEditing ? (
                    <Input
                      className="mt-1"
                      placeholder="https://crunchbase.com/..."
                      value={form.watch('crunchbase_url') || ''}
                      onChange={(e) => form.setValue('crunchbase_url', e.target.value)}
                    />
                  ) : (
                    <p className="mt-1">
                      {renderLink(competitor.crunchbase_url, 'Crunchbase Profile')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Metadata Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Tag className="h-5 w-5 text-muted-foreground" />
                Metadata
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Linked Client
                  </label>
                  {isEditing ? (
                    <div className="mt-1">
                      <SearchableSelect
                        options={clientOptions}
                        value={form.watch('client_id') || ''}
                        onValueChange={(value) => form.setValue('client_id', value || null)}
                        placeholder="Link to client..."
                        searchPlaceholder="Search clients..."
                        emptyMessage="No clients found."
                        clearable
                      />
                    </div>
                  ) : (
                    <p className="mt-1 font-medium">
                      {competitor.client?.name || <span className="text-muted-foreground">—</span>}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tags
                  </label>
                  {isEditing ? (
                    <Input
                      className="mt-1"
                      placeholder="tag1, tag2, tag3"
                      value={form.watch('tags') || ''}
                      onChange={(e) => form.setValue('tags', e.target.value)}
                    />
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {competitor.tags?.length ? (
                        competitor.tags.map((tag, i) => (
                          <Badge key={i} variant="secondary">{tag}</Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Last Reviewed
                  </label>
                  {isEditing ? (
                    <Input
                      type="date"
                      className="mt-1"
                      value={form.watch('last_reviewed_at') || ''}
                      onChange={(e) => form.setValue('last_reviewed_at', e.target.value)}
                    />
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-medium">
                        {competitor.last_reviewed_at
                          ? new Date(competitor.last_reviewed_at).toLocaleDateString()
                          : 'Never'}
                      </span>
                      {!isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleMarkAsReviewed}
                          disabled={updateCompetitor.isPending}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Mark as Reviewed Today
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Audit Trail */}
            <div className="pt-4 border-t">
              <AuditTrail
                created_at={competitor.created_at}
                created_by={competitor.created_by || ''}
                updated_at={competitor.updated_at}
                updated_by={competitor.updated_by || undefined}
                creator={competitor.creator as UserProfile | undefined}
                updater={competitor.updater as UserProfile | undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
