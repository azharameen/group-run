import { useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import {
  useOrganizationsQuery,
  useOrganizationDetailQuery,
  useCreateOrganizationMutation,
} from '@/hooks/queries/useOrganization'
import type {
  OrgStatus,
  OrgDepartment,
  OrgTeam,
} from '@/api/organizations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

const STATUS_VARIANT: Record<OrgStatus, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  idle: 'secondary',
  overloaded: 'destructive',
}

type StatusBadgeProps = { status: OrgStatus; 'data-testid'?: string }

function StatusBadge({ status, 'data-testid': testId }: StatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANT[status]} data-testid={testId}>
      {status}
    </Badge>
  )
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ')
}

export default function Organization() {
  const { data: organizations = [], isLoading: orgsLoading, error: orgsError, refetch } = useOrganizationsQuery()
  const latestOrgId = organizations.length > 0 ? organizations[0].org_id : undefined
  const { data: org, isLoading: detailLoading, error: detailError } = useOrganizationDetailQuery(latestOrgId)
  const createOrgMutation = useCreateOrganizationMutation()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const { toast } = useToast()

  const loading = orgsLoading || (Boolean(latestOrgId) && detailLoading)
  const error = (orgsError instanceof Error ? orgsError.message : null) || (detailError instanceof Error ? detailError.message : null)

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError('Organization name is required')
      return
    }
    setNameError(null)
    try {
      const created = await createOrgMutation.mutateAsync({
        name: trimmedName,
        description: description.trim(),
      })
      toast({
        title: 'Organization Created',
        description: `Created ${created.name}`,
      })
      setName('')
      setDescription('')
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create organization',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div data-testid="org-loading" className="p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="org-error-state" className="p-6 md:p-8 flex-1">
        <Card className="p-12 text-center">
          <p className="font-semibold text-lg">Failed to load organization</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    )
  }

  if (!org) {
    return (
      <div data-testid="org-empty-state" className="p-6 md:p-8 max-w-2xl mx-auto space-y-6 flex-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Create Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No organization found. Create one to bootstrap your agent hierarchy.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Organization Name *</label>
              <Input
                value={name}
                data-testid="org-name-input"
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                placeholder="e.g. Acme Corp"
                maxLength={200}
              />
              {nameError && (
                <p data-testid="org-name-error" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                data-testid="org-description-input"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the organization..."
                rows={3}
              />
            </div>
            <Button
              onClick={handleCreate}
              data-testid="org-create-button"
              disabled={createOrgMutation.isPending}
              className="w-full gap-2"
            >
              <Plus className="w-4 h-4" />
              {createOrgMutation.isPending ? 'Creating...' : 'Create Organization'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div data-testid="org-tree-view" className="p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6 flex-1">
      {/* Org Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 data-testid="org-name" className="text-2xl font-bold">{org.name}</h1>
          </div>
          {org.description && (
            <p className="text-sm text-muted-foreground mt-1">{org.description}</p>
          )}
        </div>
      </div>

      {/* Chief of Staff Card */}
      {org.chief_of_staff && (
        <Card data-testid="chief-of-staff-card" className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Chief of Staff
              </CardTitle>
              <StatusBadge
                status={org.chief_of_staff.status}
                data-testid="org-cos-status"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-lg">{org.chief_of_staff.name}</p>
                <p className="text-xs text-muted-foreground">{roleLabel(org.chief_of_staff.role)}</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {org.chief_of_staff.agent_id}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Departments Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Departments</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {org.departments?.map((dept: OrgDepartment) => (
            <Card
              key={dept.department_id}
              data-testid={`dept-card-${dept.department_id}`}
              className="flex flex-col"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle data-testid="org-dept-name" className="text-base font-semibold">{dept.name}</CardTitle>
                  <StatusBadge
                    status={dept.status}
                    data-testid={`dept-status-${dept.department_id}`}
                  />
                </div>
                {dept.chief && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">Chief: {dept.chief.name}</span>
                    <StatusBadge
                      status={dept.chief.status}
                      data-testid={`agent-status-${dept.chief.agent_id}`}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1 space-y-3 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Teams ({dept.teams?.length ?? 0})
                </p>
                <div className="space-y-2">
                  {dept.teams?.map((team: OrgTeam) => (
                    <div
                      key={team.team_id}
                      data-testid={`team-card-${team.team_id}`}
                      className="rounded-lg border p-3 space-y-2 text-xs bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <span data-testid="org-team-name" className="font-medium">{team.name}</span>
                        <StatusBadge
                          status={team.status}
                          data-testid={`team-status-${team.team_id}`}
                        />
                      </div>
                      {team.captain && (
                        <p className="text-muted-foreground">Captain: {team.captain.name}</p>
                      )}
                      <div className="flex items-center justify-between pt-1 border-t text-muted-foreground">
                        <span>Capacity</span>
                        <span
                          data-testid="org-team-capacity"
                          className="font-mono font-medium"
                        >
                          {team.active_agents ?? 0}/{team.total_agents ?? 0} active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
