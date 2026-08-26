import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/context/AuthContext"
import SignIn from "@/pages/SignIn"

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const signInWithGoogle = vi.fn().mockResolvedValue(undefined)

describe("authentication routing", () => {
  beforeEach(() => {
    signInWithGoogle.mockClear()
  })

  it("redirects unauthenticated users to sign in", () => {
    mockedUseAuth.mockReturnValue({
      status: "unauthenticated",
      user: null,
      firebaseUser: null,
      signInWithGoogle,
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={["/ideas"]}>
        <Routes>
          <Route path="/sign-in" element={<div>Sign in destination</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/ideas" element={<div>Protected ideas</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText("Sign in destination")).toBeInTheDocument()
    expect(screen.queryByText("Protected ideas")).not.toBeInTheDocument()
  })

  it("starts Google sign in from the adaptive sign-in page", () => {
    mockedUseAuth.mockReturnValue({
      status: "unauthenticated",
      user: null,
      firebaseUser: null,
      signInWithGoogle,
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter>
        <SignIn />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    expect(signInWithGoogle).toHaveBeenCalledOnce()
    expect(
      screen.getByAltText("A collaborative team working together in a modern workspace"),
    ).toBeInTheDocument()
  })

  it("redirects authenticated users away from sign in", () => {
    mockedUseAuth.mockReturnValue({
      status: "authenticated",
      user: {
        uid: "user-1",
        email: "user@example.com",
        display_name: "User",
        photo_url: null,
        provider: "google.com",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        last_sign_in_at: "2026-01-01T00:00:00Z",
      },
      firebaseUser: null,
      signInWithGoogle,
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={[{ pathname: "/sign-in", state: { from: { pathname: "/ideas" } } }]}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/ideas" element={<div>Ideas destination</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText("Ideas destination")).toBeInTheDocument()
  })
})
