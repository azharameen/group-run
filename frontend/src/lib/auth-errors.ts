import { FirebaseError } from "firebase/app"

export interface SafeAuthError {
  title: string
  description: string
}

const AUTH_ERRORS: Record<string, SafeAuthError> = {
  "auth/popup-closed-by-user": {
    title: "Sign-in cancelled",
    description: "The Google sign-in window was closed before completion.",
  },
  "auth/cancelled-popup-request": {
    title: "Sign-in already open",
    description: "Complete the existing Google sign-in window and try again.",
  },
  "auth/popup-blocked": {
    title: "Popup blocked",
    description: "Allow popups for this site, then try signing in again.",
  },
  "auth/network-request-failed": {
    title: "Connection problem",
    description: "Check your connection and try again.",
  },
  "auth/unauthorized-domain": {
    title: "Sign-in unavailable",
    description: "Google sign-in is not configured for this domain.",
  },
  "auth/account-exists-with-different-credential": {
    title: "Account already exists",
    description: "This email is already linked to another sign-in method.",
  },
  "auth/user-disabled": {
    title: "Account disabled",
    description: "This account cannot sign in. Contact your administrator.",
  },
}

export function toSafeAuthError(error: unknown): SafeAuthError {
  if (error instanceof FirebaseError && AUTH_ERRORS[error.code]) {
    return AUTH_ERRORS[error.code]
  }
  return {
    title: "Unable to sign in",
    description: "Google sign-in could not be completed. Please try again.",
  }
}
