import type { AppApi } from './ipc';

declare global {
  interface Window {
    appApi: AppApi;
  }
}

export {};
