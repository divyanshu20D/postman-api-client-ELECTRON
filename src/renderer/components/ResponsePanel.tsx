import { useEffect, useMemo, useState } from 'react';
import type { ExecutionResult } from '@shared/models';
import {
  copyTextToClipboard,
  formatJson,
  getCollapsibleJsonPaths,
  HighlightedJsonView,
  JsonTreeView,
  parseJsonValue,
} from './JsonCodeBlock';

const RESPONSE_TABS = ['Body', 'Headers', 'Console'] as const;
type ResponseTab = (typeof RESPONSE_TABS)[number];

interface ResponsePanelProps {
  response: ExecutionResult | null;
  loading: boolean;
  error: string | null;
  consoleLogs: string[];
}

function getStatusColor(code: number): string {
  if (code === 0) return 'text-st-error';
  if (code < 300) return 'text-st-success';
  if (code < 400) return 'text-st-warning';
  return 'text-st-error';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResponsePanel({ response, loading, error, consoleLogs }: ResponsePanelProps) {
  const [activeTab, setActiveTab] = useState<ResponseTab>('Body');
  const [jsonViewMode, setJsonViewMode] = useState<'tree' | 'raw'>('tree');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [copyLabel, setCopyLabel] = useState('Copy');

  const formattedBody = useMemo(
    () => formatJson(response?.body ?? ''),
    [response?.body],
  );
  const parsedBody = useMemo(
    () => parseJsonValue(response?.body ?? ''),
    [response?.body],
  );
  const collapsiblePaths = useMemo(
    () => (parsedBody !== undefined ? getCollapsibleJsonPaths(parsedBody) : []),
    [parsedBody],
  );

  useEffect(() => {
    setJsonViewMode('tree');
    setCollapsedPaths(new Set());
    setCopyLabel('Copy');
  }, [response?.body]);

  async function handleCopyBody() {
    const text = formattedBody ?? response?.body ?? '';
    const copied = await copyTextToClipboard(text);
    setCopyLabel(copied ? 'Copied' : 'Copy failed');
    window.setTimeout(() => setCopyLabel('Copy'), 1200);
  }

  function handleCollapseAll() {
    setCollapsedPaths(new Set(collapsiblePaths));
  }

  function handleExpandAll() {
    setCollapsedPaths(new Set());
  }

  function handleTogglePath(path: string) {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className="flex-1 flex flex-col min-h-[180px] overflow-hidden">
      {/* Response status bar */}
      <div className="flex items-center gap-3 px-4 border-b border-pm-border-s bg-pm-bg min-h-[36px]">
        <span className="text-xs font-semibold text-pm-text-s mr-auto">Response</span>

        {loading && (
          <span className="text-[11px] text-pm-orange font-medium animate-pulse">Sending...</span>
        )}

        {response && !loading && (
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded font-semibold">
              <span className="text-pm-text-t font-normal">Status:</span>
              <span className={getStatusColor(response.statusCode)}>
                {response.statusCode === 0 ? 'Error' : `${response.statusCode} ${response.statusText}`}
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded font-semibold">
              <span className="text-pm-text-t font-normal">Time:</span>
              <span className="text-st-success">{response.durationMs} ms</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded font-semibold">
              <span className="text-pm-text-t font-normal">Size:</span>
              <span className="text-st-info">{formatSize(response.sizeBytes)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Response tabs */}
      <div className="flex items-center gap-0 px-4 border-b border-pm-border-s bg-pm-bg">
        {RESPONSE_TABS.map((tab) => (
          <button
            key={tab}
            className={`px-3.5 py-2 text-xs border-b-2 transition-all duration-150 ${
              activeTab === tab
                ? 'text-pm-text border-pm-orange'
                : 'text-pm-text-s border-transparent hover:text-pm-text'
            }`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
            {tab === 'Headers' && response && (
              <span className="ml-1 text-[10px] px-1.5 rounded-lg bg-pm-bg-t text-pm-text-t font-semibold">
                {response.headers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!response && !loading && !error ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-pm-text-t p-8">
          <div className="w-20 h-20 rounded-full bg-pm-bg-t flex items-center justify-center text-pm-text-t">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="text-base font-semibold text-pm-text-s">Hit Send to get a response</div>
          <div className="text-xs text-center max-w-[300px] leading-relaxed">
            Enter a URL and click Send to make a request. The response will appear here.
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-pm-bg">
          {activeTab === 'Body' && (
            loading ? (
              <div className="flex items-center justify-center p-12 text-pm-text-t">
                <div className="text-center">
                  <div className="text-2xl mb-2 animate-pulse text-pm-orange">&#9679;</div>
                  <div className="text-xs">Sending request...</div>
                </div>
              </div>
            ) : response ? (
              formattedBody && parsedBody !== undefined ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-pm-border-s bg-pm-bg-s text-[11px] text-pm-text-t">
                    <button
                      type="button"
                      onClick={() => setJsonViewMode('tree')}
                      className={`px-2 py-0.5 rounded border transition-all duration-150 ${
                        jsonViewMode === 'tree'
                          ? 'border-pm-orange text-pm-text bg-pm-active'
                          : 'border-pm-border hover:bg-pm-hover hover:text-pm-text'
                      }`}
                    >
                      Tree
                    </button>
                    <button
                      type="button"
                      onClick={() => setJsonViewMode('raw')}
                      className={`px-2 py-0.5 rounded border transition-all duration-150 ${
                        jsonViewMode === 'raw'
                          ? 'border-pm-orange text-pm-text bg-pm-active'
                          : 'border-pm-border hover:bg-pm-hover hover:text-pm-text'
                      }`}
                    >
                      Raw
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyBody()}
                      className="px-2 py-0.5 rounded border border-pm-border hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                    >
                      {copyLabel}
                    </button>
                    {jsonViewMode === 'tree' && (
                      <>
                        <button
                          type="button"
                          onClick={handleExpandAll}
                          className="px-2 py-0.5 rounded border border-pm-border hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                        >
                          Expand all
                        </button>
                        <button
                          type="button"
                          onClick={handleCollapseAll}
                          className="px-2 py-0.5 rounded border border-pm-border hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                        >
                          Collapse all
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {jsonViewMode === 'tree' ? (
                      <JsonTreeView value={parsedBody} collapsedPaths={collapsedPaths} onToggle={handleTogglePath} />
                    ) : (
                      <HighlightedJsonView value={formattedBody} />
                    )}
                  </div>
                </div>
              ) : (
                <pre className="m-0 p-4 font-mono text-xs leading-[1.7] text-pm-text whitespace-pre-wrap break-all">
                  {response.body}
                </pre>
              )
            ) : error ? (
              <div className="p-4 text-st-error text-xs font-mono whitespace-pre-wrap break-all">{error}</div>
            ) : null
          )}

          {activeTab === 'Headers' && response && (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 px-4 bg-pm-bg-s text-pm-text-t text-[11px] font-semibold uppercase tracking-wide border-b border-pm-border-s">
                    Key
                  </th>
                  <th className="text-left py-2 px-4 bg-pm-bg-s text-pm-text-t text-[11px] font-semibold uppercase tracking-wide border-b border-pm-border-s">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {response.headers.map(({ key, value }) => (
                  <tr key={key} className="hover:bg-pm-hover transition-colors">
                    <td className="w-[32%] py-1.5 px-4 align-top border-b border-pm-border-s text-pm-orange font-medium whitespace-pre-wrap break-all">{key}</td>
                    <td className="py-1.5 px-4 align-top border-b border-pm-border-s text-pm-text whitespace-pre-wrap break-all">{value}</td>
                  </tr>
                ))}
                {response.headers.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 px-4 text-center text-pm-text-t">No response headers</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'Console' && (
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 font-mono text-xs leading-[1.7] bg-pm-bg">
              {consoleLogs.map((log, i) => (
                <div key={i} className="py-px text-pm-text-s whitespace-pre-wrap break-all">
                  {log}
                </div>
              ))}
              {consoleLogs.length === 0 && (
                <div className="text-pm-text-t">No console output yet.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
