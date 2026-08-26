import { GoogleAuthProvider, signInWithCredential } from "firebase/auth"

import { auth, authPersistenceReady } from "@/lib/firebase"

export interface EmulatorGoogleProfile {
  sub: string
  email: string
  name: string
  picture?: string
}

export async function signInWithGoogleEmulatorForTesting(
  profile: EmulatorGoogleProfile,
): Promise<void> {
  if (!import.meta.env.DEV || !import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
    throw new Error("Firebase emulator sign-in is available only in emulator development builds")
  }

  await authPersistenceReady
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({
      sub: profile.sub,
      email: profile.email,
      email_verified: true,
      name: profile.name,
      picture: profile.picture,
    }),
  )
  await signInWithCredential(auth, credential)
}
