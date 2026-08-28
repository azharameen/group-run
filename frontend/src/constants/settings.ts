// ─── Language Options ─────────────────────────────────────────────────────────

export interface LanguageOption {
	value: string;
	label: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
	{ value: "en", label: "English" },
	{ value: "es", label: "Español" },
	{ value: "fr", label: "Français" },
	{ value: "de", label: "Deutsch" },
];

// ─── LLM Provider Options ─────────────────────────────────────────────────────

export type LLMProvider = "openai" | "google" | "ollama" | "anthropic";

export interface LLMProviderOption {
	value: LLMProvider;
	label: string;
}

export const LLM_PROVIDERS: LLMProviderOption[] = [
	{ value: "openai", label: "OpenAI" },
	{ value: "google", label: "Google Gemini Developer API" },
	{ value: "ollama", label: "Ollama (Local)" },
	{ value: "anthropic", label: "Anthropic" },
];

// ─── Default Account Profile ──────────────────────────────────────────────────

export const DEFAULT_ACCOUNT_PROFILE = {
	username: "User",
	email: "",
	avatarUrl: "",
	avatarFallback: "U",
};

// ─── Theme Options ────────────────────────────────────────────────────────────

export type ThemeOption = "system" | "light" | "dark";

export interface ThemeConfig {
	value: ThemeOption;
	label: string;
	bgClass: string;
	previewLines?: { topClass: string; bottomClass: string };
}

export const THEME_OPTIONS: ThemeConfig[] = [
	{
		value: "system",
		label: "System",
		bgClass: "bg-gradient-to-r from-zinc-100 to-zinc-900",
	},
	{
		value: "light",
		label: "Light",
		bgClass: "bg-zinc-50",
		previewLines: {
			topClass: "absolute inset-x-2 top-2 h-1.5 rounded-sm bg-zinc-200/80",
			bottomClass: "absolute left-2 bottom-2 right-6 h-1 rounded-sm bg-zinc-200/50",
		},
	},
	{
		value: "dark",
		label: "Dark",
		bgClass: "bg-zinc-900",
		previewLines: {
			topClass: "absolute inset-x-2 top-2 h-1.5 rounded-sm bg-zinc-800",
			bottomClass: "absolute left-2 bottom-2 right-6 h-1 rounded-sm bg-zinc-800/80",
		},
	},
];
