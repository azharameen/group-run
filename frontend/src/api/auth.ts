import { request } from "./request"

export interface UserProfile {
  uid: string
  email: string | null
  display_name: string | null
  photo_url: string | null
  provider: string
  created_at: string
  updated_at: string
  last_sign_in_at: string
}

export interface AuthBootstrapResponse {
  user: UserProfile
  is_new_user: boolean
}

export function bootstrapAuthenticatedUser(): Promise<AuthBootstrapResponse> {
  return request<AuthBootstrapResponse>("/auth/bootstrap", {
    method: "POST",
  })
}
