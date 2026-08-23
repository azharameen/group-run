/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare module '*.css'

declare global {
  namespace JSX {
    type Element = React.ReactElement;
    type IntrinsicElements = React.JSX.IntrinsicElements;
  }
}

interface Window {
  showToast?: (message: string, type?: "success" | "error") => void;
}

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}