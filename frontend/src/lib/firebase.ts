import { getAnalytics, isSupported, logEvent, type Analytics } from "firebase/analytics"
import { getApp, getApps, initializeApp } from "firebase/app"
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from "firebase/auth"
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore"
import {
  getPerformance,
  trace as firebaseTrace,
  type FirebasePerformance,
} from "firebase/performance"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD3vt3WsPvKuImjw33e1p4CH45jQJLnOUY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "companion-2888a.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "companion-2888a",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "companion-2888a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "601546984807",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID || "1:601546984807:web:9f1a42c6bfb6768b3e73c2",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-WQ0VXJPD2T",
}

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const firestore = getFirestore(firebaseApp)
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence)

if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
  connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, {
    disableWarnings: true,
  })
}

if (import.meta.env.VITE_FIRESTORE_EMULATOR_HOST) {
  const [host, port] = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST.split(":")
  connectFirestoreEmulator(firestore, host, Number(port))
}

let analyticsInstance: Analytics | null = null
let perfInstance: FirebasePerformance | null = null

if (typeof window !== "undefined") {
  void isSupported().then((supported) => {
    if (supported) {
      analyticsInstance = getAnalytics(firebaseApp)
    }
  })

  try {
    perfInstance = getPerformance(firebaseApp)
  } catch {
    perfInstance = null
  }
}

export function trackEvent(eventName: string, eventParams?: Record<string, unknown>) {
  if (!analyticsInstance) return
  try {
    logEvent(analyticsInstance, eventName, eventParams)
  } catch {
    // Analytics must never affect application behavior.
  }
}

export function startTrace(traceName: string): { stop: () => void } | null {
  if (!perfInstance) return null
  try {
    const performanceTrace = firebaseTrace(perfInstance, traceName)
    performanceTrace.start()
    return {
      stop: () => {
        try {
          performanceTrace.stop()
        } catch {
          // Performance telemetry must never affect application behavior.
        }
      },
    }
  } catch {
    return null
  }
}

export function trackException(error: Error | string, fatal = false) {
  const message = typeof error === "string" ? error : error.message
  trackEvent("exception", {
    description: message.slice(0, 500),
    fatal,
  })
}
