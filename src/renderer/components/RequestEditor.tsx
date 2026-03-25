import { useMemo, useState } from 'react';
import type { SaveRequestDraftInput } from '@shared/ipc';
import type { HttpMethod } from '@shared/models';
import { METHOD_SELECT_COLOR } from '../utils/method-colors';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const REQUEST_TABS = ['Params', 'Headers', 'Body', 'Auth'] as const;
type RequestTab = (typeof REQUEST_TABS)[number];

interface RequestEditorProps {
  draft: SaveRequestDraftInput;
  onChange(draft: SaveRequestDraftInput): void;
  onSave(): void;
  onSend(): void;
}

interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
}

function parseRows(value: string, fallback: KeyValueRow[]): KeyValueRow[] {
  try {
    const parsed = JSON.parse(value) as Array<Partial<KeyValueRow>>;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.map((row) => ({
      key: row.key ?? '',
      value: row.value ?? '',
      enabled: row.enabled ?? true,
    }));
  } catch {
    return fallback;
  }
}

function serializeRows(rows: KeyValueRow[]) {
  return JSON.stringify(rows, null, 2);
}

function updateRow(rows: KeyValueRow[], index: number, next: Partial<KeyValueRow>) {
  return rows.map((row, i) => (i === index ? { ...row, ...next } : row));
}

function getActiveCount(rows: KeyValueRow[]) {
  return rows.filter((r) => r.enabled && (r.key || r.value)).length;
}

