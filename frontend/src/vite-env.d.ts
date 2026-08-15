/// <reference types="vite/client" />

declare module '*.css'

interface Window {
  showToast?: (message: string, type?: "success" | "error") => void;
}