import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, logEvent, isSupported, type Analytics } from "firebase/analytics";
import { getPerformance, trace as firebaseTrace, type FirebasePerformance } from "firebase/performance";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD3vt3WsPvKuImjw33e1p4CH45jQJLnOUY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "companion-2888a.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "companion-2888a",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "companion-2888a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "601546984807",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:601546984807:web:9f1a42c6bfb6768b3e73c2",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-WQ0VXJPD2T",
};

let app: FirebaseApp | null = null;
let analyticsInstance: Analytics | null = null;
let perfInstance: FirebasePerformance | null = null;

if (typeof window !== "undefined") {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

    isSupported()
      .then((supported) => {
        if (supported && app) {
          analyticsInstance = getAnalytics(app);
        }
      })
      .catch((err) => {
        console.warn("Firebase Analytics check failed:", err);
      });

    try {
      perfInstance = getPerformance(app);
    } catch (err) {
      console.warn("Firebase Performance Monitoring failed to initialize:", err);
    }
  } catch (err) {
    console.warn("Firebase App initialization failed:", err);
  }
}

/**
 * Log a Firebase Analytics custom event safely.
 */
export function trackEvent(eventName: string, eventParams?: Record<string, any>) {
  if (analyticsInstance) {
    try {
      logEvent(analyticsInstance, eventName, eventParams);
    } catch (err) {
      console.warn(`Failed to log analytics event '${eventName}':`, err);
    }
  }
}

/**
 * Start a custom Firebase Performance Monitoring trace.
 * Returns an object with a .stop() method.
 */
export function startTrace(traceName: string): { stop: () => void } | null {
  if (!perfInstance) return null;
  try {
    const t = firebaseTrace(perfInstance, traceName);
    t.start();
    return {
      stop: () => {
        try {
          t.stop();
        } catch {
          /* ignore duplicate stop calls */
        }
      },
    };
  } catch {
    return null;
  }
}

/**
 * Helper to log exceptions to Firebase Analytics.
 */
export function trackException(error: Error | string, fatal = false) {
  const message = typeof error === "string" ? error : error.message;
  const stack = typeof error === "string" ? undefined : error.stack;
  trackEvent("exception", {
    description: message,
    fatal,
    stack: stack?.slice(0, 500),
  });
}