export function RequestEditor({ draft, onChange, onSave, onSend }: RequestEditorProps) {
  const [activeTab, setActiveTab] = useState<RequestTab>('Params');

  const queryRows = useMemo(
    () => parseRows(draft.queryParams, [{ key: '', value: '', enabled: true }]),
    [draft.queryParams],
  );
  const headerRows = useMemo(
    () => parseRows(draft.headers, [{ key: '', value: '', enabled: true }]),
    [draft.headers],
  );

  const paramCount = getActiveCount(queryRows);
  const headerCount = getActiveCount(headerRows);

  function addRow(field: 'queryParams' | 'headers', rows: KeyValueRow[]) {
    onChange({ ...draft, [field]: serializeRows([...rows, { key: '', value: '', enabled: true }]) });
  }

  function removeRow(field: 'queryParams' | 'headers', rows: KeyValueRow[], index: number) {
    const next = rows.filter((_, i) => i !== index);
    onChange({ ...draft, [field]: serializeRows(next.length ? next : [{ key: '', value: '', enabled: true }]) });
  }

  return (
    <>
      {/* URL Bar */}
      <div className="flex items-center gap-0 px-4 py-2.5 border-b border-pm-border-s bg-pm-bg">
        <select
          className={`pm-input w-auto min-w-[100px] py-[7px] px-2.5 font-bold text-[13px] bg-pm-bg-t border-pm-border rounded-l rounded-r-none border-r-0 cursor-pointer ${
            METHOD_SELECT_COLOR[draft.method] ?? ''
          }`}
          value={draft.method}
          onChange={(e) => onChange({ ...draft, method: e.target.value as HttpMethod })}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          className="pm-input flex-1 py-[7px] px-3 text-[13px] bg-pm-bg-input border-pm-border rounded-none border-l-0 border-r-0"
          value={draft.url}
          onChange={(e) => onChange({ ...draft, url: e.target.value })}
          placeholder="Enter request URL"
        />
        <button
          className="py-[7px] px-5 bg-pm-orange text-white font-bold text-[13px] rounded-r rounded-l-none border border-pm-orange whitespace-nowrap hover:bg-pm-orange-h transition-colors duration-150"
          type="button"
          onClick={onSend}
        >
          Send
        </button>
        <button
          className="ml-2 py-[7px] px-3.5 bg-transparent text-pm-text-s font-semibold text-xs border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
          type="button"
          onClick={onSave}
        >
          Save
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-0 px-4 border-b border-pm-border-s bg-pm-bg">
        {REQUEST_TABS.map((tab) => (
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
            {tab === 'Params' && paramCount > 0 && (
              <span className="ml-1 text-[10px] px-1.5 rounded-lg bg-pm-bg-t text-pm-text-t font-semibold">
                {paramCount}
              </span>
            )}
            {tab === 'Headers' && headerCount > 0 && (
              <span className="ml-1 text-[10px] px-1.5 rounded-lg bg-pm-bg-t text-pm-text-t font-semibold">
                {headerCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'Params' && (
          <KeyValueTable
            rows={queryRows}
            field="queryParams"
            onChange={(field, rows, index, next) =>
              onChange({ ...draft, [field]: serializeRows(updateRow(rows, index, next)) })
            }
            onAdd={() => addRow('queryParams', queryRows)}
            onRemove={(index) => removeRow('queryParams', queryRows, index)}
            onToggle={(index, checked) =>
              onChange({ ...draft, queryParams: serializeRows(updateRow(queryRows, index, { enabled: checked })) })
            }
          />
        )}

        {activeTab === 'Headers' && (
          <KeyValueTable
            rows={headerRows}
            field="headers"
            onChange={(field, rows, index, next) =>
              onChange({ ...draft, [field]: serializeRows(updateRow(rows, index, next)) })
            }
            onAdd={() => addRow('headers', headerRows)}
            onRemove={(index) => removeRow('headers', headerRows, index)}
            onToggle={(index, checked) =>
              onChange({ ...draft, headers: serializeRows(updateRow(headerRows, index, { enabled: checked })) })
            }
          />
        )}

        {activeTab === 'Body' && (
          <div className="flex flex-col flex-1">
            {/* Body type bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-pm-border-s text-xs text-pm-text-s">
              {['raw', 'form-data', 'x-www-form-urlencoded', 'binary', 'none'].map((type, i) => (
                <label key={type} className={`flex items-center gap-1 py-0.5 text-xs ${i === 0 ? 'text-pm-text' : 'text-pm-text-t'}`}>
                  <input type="radio" name="bodyType" defaultChecked={i === 0} className="w-auto accent-pm-orange" />
                  {type}
                </label>
              ))}
              <select className="pm-input ml-auto w-auto px-2 py-0.5 text-[11px] bg-pm-bg-t border-pm-border rounded">
                <option>JSON</option>
                <option>Text</option>
                <option>XML</option>
                <option>HTML</option>
              </select>
              <button
                className="px-2.5 py-0.5 text-[11px] font-medium text-pm-text-t border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                type="button"
                onClick={() => {
                  if (!draft.body) return;
                  try {
                    const formatted = JSON.stringify(JSON.parse(draft.body), null, 2);
                    onChange({ ...draft, body: formatted });
                  } catch {
                    // Not valid JSON — leave as-is
                  }
                }}
                title="Format JSON body"
              >
                Prettify
              </button>
            </div>
            <textarea
              className="flex-1 w-full min-h-[200px] p-4 bg-pm-bg border-none rounded-none font-mono text-xs leading-relaxed text-pm-text resize-none outline-none focus:ring-0 focus:border-transparent"
              value={draft.body ?? ''}
              onChange={(e) => onChange({ ...draft, body: e.target.value || null })}
              placeholder='{"key": "value"}'
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'Auth' && (
          <div className="p-4 flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-pm-text-s">Type</span>
              <select
                className="pm-input max-w-[260px]"
                value={draft.authType ?? 'none'}
                onChange={(e) =>
                  onChange({ ...draft, authType: e.target.value === 'none' ? null : e.target.value })
                }
              >
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="apikey">API Key</option>
              </select>
            </div>
            {draft.authType && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-pm-text-s">
                  {draft.authType === 'bearer' ? 'Token' : draft.authType === 'basic' ? 'Credentials' : 'Configuration'}
                </span>
                <textarea
                  className="pm-input font-mono text-xs min-h-[120px]"
                  rows={6}
                  value={draft.authConfig ?? ''}
                  onChange={(e) => onChange({ ...draft, authConfig: e.target.value || null })}
                  placeholder={
                    draft.authType === 'bearer'
                      ? 'Paste your bearer token here...'
                      : draft.authType === 'basic'
                        ? '{"username": "", "password": ""}'
                        : '{"key": "", "value": "", "addTo": "header"}'
                  }
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ===== Key-Value Table Sub-component ===== */

interface KeyValueTableProps {
  rows: KeyValueRow[];
  field: string;
  onChange(field: string, rows: KeyValueRow[], index: number, next: Partial<KeyValueRow>): void;
  onAdd(): void;
  onRemove(index: number): void;
  onToggle(index: number, checked: boolean): void;
}

function KeyValueTable({ rows, field, onChange, onAdd, onRemove, onToggle }: KeyValueTableProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header row */}
      <div className="grid grid-cols-[32px_1fr_1fr_32px] items-center min-h-[36px] border-b border-pm-border-s bg-pm-bg-s text-[11px] font-semibold text-pm-text-t uppercase tracking-wide">
        <span />
        <span className="px-2.5 py-1.5">Key</span>
        <span className="px-2.5 py-1.5">Value</span>
        <span />
      </div>

      {/* Data rows */}
      {rows.map((row, index) => (
        <div
          className="group grid grid-cols-[32px_1fr_1fr_32px] items-center min-h-[36px] border-b border-pm-border-s"
          key={`${field}-${index}`}
        >
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => onToggle(index, e.target.checked)}
              className="w-3.5 h-3.5 accent-pm-orange cursor-pointer"
            />
          </div>
          <input
            className="border-none rounded-none px-2.5 py-1.5 text-xs bg-transparent outline-none placeholder:text-pm-text-t focus:bg-pm-bg-input focus:ring-1 focus:ring-inset focus:ring-pm-orange"
            value={row.key}
            onChange={(e) => onChange(field, rows, index, { key: e.target.value })}
            placeholder="Key"
          />
          <input
            className="border-none rounded-none px-2.5 py-1.5 text-xs bg-transparent outline-none placeholder:text-pm-text-t focus:bg-pm-bg-input focus:ring-1 focus:ring-inset focus:ring-pm-orange"
            value={row.value}
            onChange={(e) => onChange(field, rows, index, { value: e.target.value })}
            placeholder="Value"
          />
          <button
            className="flex items-center justify-center text-pm-text-t opacity-0 group-hover:opacity-100 hover:text-st-error transition-opacity duration-150"
            type="button"
            onClick={() => onRemove(index)}
            title="Remove row"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}

      {/* Add row */}
      <div className="px-2 py-1">
        <button
          type="button"
          onClick={onAdd}
          className="text-xs text-pm-text-t px-2 py-1 rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
        >
          + Add row
        </button>
      </div>
    </div>
  );
}
