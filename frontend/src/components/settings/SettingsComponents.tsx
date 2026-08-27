import * as React from "react"
import {
  Pencil,
  LogOut,
  Check,
  Globe,
  Cpu,
  Database
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  OPENAI_MODELS,
  LLM_PROVIDERS,
  DEFAULT_PROVIDER_CONFIGS,
  DEFAULT_ACCOUNT_PROFILE,
} from "@/constants/settings"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/components/theme-provider"
import {
  activateProvider,
  deleteProvider,
  fetchProviders,
  saveProvider,
  testProvider,
  type ProviderConfig,
  type ProviderName,
} from "@/api/providers"

// -------------------------------------------------------------
// 1. Account Settings
// -------------------------------------------------------------
export function AccountSettings() {
  const { user, signOut } = useAuth()
  const [username, setUsername] = React.useState(user?.display_name || DEFAULT_ACCOUNT_PROFILE.username)
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
            <AvatarImage src={user?.photo_url || DEFAULT_ACCOUNT_PROFILE.avatarUrl} alt="Avatar" />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold">
              {(user?.display_name || username || "U").slice(0, 2).toUpperCase()}
            </AvatarFallback>
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
          <span className="text-sm text-foreground">{user?.email || DEFAULT_ACCOUNT_PROFILE.email || "—"}</span>
        </div>

        {/* Sign Out Section */}
        <div className="flex items-center justify-end py-6">
          <Button
            variant="destructive"
            onClick={() => signOut()}
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
  const { theme, setTheme } = useTheme()

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
  const [endpoint, setEndpoint] = React.useState("")
  const [model, setModel] = React.useState(OPENAI_MODELS[0].value)
  const [credential, setCredential] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [error, setError] = React.useState("")
  const [message, setMessage] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchProviders()
      setProviders(result.providers)
      const active = result.providers.find((p) => p.is_active)
      if (active) {
        setActiveProvider(active.provider)
        setProviderId(active.provider_id)
        setEndpoint(active.endpoint)
        setModel(active.model)
      }
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
    setEndpoint(existing?.endpoint ?? (provider === "ollama" ? DEFAULT_PROVIDER_CONFIGS.ollama.baseUrl : ""))
    setModel(existing?.model ?? (provider === "ollama" ? DEFAULT_PROVIDER_CONFIGS.ollama.defaultModel : OPENAI_MODELS[0].value))
    setCredential("")
    setError("")
    setMessage("")
  }

  const input = () => ({
    provider: activeProvider,
    endpoint: endpoint || undefined,
    model,
    credentials: credential ? { api_key: credential } : undefined,
    is_active: providers.find((p) => p.provider_id === providerId)?.is_active ?? false,
  })

  const handleSave = async () => {
    setBusy(true); setError(""); setMessage("")
    try {
      const saved = await saveProvider(input(), providerId)
      setProviderId(saved.provider_id)
      setMessage("Provider saved. Activate it when ready.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save provider")
    } finally { setBusy(false) }
  }

  const handleTest = async () => {
    if (!providerId) { setError("Save this provider before testing it."); return }
    setTesting(true); setError(""); setMessage("")
    try {
      const result = await testProvider(providerId, credential ? { api_key: credential } : undefined)
      if (!result.success) throw new Error(result.message)
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider test failed")
    } finally { setTesting(false) }
  }

  const handleActivate = async () => {
    if (!providerId) { setError("Save this provider before activating it."); return }
    setBusy(true); setError(""); setMessage("")
    try { await activateProvider(providerId); setMessage("Provider activated."); await load() }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to activate provider") }
    finally { setBusy(false) }
  }

  const handleDelete = async () => {
    if (!providerId) return
    setBusy(true); setError(""); setMessage("")
    try { await deleteProvider(providerId); setProviderId(undefined); setCredential(""); setMessage("Provider deleted."); await load() }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to delete provider") }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">LLM Providers</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure external models and APIs to power generation.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading providers...</p> : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-green-600">{message}</p> : null}
      <Tabs value={activeProvider} onValueChange={selectProvider}>
        <TabsList className="w-full">
          {LLM_PROVIDERS.map((provider) => (
            <TabsTrigger key={provider.value} value={provider.value} className="flex-1">
              {provider.label}
            </TabsTrigger>
          ))}
        </TabsList>

      {/* Config Form Cards */}
      <div className="mt-4 rounded-xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
        <TabsContent value="openai">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <Cpu className="h-4.5 w-4.5 text-indigo-500" />
              <span>OpenAI API Integration</span>
            </div>

            <div className="space-y-3">
             <Input type="url" placeholder="https://api.openai.com/v1" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">API Key</label>
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="Leave blank to keep the saved key"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    className="pr-10 border-border/80 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Default Model</label>
                <Select                 value={model} onValueChange={setModel}>
                  <SelectTrigger className="w-full border-border/80">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
           </div>
        </TabsContent>

        <TabsContent value="google">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium text-sm"><Globe className="h-4.5 w-4.5 text-blue-500" /><span>Google Gemini</span></div>
            <Input type="url" placeholder="https://generativelanguage.googleapis.com" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
            <Input type="password" placeholder="Google API key" value={credential} onChange={(e) => setCredential(e.target.value)} />
            <Input placeholder="gemini-2.0-flash" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </TabsContent>
        <TabsContent value="ollama">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <Database className="h-4.5 w-4.5 text-orange-500" />
              <span>Ollama (Local Models)</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Base Connection URL</label>
                <Input
                  type="text"
                  placeholder="http://localhost:11434"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="border-border/80 focus-visible:ring-orange-500/20 focus-visible:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Model Identifier</label>
                <Input
                  type="text"
                  placeholder="llama3, mistral, etc."
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="border-border/80 focus-visible:ring-orange-500/20 focus-visible:border-orange-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="h-8 border-border/80 text-xs font-medium shadow-none hover:bg-muted/40"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </Button>

              </div>
            </div>
           </div>
        </TabsContent>

      </div>
      </Tabs>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={handleTest} disabled={busy || testing}>Test</Button>
        <Button variant="outline" onClick={handleActivate} disabled={busy || !providerId}>Activate</Button>
        <Button variant="outline" onClick={handleDelete} disabled={busy || !providerId}>Delete</Button>
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
