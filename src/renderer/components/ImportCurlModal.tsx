import { useState } from 'react';

interface ImportCurlModalProps {
  onImport(curl: string): void;
  onClose(): void;
}

export function ImportCurlModal({ onImport, onClose }: ImportCurlModalProps) {
  const [curlText, setCurlText] = useState('');

  function handleImport() {
    if (!curlText.trim()) return;
    onImport(curlText.trim());
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-pm-bg-t border border-pm-border rounded-lg shadow-2xl shadow-black/50 w-full max-w-[560px] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-pm-border-s">
          <h2 className="text-sm font-semibold text-pm-text">Import cURL</h2>
          <button
            className="w-6 h-6 flex items-center justify-center rounded text-pm-text-t hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={onClose}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label className="text-xs text-pm-text-s font-medium mb-2 block">
            Paste your cURL command below
          </label>
          <textarea
            className="pm-input font-mono text-xs min-h-[160px] bg-pm-bg-input leading-relaxed"
            placeholder={`curl -X POST https://api.example.com/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-xxx" \\
  -d '{"name": "John", "email": "john@example.com"}'`}
            value={curlText}
            onChange={(e) => setCurlText(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <p className="text-[11px] text-pm-text-t mt-2">
            Supports method, URL, headers, body, basic auth, and bearer tokens.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-pm-border-s">
          <button
            className="px-3.5 py-1.5 text-xs font-medium text-pm-text-s border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-3.5 py-1.5 text-xs font-semibold bg-pm-orange text-white rounded hover:bg-pm-orange-h transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleImport}
            disabled={!curlText.trim()}
            type="button"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
