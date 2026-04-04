import type * as React from 'react';
import type { AppApi } from './ipc';
import type { WebviewTag } from 'electron';

declare global {
  interface Window {
    appApi: AppApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewTag>, WebviewTag> & {
        allowpopups?: boolean | 'true' | 'false';
        partition?: string;
        src?: string;
      };
    }
  }
}

export {};
