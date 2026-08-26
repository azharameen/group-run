import { FirebaseError } from "firebase/app"
import { describe, expect, it } from "vitest"

import { toSafeAuthError } from "@/lib/auth-errors"

describe("toSafeAuthError", () => {
  it("maps known Firebase errors to safe product copy", () => {
    expect(toSafeAuthError(new FirebaseError("auth/popup-blocked", "raw provider details"))).toEqual({
      title: "Popup blocked",
      description: "Allow popups for this site, then try signing in again.",
    })
  })

  it("never exposes unknown raw Firebase messages", () => {
    const result = toSafeAuthError(
      new FirebaseError("auth/internal-error", "sensitive raw response"),
    )
    expect(result.description).not.toContain("sensitive")
    expect(result.title).toBe("Unable to sign in")
  })
})
