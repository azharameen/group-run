import * as React from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  fetchProviderCatalog,
  fetchProviderDefault,
  PROVIDER_CATALOG_CHANGED_EVENT,
  type ProviderCatalogGroup,
  type ProviderDefault,
} from "@/api/providers"
import type { ChatModelSelection } from "@/api/threads"

interface ModelSelectorProps {
  value: ChatModelSelection | null
  onChange: (selection: ChatModelSelection | null) => void
  disabled?: boolean
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [groups, setGroups] = React.useState<ProviderCatalogGroup[]>([])
  const [defaultModel, setDefaultModel] = React.useState<ProviderDefault | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const requestId = React.useRef(0)

  const reload = React.useCallback(() => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError("")
    Promise.all([fetchProviderCatalog(), fetchProviderDefault()])
      .then(([catalog, savedDefault]) => {
        if (currentRequest !== requestId.current) return
        setGroups(catalog.groups)
        setDefaultModel(savedDefault)
      })
      .catch((reason: unknown) => {
        if (currentRequest === requestId.current) {
          setError(reason instanceof Error ? reason.message : "Unable to load provider models")
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    reload()
    const handleCatalogChange = () => reload()
    window.addEventListener(PROVIDER_CATALOG_CHANGED_EVENT, handleCatalogChange)
    return () => {
      requestId.current += 1
      window.removeEventListener(PROVIDER_CATALOG_CHANGED_EVENT, handleCatalogChange)
    }
  }, [reload])

  const validDefault = defaultModel && groups.some((group) =>
    group.provider_id === defaultModel.provider_id &&
    group.available &&
    group.models.some((model) => model.model_id === defaultModel.model_id),
  )

  React.useEffect(() => {
    const hasSelectedModel = value && groups.some((group) =>
      group.provider_id === value.provider_id &&
      group.available &&
      group.models.some((model) => model.model_id === value.model_id),
    )
    if (value && !hasSelectedModel) {
      onChange(null)
    } else if (!value && validDefault && defaultModel) {
      onChange({ provider_id: defaultModel.provider_id, model_id: defaultModel.model_id })
    }
  }, [defaultModel, groups, onChange, validDefault, value])

  const selectable = groups.filter((group) => group.available && group.models.length > 0)
  const selected = value ?? (validDefault && defaultModel ? {
    provider_id: defaultModel.provider_id,
    model_id: defaultModel.model_id,
  } : null)
  const selectedValue = selected ? JSON.stringify([selected.provider_id, selected.model_id]) : undefined

  if (loading) return <p className="px-1 text-xs text-muted-foreground" role="status">Loading live models…</p>
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (selectable.length === 0) {
    return <Alert variant="destructive"><AlertDescription>Add and enable a provider configuration with an available model before sending a message.</AlertDescription></Alert>
  }

  return (
    <Select
      value={selectedValue}
      disabled={disabled}
      onValueChange={(raw) => {
        const [provider_id, model_id] = JSON.parse(raw) as [string, string]
        onChange({ provider_id, model_id })
      }}
    >
      <SelectTrigger aria-label="Chat model" className="h-8 text-xs">
        <SelectValue placeholder="Choose a model" />
      </SelectTrigger>
      <SelectContent>
        {selectable.map((group) => (
          <SelectGroup key={group.provider_id}>
            <SelectLabel>{group.name} · {group.provider}</SelectLabel>
            {group.models.map((model) => (
              <SelectItem
                key={model.model_id}
                value={JSON.stringify([group.provider_id, model.model_id])}
              >
                {model.display_name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
