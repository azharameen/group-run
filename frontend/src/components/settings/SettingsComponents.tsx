import * as React from "react"
import {
  Pencil,
  LogOut,
  Eye,
  EyeOff,
  Check,
  Globe,
  Settings,
  Cpu,
  Database,
  Lock,
  ChevronDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// -------------------------------------------------------------
// 1. Account Settings
// -------------------------------------------------------------
export function AccountSettings() {
  const [username, setUsername] = React.useState("Azhar Ameen")
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
            <AvatarImage src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=150&h=150&q=80" alt="Avatar" />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold">AA</AvatarFallback>
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
          <span className="text-sm text-foreground">azharameen52@gmail.com</span>
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
  const [activeProvider, setActiveProvider] = React.useState<"openai" | "ollama" | "custom">("openai")
  
  // State for OpenAI inputs
  const [showOpenAIKey, setShowOpenAIKey] = React.useState(false)
  const [openaiKey, setOpenaiKey] = React.useState("")
  const [openaiModel, setOpenaiModel] = React.useState("gpt-4o")

  // State for Ollama inputs
  const [ollamaUrl, setOllamaUrl] = React.useState("http://localhost:11434")
  const [ollamaModel, setOllamaModel] = React.useState("llama3")
  const [ollamaStatus, setOllamaStatus] = React.useState<"idle" | "testing" | "success" | "error">("idle")

  // State for Custom Endpoint inputs
  const [customUrl, setCustomUrl] = React.useState("")
  const [customKey, setCustomKey] = React.useState("")
  const [showCustomKey, setShowCustomKey] = React.useState(false)
  const [customModel, setCustomModel] = React.useState("")

  const handleTestOllama = () => {
    setOllamaStatus("testing")
    setTimeout(() => {
      setOllamaStatus("success")
    }, 1200)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">LLM Providers</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure external models and APIs to power generation.
        </p>
      </div>

      {/* Provider Selector Tabs */}
      <div className="flex rounded-lg border border-border/80 p-1 bg-muted/30">
        <button
          onClick={() => setActiveProvider("openai")}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeProvider === "openai"
              ? "bg-background text-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          OpenAI
        </button>
        <button
          onClick={() => setActiveProvider("ollama")}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeProvider === "ollama"
              ? "bg-background text-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Ollama (Local)
        </button>
        <button
          onClick={() => setActiveProvider("custom")}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeProvider === "custom"
              ? "bg-background text-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Custom Endpoint
        </button>
      </div>

      {/* Config Form Cards */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
        {activeProvider === "openai" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <Cpu className="h-4.5 w-4.5 text-indigo-500" />
              <span>OpenAI API Integration</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">API Key</label>
                <div className="relative">
                  <Input
                    type={showOpenAIKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="pr-10 border-border/80 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Default Model</label>
                <Select value={openaiModel} onValueChange={setOpenaiModel}>
                  <SelectTrigger className="w-full border-border/80">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">gpt-4o (Recommended)</SelectItem>
                    <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                    <SelectItem value="o1-mini">o1-mini</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">gpt-3.5-turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {activeProvider === "ollama" && (
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
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="border-border/80 focus-visible:ring-orange-500/20 focus-visible:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Model Identifier</label>
                <Input
                  type="text"
                  placeholder="llama3, mistral, etc."
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="border-border/80 focus-visible:ring-orange-500/20 focus-visible:border-orange-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestOllama}
                  disabled={ollamaStatus === "testing"}
                  className="h-8 border-border/80 text-xs font-medium shadow-none hover:bg-muted/40"
                >
                  {ollamaStatus === "testing" ? "Testing..." : "Test Connection"}
                </Button>

                {ollamaStatus === "success" && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1.5 animate-fade-in">
                    <Check className="h-4.5 w-4.5" /> Ollama connected successfully
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {activeProvider === "custom" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <Globe className="h-4.5 w-4.5 text-blue-500" />
              <span>Custom API / Proxy Endpoint</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Endpoint Base URL</label>
                <Input
                  type="url"
                  placeholder="https://api.yourproxy.com/v1"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="border-border/80 focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">API Key (If required)</label>
                <div className="relative">
                  <Input
                    type={showCustomKey ? "text" : "password"}
                    placeholder="API credential key"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    className="pr-10 border-border/80 focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCustomKey(!showCustomKey)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showCustomKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Model Name Mapping</label>
                <Input
                  type="text"
                  placeholder="meta-llama/Llama-3-70b-chat-hf"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="border-border/80 focus-visible:ring-blue-500/20 focus-visible:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="default" className="h-9 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-sm transition-all border-none">
          Save Settings
        </Button>
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
