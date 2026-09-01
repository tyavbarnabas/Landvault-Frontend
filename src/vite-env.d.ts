/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API, e.g. https://api.example.com. Unset = mock mode (see INTEGRATION.md). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
