import * as React from "react"
import {
  Pencil,
  LogOut,
  Check,
  Server,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  LLM_PROVIDERS,
  DEFAULT_ACCOUNT_PROFILE,
} from "@/constants/settings"
import {
  deleteProvider,
  fetchProviderCatalog,
  fetchProviderDefault,
  fetchProviders,
  saveProvider,
  setProviderDefault,
  setProviderEnabled,
  testProvider,
  notifyProviderCatalogChanged,
  type ProviderConfig,
  type ProviderDefault,
  type ProviderCatalogGroup,
  type ProviderName,
} from "@/api/providers"

// -------------------------------------------------------------
// 1. Account Settings
// -------------------------------------------------------------
export function AccountSettings() {
  const [username, setUsername] = React.useState(DEFAULT_ACCOUNT_PROFILE.username)
  const [isEditing, setIsEditing] = React.useState(false)
  const [tempUsername, setTempUsername] = React.useState(username)

  const handleSaveUsername = () => {
    setUsername(tempUsername)
    setIsEditing(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Account Settings</h2>
      </div>

      <div className="border-t border-border/60 divide-y divide-border/40">
        {/* Avatar Section */}
        <div className="flex items-center justify-between py-5">
          <span className="text-sm font-medium text-muted-foreground">Avatar</span>
          <Avatar className="h-12 w-12 border-2 border-border/80 shadow-sm cursor-pointer hover:opacity-90 transition-opacity">
            <AvatarImage src={DEFAULT_ACCOUNT_PROFILE.avatarUrl} alt="Avatar" />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold">{DEFAULT_ACCOUNT_PROFILE.avatarFallback}</AvatarFallback>
          </Avatar>
        </div>

        {/* Username Section */}
        <div className="flex items-center justify-between py-5">
          <span className="text-sm font-medium text-muted-foreground">Username</span>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value)}
                  className="h-8 max-w-[200px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveUsername()
                    if (e.key === "Escape") setIsEditing(false)
                  }}
                />
                <Button size="sm" variant="default" className="h-8 px-2" onClick={handleSaveUsername}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <span className="text-sm text-foreground pr-1">{username}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setTempUsername(username)
                    setIsEditing(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Email Section */}
        <div className="flex items-center justify-between py-5">
          <span className="text-sm font-medium text-muted-foreground">Email</span>
          <span className="text-sm text-foreground">{DEFAULT_ACCOUNT_PROFILE.email}</span>
        </div>

        {/* Sign Out Section */}
        <div className="flex items-center justify-end py-6">
          <Button
            variant="destructive"
            className="h-9 px-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 shadow-none gap-2 hover:text-red-700 font-medium"
          >
            <span>Sign out</span>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// 2. Preference Settings
