import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ModelSelector } from "./ModelSelector"

vi.mock("@/api/providers", () => ({
  fetchProviderCatalog: vi.fn(),
  fetchProviderDefault: vi.fn(),
  PROVIDER_CATALOG_CHANGED_EVENT: "companion:provider-catalog-changed",
}))

import { fetchProviderCatalog, fetchProviderDefault } from "@/api/providers"
import { PROVIDER_CATALOG_CHANGED_EVENT } from "@/api/providers"

describe("ModelSelector", () => {
  it("groups only live enabled configuration models and restores the default", async () => {
    vi.mocked(fetchProviderCatalog).mockResolvedValue({
      groups: [{
        provider_id: "cfg-1",
        provider: "openai",
        name: "Work account",
        endpoint: "https://api.openai.com/v1",
        is_enabled: true,
        available: true,
        message: "available",
        models: [{ model_id: "server-model", display_name: "Server model" }],
      }],
    })
    vi.mocked(fetchProviderDefault).mockResolvedValue({
      provider_id: "cfg-1",
      model_id: "server-model",
      provider: "openai",
      name: "Work account",
      updated_at: "now",
    })
    const onChange = vi.fn()

    render(<ModelSelector value={null} onChange={onChange} />)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({
      provider_id: "cfg-1",
      model_id: "server-model",
    }))
    const user = userEvent.setup()
    screen.getByRole("combobox", { name: "Chat model" }).focus()
    await user.keyboard("{ArrowDown}")
    expect(await screen.findByText("Work account · openai")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Server model" })).toBeInTheDocument()
  })

  it("shows an actionable unavailable state", async () => {
    vi.mocked(fetchProviderCatalog).mockResolvedValue({ groups: [] })
    vi.mocked(fetchProviderDefault).mockResolvedValue(null)

    render(<ModelSelector value={null} onChange={vi.fn()} />)

    expect(
      await screen.findByText(/Add and enable a provider configuration/i),
    ).toBeInTheDocument()
  })

  it("reloads mounted state and clears a selection disabled by provider lifecycle changes", async () => {
    vi.clearAllMocks()
    vi.mocked(fetchProviderCatalog)
      .mockResolvedValueOnce({
        groups: [{
          provider_id: "cfg-1",
          provider: "openai",
          name: "Work account",
          endpoint: "https://api.openai.com/v1",
          is_enabled: true,
          available: true,
          message: "available",
          models: [{ model_id: "server-model", display_name: "Server model" }],
        }],
      })
      .mockResolvedValueOnce({ groups: [] })
    vi.mocked(fetchProviderDefault)
      .mockResolvedValueOnce({
        provider_id: "cfg-1",
        model_id: "server-model",
        provider: "openai",
        name: "Work account",
        updated_at: "now",
      })
      .mockResolvedValueOnce(null)
    const onChange = vi.fn()

    render(<ModelSelector value={{ provider_id: "cfg-1", model_id: "server-model" }} onChange={onChange} />)
    await screen.findByRole("combobox", { name: "Chat model" })
    window.dispatchEvent(new Event(PROVIDER_CATALOG_CHANGED_EVENT))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
    expect(fetchProviderCatalog).toHaveBeenCalledTimes(2)
    expect(fetchProviderDefault).toHaveBeenCalledTimes(2)
  })
})
