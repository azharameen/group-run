import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import {
  createOrganization,
  fetchOrganization,
  fetchOrganizations,
  type Organization,
  type OrgStatus,
} from '../api/client'
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

const NAME_MAX_LENGTH = 200

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
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const organizations = await fetchOrganizations()
      if (organizations.length === 0) {
        setOrg(null)
        return
      }
      // List is ordered by updated_at descending — show the most recent org.
      const latest = organizations[0]
      setOrg(await fetchOrganization(latest.org_id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organization')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError('Organization name is required')
      return
    }
    setNameError(null)
    setCreating(true)
    try {
      const created = await createOrganization(trimmedName, description.trim())
      toast({
        title: 'Organization Created',
        description: `Created ${created.name}`,
      })
      setName('')
      setDescription('')
      setOrg(created)
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create organization',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
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
          <Button variant="outline" className="mt-4" onClick={loadData}>
            Retry
          </Button>
        </Card>
      </div>
    )
  }

  if (!org) {
    return (
      <div
        data-testid="org-empty-state"
        className="p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6 flex-1"
      >
        <Card className="p-12 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="font-semibold text-lg">No organization yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            Create your organization to initialize the default departments and teams.
          </p>
          <div className="max-w-md mx-auto space-y-4 text-left">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="org-name">
                Name *
              </label>
              <Input
                id="org-name"
                data-testid="org-name-input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                placeholder="Enter organization name"
                maxLength={NAME_MAX_LENGTH}
              />
              {nameError && (
                <p className="text-sm text-destructive" data-testid="org-name-error">
                  {nameError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="org-description">
                Description (optional)
              </label>
              <Textarea
                id="org-description"
                data-testid="org-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this organization about?"
                rows={3}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleCreate}
                data-testid="org-create-button"
                disabled={creating}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                {creating ? 'Creating...' : 'Create Organization'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6 flex-1">
      {/* Org header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold" data-testid="org-name">
          {org.name}
        </h1>
        {org.description && (
          <p className="text-sm text-muted-foreground">{org.description}</p>
        )}
      </div>

      {/* Chief of Staff */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chief of Staff</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{org.chief_of_staff.name}</p>
            <p className="text-sm text-muted-foreground capitalize">
              {roleLabel(org.chief_of_staff.role)}
            </p>
          </div>
          <StatusBadge status={org.chief_of_staff.status} data-testid="org-cos-status" />
        </CardContent>
      </Card>

      {/* Departments and teams */}
      {org.departments.map((dept) => (
        <Card key={dept.department_id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base" data-testid="org-dept-name">
                {dept.name}
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Chief: {dept.chief.name}
                </span>
                <StatusBadge status={dept.status} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dept.teams.map((team) => (
              <Card key={team.team_id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm" data-testid="org-team-name">
                    {team.name}
                  </p>
                  <StatusBadge status={team.status} />
                </div>
                <p className="text-sm text-muted-foreground">Captain: {team.captain.name}</p>
                <p className="text-sm text-muted-foreground" data-testid="org-team-capacity">
                  Capacity {team.active_agents}/{team.total_agents}
                </p>
                <ul className="space-y-1.5">
                  {team.agents.map((agent) => (
                    <li
                      key={agent.agent_id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {agent.name}
                        <span className="text-muted-foreground"> — {roleLabel(agent.role)}</span>
                      </span>
                      <StatusBadge status={agent.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
