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

// ─── OpenAI Model Options ─────────────────────────────────────────────────────

export interface ModelOption {
	value: string;
	label: string;
}

export const OPENAI_MODELS: ModelOption[] = [
	{ value: "gpt-4o", label: "gpt-4o (Recommended)" },
	{ value: "gpt-4-turbo", label: "gpt-4-turbo" },
	{ value: "o1-mini", label: "o1-mini" },
	{ value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
];

// ─── LLM Provider Options ─────────────────────────────────────────────────────

export type LLMProvider = "openai" | "ollama" | "custom";

export interface LLMProviderOption {
	value: LLMProvider;
	label: string;
}

export const LLM_PROVIDERS: LLMProviderOption[] = [
	{ value: "openai", label: "OpenAI" },
	{ value: "ollama", label: "Ollama (Local)" },
	{ value: "custom", label: "Custom Endpoint" },
];

// ─── Default Account Profile ──────────────────────────────────────────────────

export const DEFAULT_ACCOUNT_PROFILE = {
	username: "Azhar Ameen",
	email: "azharameen52@gmail.com",
	avatarUrl:
		"https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=150&h=150&q=80",
	avatarFallback: "AA",
};

// ─── Default Provider Configs ─────────────────────────────────────────────────

export const DEFAULT_PROVIDER_CONFIGS = {
	openai: {
		defaultModel: "gpt-4o",
	},
	ollama: {
		baseUrl: "http://localhost:11434",
		defaultModel: "llama3",
	},
	custom: {
		baseUrl: "",
		apiKey: "",
		modelName: "",
	},
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
