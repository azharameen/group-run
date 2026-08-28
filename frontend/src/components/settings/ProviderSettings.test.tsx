import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ProviderSettings } from "./SettingsComponents"

vi.mock("@/api/providers", () => ({
  deleteProvider: vi.fn(),
  fetchProviderCatalog: vi.fn(),
  fetchProviderDefault: vi.fn(),
  fetchProviders: vi.fn(),
  saveProvider: vi.fn(),
  setProviderDefault: vi.fn(),
  setProviderEnabled: vi.fn(),
  testProvider: vi.fn(),
  notifyProviderCatalogChanged: vi.fn(),
}))

import {
  deleteProvider,
  fetchProviderCatalog,
  fetchProviderDefault,
  fetchProviders,
  saveProvider,
  setProviderEnabled,
  testProvider,
} from "@/api/providers"

const localProvider = {
  provider_id: "local-1",
  provider: "ollama" as const,
  name: "Local Ollama",
  endpoint: "http://localhost:11434",
  is_enabled: false,
  has_credentials: false,
  created_at: "now",
  updated_at: "now",
}

function mockLoadedProviders(providers = [] as typeof localProvider[]) {
  vi.mocked(fetchProviders).mockResolvedValue({ providers, count: providers.length })
  vi.mocked(fetchProviderCatalog).mockResolvedValue({ groups: [] })
  vi.mocked(fetchProviderDefault).mockResolvedValue(null)
}

describe("ProviderSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockLoadedProviders()
  })

  it("shows conditional cloud credentials and validates the endpoint before saving", async () => {
    const user = userEvent.setup()
    vi.mocked(saveProvider).mockResolvedValue({
      ...localProvider,
      provider_id: "openai-1",
      provider: "openai",
      name: "Work",
      endpoint: "https://api.openai.com/v1",
      has_credentials: true,
    })

    render(<ProviderSettings />)
    expect(await screen.findByText("LLM Providers")).toBeInTheDocument()
    expect(screen.getByLabelText("API key")).toBeInTheDocument()

    await user.type(screen.getByLabelText("Configuration name"), "Work")
    await user.type(screen.getByLabelText("Endpoint URL"), "http://api.openai.com/v1")
    await user.type(screen.getByLabelText("API key"), "unit-test-key")
    await user.click(screen.getByRole("button", { name: "Save Settings" }))
    expect(await screen.findByText(/cloud providers require HTTPS/i)).toBeInTheDocument()
    expect(saveProvider).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText("Endpoint URL"))
    await user.type(screen.getByLabelText("Endpoint URL"), "https://api.openai.com/v1")
    await user.click(screen.getByRole("button", { name: "Save Settings" }))
    await waitFor(() =>
      expect(saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          name: "Work",
          endpoint: "https://api.openai.com/v1",
          credentials: { api_key: "unit-test-key" },
        }),
        undefined,
      ),
    )
    expect(await screen.findByRole("status")).toHaveTextContent("Provider configuration saved.")
  })

  it("hides Ollama credentials and supports enabled, tested, and deleted lifecycle states", async () => {
    const user = userEvent.setup()
    mockLoadedProviders([localProvider])
    vi.mocked(setProviderEnabled).mockResolvedValue({ ...localProvider, is_enabled: true })
    vi.mocked(testProvider).mockResolvedValue({
      provider_id: localProvider.provider_id,
      provider: "ollama",
      success: true,
      message: "Ollama connection successful",
    })
    vi.mocked(deleteProvider).mockResolvedValue()

    render(<ProviderSettings />)
    await screen.findByText("LLM Providers")
    await user.click(screen.getByRole("tab", { name: "Ollama (Local)" }))
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Configuration name")).toHaveValue("Local Ollama")

    await user.click(screen.getByRole("switch", { name: "Enable provider configuration" }))
    await waitFor(() =>
      expect(setProviderEnabled).toHaveBeenCalledWith(localProvider.provider_id, true),
    )
    await user.click(screen.getByRole("button", { name: "Test" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Ollama connection successful")

    await user.click(screen.getByRole("button", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(deleteProvider).toHaveBeenCalledWith(localProvider.provider_id))
    expect(await screen.findByRole("status")).toHaveTextContent("Provider deleted.")
  })
})
