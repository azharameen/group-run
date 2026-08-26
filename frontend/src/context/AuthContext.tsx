import {
  GoogleAuthProvider,
  getRedirectResult,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  bootstrapAuthenticatedUser,
  type UserProfile,
} from "@/api/auth"
import { onAuthExpired } from "@/api/request"
import { toast } from "@/hooks/use-toast"
import { toSafeAuthError } from "@/lib/auth-errors"
import { auth, authPersistenceReady } from "@/lib/firebase"

type AuthStatus = "loading" | "authenticated" | "unauthenticated"

interface AuthContextValue {
  status: AuthStatus
  user: UserProfile | null
  firebaseUser: User | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const SIGN_IN_PENDING_KEY = "companion:google-sign-in-pending"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUser] = useState<UserProfile | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const generationRef = useRef(0)

  const clearSession = useCallback(async () => {
    generationRef.current += 1
    await firebaseSignOut(auth)
    setFirebaseUser(null)
    setUser(null)
    setStatus("unauthenticated")
  }, [])

  useEffect(() => {
    return onAuthExpired(() => {
      void clearSession().finally(() => {
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "Sign in again to continue.",
        })
      })
    })
  }, [clearSession])

  useEffect(() => {
    let active = true
    let unsubscribe = () => {}

    void authPersistenceReady.then(async () => {
      if (!active) return
      try {
        await getRedirectResult(auth)
      } catch (error) {
        sessionStorage.removeItem(SIGN_IN_PENDING_KEY)
        const safeError = toSafeAuthError(error)
        toast({ variant: "destructive", ...safeError })
      }

      unsubscribe = onIdTokenChanged(auth, async (nextFirebaseUser) => {
        const generation = ++generationRef.current
        window.dispatchEvent(new Event("companion:id-token-changed"))

        if (!nextFirebaseUser) {
          if (!active || generation !== generationRef.current) return
          setFirebaseUser(null)
          setUser(null)
          setStatus("unauthenticated")
          return
        }

        setStatus("loading")
        try {
          const bootstrap = await bootstrapAuthenticatedUser()
          if (!active || generation !== generationRef.current) return
          setFirebaseUser(nextFirebaseUser)
          setUser(bootstrap.user)
          setStatus("authenticated")

          if (sessionStorage.getItem(SIGN_IN_PENDING_KEY)) {
            sessionStorage.removeItem(SIGN_IN_PENDING_KEY)
            toast({
              title: bootstrap.is_new_user ? "Welcome to Companion" : "Welcome back",
              description: "You are signed in with Google.",
            })
          }
        } catch {
          if (!active || generation !== generationRef.current) return
          await clearSession()
          toast({
            variant: "destructive",
            title: "Sign-in could not be completed",
            description: "Your account could not be prepared. Please try again.",
          })
        }
      })
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [clearSession])

  const signInWithGoogle = useCallback(async () => {
    sessionStorage.setItem(SIGN_IN_PENDING_KEY, "true")
    setStatus("loading")
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })

    try {
      if (window.matchMedia("(max-width: 767px)").matches) {
        await signInWithRedirect(auth, provider)
        return
      }
      await signInWithPopup(auth, provider)
    } catch (error) {
      sessionStorage.removeItem(SIGN_IN_PENDING_KEY)
      setStatus("unauthenticated")
      const safeError = toSafeAuthError(error)
      toast({ variant: "destructive", ...safeError })
    }
  }, [])

  const signOut = useCallback(async () => {
    await clearSession()
    toast({ title: "Signed out", description: "You have been signed out securely." })
  }, [clearSession])

  const value = useMemo(
    () => ({ status, user, firebaseUser, signInWithGoogle, signOut }),
    [status, user, firebaseUser, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
