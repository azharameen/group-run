import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest"

const projectId = "demo-companion-auth"
let testEnvironment: RulesTestEnvironment

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8085,
      rules: readFileSync(resolve(import.meta.dirname, "../../../firestore.rules"), "utf8"),
    },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "owner"), {
      uid: "owner",
      email: "owner@example.com",
      display_name: "Owner",
      photo_url: null,
      provider: "google.com",
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
      last_sign_in_at: new Date("2026-01-01T00:00:00Z"),
    })
  })
})

afterAll(async () => {
  await testEnvironment.cleanup()
})

describe("users profile rules", () => {
  it("allows an owner to read their profile", async () => {
    const db = testEnvironment.authenticatedContext("owner").firestore()
    await assertSucceeds(getDoc(doc(db, "users", "owner")))
  })

  it("denies anonymous and cross-user reads", async () => {
    const anonymous = testEnvironment.unauthenticatedContext().firestore()
    const stranger = testEnvironment.authenticatedContext("stranger").firestore()
    await assertFails(getDoc(doc(anonymous, "users", "owner")))
    await assertFails(getDoc(doc(stranger, "users", "owner")))
  })

  it("allows owner updates to mutable profile fields", async () => {
    const db = testEnvironment.authenticatedContext("owner").firestore()
    await assertSucceeds(
      updateDoc(doc(db, "users", "owner"), {
        display_name: "Updated Owner",
        photo_url: "https://example.com/photo.jpg",
        updated_at: serverTimestamp(),
      }),
    )
  })

  it("denies client creation, deletion, and identity changes", async () => {
    const db = testEnvironment.authenticatedContext("owner").firestore()
    await assertFails(
      setDoc(doc(db, "users", "new-user"), {
        uid: "new-user",
        email: "new@example.com",
      }),
    )
    await assertFails(
      updateDoc(doc(db, "users", "owner"), {
        email: "attacker@example.com",
        updated_at: serverTimestamp(),
      }),
    )
    await assertFails(deleteDoc(doc(db, "users", "owner")))
  })
})