// -------------------------------------------------------------
export function PreferenceSettings() {
  const [theme, setTheme] = React.useState<"system" | "light" | "dark">("light")

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Preference</h2>
      </div>

      <div className="space-y-6">
        {/* Language Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/40">
          <div>
            <h3 className="text-sm font-medium text-foreground">Language</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Change the language used in the user interface.
            </p>
          </div>
          <div className="w-full md:w-48">
            <Select defaultValue="en">
              <SelectTrigger className="w-full bg-background border-border/80">
                <SelectValue placeholder="Select Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Theme Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">Theme</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customize how Atoms looks on your device.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-lg">
            {/* System Card */}
            <div
              onClick={() => setTheme("system")}
              className={`group cursor-pointer flex flex-col items-center gap-2`}
            >
              <div
                className={`relative w-full aspect-video rounded-lg border-2 bg-gradient-to-r from-zinc-100 to-zinc-900 transition-all ${
                  theme === "system"
                    ? "border-blue-600 ring-2 ring-blue-100/50 shadow-md"
                    : "border-border/60 hover:border-border-foreground/50 hover:shadow-sm"
                }`}
              />
              <span className={`text-xs font-medium transition-colors ${
                theme === "system" ? "text-blue-600 font-semibold" : "text-muted-foreground group-hover:text-foreground"
              }`}>
                System
              </span>
            </div>

            {/* Light Card */}
            <div
              onClick={() => setTheme("light")}
              className={`group cursor-pointer flex flex-col items-center gap-2`}
            >
              <div
                className={`relative w-full aspect-video rounded-lg border-2 bg-zinc-50 transition-all ${
                  theme === "light"
                    ? "border-blue-600 ring-2 ring-blue-100/50 shadow-md"
                    : "border-border/60 hover:border-border-foreground/50 hover:shadow-sm"
                }`}
              >
                {/* Light preview line decorators */}
                <div className="absolute inset-x-2 top-2 h-1.5 rounded-sm bg-zinc-200/80" />
                <div className="absolute left-2 bottom-2 right-6 h-1 rounded-sm bg-zinc-200/50" />
              </div>
              <span className={`text-xs font-medium transition-colors ${
                theme === "light" ? "text-blue-600 font-semibold" : "text-muted-foreground group-hover:text-foreground"
              }`}>
                Light
              </span>
            </div>

            {/* Dark Card */}
            <div
              onClick={() => setTheme("dark")}
              className={`group cursor-pointer flex flex-col items-center gap-2`}
            >
              <div
                className={`relative w-full aspect-video rounded-lg border-2 bg-zinc-900 transition-all ${
                  theme === "dark"
                    ? "border-blue-600 ring-2 ring-blue-100/50 shadow-md"
                    : "border-border/60 hover:border-border-foreground/50 hover:shadow-sm"
                }`}
              >
                {/* Dark preview line decorators */}
                <div className="absolute inset-x-2 top-2 h-1.5 rounded-sm bg-zinc-800" />
                <div className="absolute left-2 bottom-2 right-6 h-1 rounded-sm bg-zinc-800/80" />
              </div>
              <span className={`text-xs font-medium transition-colors ${
                theme === "dark" ? "text-blue-600 font-semibold" : "text-muted-foreground group-hover:text-foreground"
              }`}>
                Dark
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// 3. Provider Settings
// -------------------------------------------------------------
export function ProviderSettings() {
  const [providers, setProviders] = React.useState<ProviderConfig[]>([])
  const [activeProvider, setActiveProvider] = React.useState<ProviderName>("openai")
  const [providerId, setProviderId] = React.useState<string>()
  const [name, setName] = React.useState("")
  const [endpoint, setEndpoint] = React.useState("")
  const [credential, setCredential] = React.useState("")
  const [isEnabled, setIsEnabled] = React.useState(false)
  const [catalog, setCatalog] = React.useState<ProviderCatalogGroup[]>([])
  const [defaultModel, setDefaultModel] = React.useState<ProviderDefault | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [error, setError] = React.useState("")
  const [message, setMessage] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [result, loadedCatalog, loadedDefault] = await Promise.all([
        fetchProviders(),
        fetchProviderCatalog(),
        fetchProviderDefault(),
      ])
      setProviders(result.providers)
      setCatalog(loadedCatalog.groups)
      setDefaultModel(loadedDefault)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load providers")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const selectProvider = (value: string) => {
    const provider = value as ProviderName
    setActiveProvider(provider)
    const existing = providers.find((p) => p.provider === provider)
    setProviderId(existing?.provider_id)
    setName(existing?.name ?? "")
    setEndpoint(existing?.endpoint ?? "")
    setIsEnabled(existing?.is_enabled ?? false)
    setCredential("")
    setError("")
    setMessage("")
  }

  const selectConfiguration = (configurationId: string) => {
    if (configurationId === "new") {
      setProviderId(undefined); setName(""); setEndpoint(""); setCredential(""); setIsEnabled(false)
      return
    }
    const existing = providers.find((provider) => provider.provider_id === configurationId)
    if (!existing) return
    setProviderId(existing.provider_id)
    setName(existing.name)
    setEndpoint(existing.endpoint)
    setIsEnabled(existing.is_enabled)
    setCredential("")
  }

  const input = () => ({
    provider: activeProvider,
    name,
    endpoint: endpoint || undefined,
    credentials: credential ? { api_key: credential } : undefined,
    is_enabled: isEnabled,
  })

  const handleSave = async () => {
    const endpointValue = endpoint.trim()
    if (activeProvider === "ollama" && !endpointValue) {
      setError("Ollama endpoint is required."); return
    }
    if (endpointValue) {
      try {
        const parsed = new URL(endpointValue)
        if (!["http:", "https:"].includes(parsed.protocol) ||
          (activeProvider !== "ollama" && parsed.protocol !== "https:")) {
          throw new Error("Use an HTTP(S) endpoint; cloud providers require HTTPS.")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Enter a valid endpoint URL.")
        return
      }
    }
    if (!name.trim()) { setError("Configuration name is required."); return }
    if (activeProvider !== "ollama" && !credential && !providers.find((p) => p.provider_id === providerId)?.has_credentials) {
      setError("An API key is required for this provider."); return
    }
    setBusy(true); setError(""); setMessage("")
    try {
      const saved = await saveProvider(input(), providerId)
      setProviderId(saved.provider_id)
      setMessage("Provider configuration saved.")
      await load()
      notifyProviderCatalogChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save provider")
    } finally { setBusy(false) }
  }

  const handleTest = async () => {
    if (!providerId) { setError("Save this provider before testing it."); return }
    setTesting(true); setError(""); setMessage("")
    try {
      const result = await testProvider(providerId)
      if (!result.success) throw new Error(result.message)
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider test failed")
    } finally { setTesting(false) }
  }

  const handleEnabledChange = async (nextEnabled: boolean) => {
    if (!providerId) { setIsEnabled(nextEnabled); return }
    setBusy(true); setError(""); setMessage("")
    try {
      const updated = await setProviderEnabled(providerId, nextEnabled)
      setIsEnabled(updated.is_enabled)
      setMessage(updated.is_enabled ? "Provider enabled." : "Provider disabled.")
      await load()
      notifyProviderCatalogChanged()
    }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update provider") }
    finally { setBusy(false) }
  }

  const handleDelete = async () => {
    if (!providerId) return
    setBusy(true); setError(""); setMessage("")
    try {
      await deleteProvider(providerId)
      setProviderId(undefined); setCredential(""); setName(""); setEndpoint(""); setIsEnabled(false)
      setMessage("Provider deleted."); await load()
      notifyProviderCatalogChanged()
    }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to delete provider") }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">LLM Providers</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure encrypted, user-owned provider connections. Models come from each provider live.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading providers...</p> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {message ? <Alert><AlertDescription role="status">{message}</AlertDescription></Alert> : null}
      <Tabs value={activeProvider} onValueChange={selectProvider}>
        <TabsList className="w-full">
          {LLM_PROVIDERS.map((provider) => (
            <TabsTrigger key={provider.value} value={provider.value} className="flex-1">
              {provider.label}
            </TabsTrigger>
          ))}
        </TabsList>

      <div className="mt-4 rounded-xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
        {LLM_PROVIDERS.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                <Server className="h-4 w-4" /><span>{item.label}</span>
              </div>
              <Select value={providerId ?? "new"} onValueChange={selectConfiguration}>
                <SelectTrigger aria-label="Choose a configuration"><SelectValue placeholder="Choose a configuration" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New configuration</SelectItem>
                  {providers.filter((provider) => provider.provider === activeProvider).map((provider) => (
                    <SelectItem key={provider.provider_id} value={provider.provider_id}>{provider.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <label htmlFor="provider-configuration-name" className="text-xs font-semibold text-muted-foreground">Configuration name</label>
                <Input id="provider-configuration-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Work account" />
              </div>
              <div className="space-y-1">
                <label htmlFor="provider-endpoint" className="text-xs font-semibold text-muted-foreground">Endpoint URL</label>
                <Input id="provider-endpoint" type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder={activeProvider === "ollama" ? "http://localhost:11434" : "https://provider.example"} />
              </div>
              {activeProvider !== "ollama" ? (
                <div className="space-y-1">
                  <label htmlFor="provider-api-key" className="text-xs font-semibold text-muted-foreground">API key</label>
                  <Input id="provider-api-key" type="password" autoComplete="new-password" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={providers.find((p) => p.provider_id === providerId)?.has_credentials ? "Leave blank to keep the saved key" : "Required API key"} />
                </div>
              ) : <p className="text-xs text-muted-foreground">Ollama uses its endpoint only; no API key is stored.</p>}
              <div className="flex items-center justify-between rounded-md border p-3">
                <div><p className="text-sm font-medium">Enabled</p><p className="text-xs text-muted-foreground">Enabled configurations are available to chat.</p></div>
                <Switch checked={isEnabled} onCheckedChange={(checked) => void handleEnabledChange(checked)} disabled={busy} aria-label="Enable provider configuration" />
              </div>
            </div>
          </TabsContent>
        ))}
      </div>
      </Tabs>

      {providerId ? (
       <div className="space-y-2">
         <h3 className="text-sm font-medium">Live models</h3>
         {catalog.find((group) => group.provider_id === providerId)?.available ? (
           <Select
             value={defaultModel?.provider_id === providerId ? defaultModel.model_id : undefined}
             onValueChange={(modelId) => void setProviderDefault(providerId, modelId).then((value) => { setDefaultModel(value); setMessage("Default model saved."); notifyProviderCatalogChanged() }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Unable to save default model"))}
           >
             <SelectTrigger aria-label="Select this configuration's default model"><SelectValue placeholder="Select this configuration's default model" /></SelectTrigger>
             <SelectContent>
               {catalog.find((group) => group.provider_id === providerId)?.models.map((model) => (
                 <SelectItem key={model.model_id} value={model.model_id}>{model.display_name}</SelectItem>
               ))}
             </SelectContent>
           </Select>
         ) : <p className="text-sm text-muted-foreground">{catalog.find((group) => group.provider_id === providerId)?.message ?? "Save and enable this configuration to discover models."}</p>}
       </div>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
       <Button variant="outline" onClick={handleTest} disabled={busy || testing}>Test</Button>
       <AlertDialog>
         <AlertDialogTrigger asChild><Button variant="outline" disabled={busy || !providerId}>Delete</Button></AlertDialogTrigger>
         <AlertDialogContent>
           <AlertDialogHeader><AlertDialogTitle>Delete provider configuration?</AlertDialogTitle><AlertDialogDescription>This permanently removes the encrypted credentials and clears its default model.</AlertDialogDescription></AlertDialogHeader>
           <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction></AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
       <Button onClick={handleSave} disabled={busy}>{busy ? "Saving..." : "Save Settings"}</Button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// 4. Billing Settings
// -------------------------------------------------------------
export function BillingSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Billing Settings</h2>
      <p className="text-sm text-muted-foreground">Configure your subscription plans and credits.</p>
    </div>
  )
}

// -------------------------------------------------------------
// 5. Notification Settings
// -------------------------------------------------------------
export function NotificationSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Notification Settings</h2>
      <p className="text-sm text-muted-foreground">Manage your notification channels and email updates.</p>
    </div>
  )
}

// -------------------------------------------------------------
// Re-exports
// -------------------------------------------------------------
export { MCPManager } from '@/components/MCPManager'
export { TeamConfig } from '@/components/TeamConfig'
