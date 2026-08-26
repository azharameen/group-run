import { auth } from "@/lib/firebase"
import { formatApiError } from "./errors"

const API_BASE = "/api"
const AUTH_EXPIRED_EVENT = "companion:auth-expired"

export const DEFAULT_TIMEOUT_MS = 30000

export interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function apiUrl(path: string): string {
  return path.startsWith("/api/") ? path : `${API_BASE}${path}`
}

function announceExpiredSession() {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

export function onAuthExpired(handler: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, handler)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
}

export async function authenticatedFetch(
  path: string,
  options: RequestInit = {},
  forceRefresh = false,
): Promise<Response> {
  const user = auth.currentUser
  if (!user) {
    announceExpiredSession()
    throw new ApiError(401, "Your session has expired. Please sign in again.")
  }

  const token = await user.getIdToken(forceRefresh)
  const headers = new Headers(options.headers)
  headers.set("Authorization", `Bearer ${token}`)
  if (!(options.body instanceof FormData) && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(apiUrl(path), { ...options, headers })
  if (response.status === 401 && !forceRefresh) {
    return authenticatedFetch(path, options, true)
  }
  if (response.status === 401) {
    announceExpiredSession()
  }
  return response
}

export async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...fetchOptions } = options || {}
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener("abort", abort, { once: true })

  try {
    const response = await authenticatedFetch(path, {
      ...fetchOptions,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new ApiError(response.status, formatApiError(response.status, await response.text()))
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  } catch (error) {
    if (timedOut) {
      throw new Error(`API timeout after ${timeoutMs} ms`)
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abort)
  }
}
