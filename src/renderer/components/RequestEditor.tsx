import { useEffect, useMemo, useState } from 'react';
import type { SaveRequestDraftInput } from '@shared/ipc';
import type {
  BinaryBodyConfig,
  FormDataRow,
  HttpMethod,
  KeyValueRow,
  PickedFile,
  RequestBodyType,
} from '@shared/models';
import { METHOD_SELECT_COLOR } from '../utils/method-colors';
import {
  copyTextToClipboard,
  formatJson,
  getCollapsibleJsonPaths,
  HighlightedJsonEditor,
  JsonTreeView,
  parseJsonValue,
} from './JsonCodeBlock';
import { parseCurl } from '../utils/curl-parser';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const REQUEST_TABS = ['Params', 'Headers', 'Body', 'Auth', 'cURL'] as const;
const BODY_TYPES: RequestBodyType[] = ['none', 'raw', 'form-data', 'x-www-form-urlencoded', 'binary'];

type RequestTab = (typeof REQUEST_TABS)[number];

interface RequestEditorProps {
  draft: SaveRequestDraftInput;
  loading: boolean;
  onChange(draft: SaveRequestDraftInput): void;
  onSave(): void;
  onSend(): void;
}

const EMPTY_KEY_VALUE_ROW: KeyValueRow = { key: '', value: '', enabled: true };
const EMPTY_FORM_DATA_ROW: FormDataRow = {
  key: '',
  value: '',
  enabled: true,
  kind: 'text',
  filePath: null,
  fileName: null,
  contentType: null,
};

function parseKeyValueRows(value: string | null | undefined, fallback: KeyValueRow[]): KeyValueRow[] {
  try {
    const parsed = JSON.parse(value ?? 'null') as Array<Partial<KeyValueRow>>;
    if (!Array.isArray(parsed)) {
      return fallback;
    }

    return parsed.map((row) => ({
      key: row.key ?? '',
      value: row.value ?? '',
      enabled: row.enabled ?? true,
    }));
  } catch {
    return fallback;
  }
}

function parseFormDataRows(value: string | null | undefined, fallback: FormDataRow[]): FormDataRow[] {
  try {
    const parsed = JSON.parse(value ?? 'null') as Array<Partial<FormDataRow>>;
    if (!Array.isArray(parsed)) {
      return fallback;
    }

    return parsed.map((row) => ({
      key: row.key ?? '',
      value: row.value ?? '',
      enabled: row.enabled ?? true,
      kind: row.kind === 'file' ? 'file' : 'text',
      filePath: row.filePath ?? null,
      fileName: row.fileName ?? null,
      contentType: row.contentType ?? null,
    }));
  } catch {
    return fallback;
  }
}

function parseBinaryConfig(value: string | null | undefined): BinaryBodyConfig {
  try {
    const parsed = JSON.parse(value ?? 'null') as Partial<BinaryBodyConfig> | null;
    return {
      filePath: parsed?.filePath ?? null,
      fileName: parsed?.fileName ?? null,
      contentType: parsed?.contentType ?? null,
    };
  } catch {
    return {
      filePath: null,
      fileName: null,
      contentType: null,
    };
  }
}

function serializeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function updateRow<T>(rows: T[], index: number, next: Partial<T>) {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row));
}

function getActiveCount(rows: KeyValueRow[]) {
  return rows.filter((row) => row.enabled && (row.key || row.value)).length;
}

function getActiveFormDataCount(rows: FormDataRow[]) {
  return rows.filter((row) => row.enabled && row.key && (row.kind === 'file' ? row.filePath : row.value)).length;
}

function isValidRowsJson(value: string | null | undefined) {
  try {
    return Array.isArray(JSON.parse(value ?? 'null'));
  } catch {
    return false;
  }
}

function isValidBinaryJson(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? 'null');
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function formatFileLabel(file: PickedFile | BinaryBodyConfig | FormDataRow) {
  return file.fileName || file.path || file.filePath || 'Choose file';
}

function extractNameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1].replace(/[_-]/g, ' ');
    }

    return parsedUrl.hostname;
  } catch {
    return 'Imported Request';
  }
}

export function RequestEditor({ draft, loading, onChange, onSave, onSend }: RequestEditorProps) {
  const [activeTab, setActiveTab] = useState<RequestTab>('Params');
  const [rawJsonViewMode, setRawJsonViewMode] = useState<'editor' | 'preview'>('editor');
  const [rawCollapsedPaths, setRawCollapsedPaths] = useState<Set<string>>(new Set());
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [curlCopyLabel, setCurlCopyLabel] = useState('Copy cURL');
  const bodyType = draft.bodyType ?? (draft.body ? 'raw' : 'none');

  const queryRows = useMemo(
    () => parseKeyValueRows(draft.queryParams, [EMPTY_KEY_VALUE_ROW]),
    [draft.queryParams],
  );
  const headerRows = useMemo(
    () => parseKeyValueRows(draft.headers, [EMPTY_KEY_VALUE_ROW]),
    [draft.headers],
  );
  const formDataRows = useMemo(
    () => parseFormDataRows(draft.bodyMeta, [EMPTY_FORM_DATA_ROW]),
    [draft.bodyMeta],
  );
  const urlEncodedRows = useMemo(
    () => parseKeyValueRows(draft.bodyMeta, [EMPTY_KEY_VALUE_ROW]),
    [draft.bodyMeta],
  );
  const binaryConfig = useMemo(
    () => parseBinaryConfig(draft.bodyMeta),
    [draft.bodyMeta],
  );
  const formattedRawBody = useMemo(
    () => formatJson(draft.body ?? ''),
    [draft.body],
  );
  const parsedRawBody = useMemo(
    () => parseJsonValue(draft.body ?? ''),
    [draft.body],
  );

  const paramCount = getActiveCount(queryRows);
  const headerCount = getActiveCount(headerRows);
  const formDataCount = getActiveFormDataCount(formDataRows);
  const urlEncodedCount = getActiveCount(urlEncodedRows);
  const generatedCurl = useMemo(
    () =>
      buildCurlCommand({
        draft,
        bodyType,
        queryRows,
        headerRows,
        formDataRows,
        urlEncodedRows,
        binaryConfig,
      }),
    [binaryConfig, bodyType, draft, formDataRows, headerRows, queryRows, urlEncodedRows],
  );

  useEffect(() => {
    if (!formattedRawBody && rawJsonViewMode === 'preview') {
      setRawJsonViewMode('editor');
    }
    setRawCollapsedPaths(new Set());
    setCopyLabel('Copy');
  }, [draft.body, formattedRawBody]);

  useEffect(() => {
    setCurlCopyLabel('Copy cURL');
  }, [generatedCurl]);

  function updateDraft(next: Partial<SaveRequestDraftInput>) {
    onChange({ ...draft, ...next });
  }

  function addRow(field: 'queryParams' | 'headers', rows: KeyValueRow[]) {
    updateDraft({ [field]: serializeJson([...rows, EMPTY_KEY_VALUE_ROW]) });
  }

  function removeRow(field: 'queryParams' | 'headers', rows: KeyValueRow[], index: number) {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    updateDraft({ [field]: serializeJson(next.length ? next : [EMPTY_KEY_VALUE_ROW]) });
  }

  function addBodyRow(rows: KeyValueRow[]) {
    updateDraft({ bodyMeta: serializeJson([...rows, EMPTY_KEY_VALUE_ROW]) });
  }

  function removeBodyRow(rows: KeyValueRow[], index: number) {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    updateDraft({ bodyMeta: serializeJson(next.length ? next : [EMPTY_KEY_VALUE_ROW]) });
  }

  function addFormDataRow() {
    updateDraft({ bodyMeta: serializeJson([...formDataRows, EMPTY_FORM_DATA_ROW]) });
  }

  function removeFormDataRow(index: number) {
    const next = formDataRows.filter((_, rowIndex) => rowIndex !== index);
    updateDraft({ bodyMeta: serializeJson(next.length ? next : [EMPTY_FORM_DATA_ROW]) });
  }

  function setBodyType(nextType: RequestBodyType) {
    if (nextType === bodyType) {
      return;
    }

    let nextBodyMeta = draft.bodyMeta ?? null;

    if (nextType === 'form-data' && !isValidRowsJson(nextBodyMeta)) {
      nextBodyMeta = serializeJson([EMPTY_FORM_DATA_ROW]);
    } else if (nextType === 'x-www-form-urlencoded' && !isValidRowsJson(nextBodyMeta)) {
      nextBodyMeta = serializeJson([EMPTY_KEY_VALUE_ROW]);
    } else if (nextType === 'binary' && !isValidBinaryJson(nextBodyMeta)) {
      nextBodyMeta = null;
    }

    updateDraft({ bodyType: nextType, bodyMeta: nextBodyMeta });
  }

  async function pickSingleFile() {
    const files = await window.appApi.pickFiles({ multiple: false });
    return files[0] ?? null;
  }

  async function handlePickFormDataFile(index: number) {
    const file = await pickSingleFile();
    if (!file) {
      return;
    }

    const nextRows = updateRow(formDataRows, index, {
      kind: 'file',
      value: '',
      filePath: file.path,
      fileName: file.name,
      contentType: file.mimeType,
    });
    updateDraft({ bodyMeta: serializeJson(nextRows) });
  }

  async function handlePickBinaryFile() {
    const file = await pickSingleFile();
    if (!file) {
      return;
    }

    updateDraft({
      bodyType: 'binary',
      bodyMeta: serializeJson({
        filePath: file.path,
        fileName: file.name,
        contentType: file.mimeType,
      } satisfies BinaryBodyConfig),
    });
  }

  async function handleCopyRawBody() {
    const copied = await copyTextToClipboard(formattedRawBody ?? draft.body ?? '');
    setCopyLabel(copied ? 'Copied' : 'Copy failed');
    window.setTimeout(() => setCopyLabel('Copy'), 1200);
  }

  async function handleCopyCurl() {
    const copied = await copyTextToClipboard(generatedCurl);
    setCurlCopyLabel(copied ? 'Copied' : 'Copy failed');
    window.setTimeout(() => setCurlCopyLabel('Copy cURL'), 1200);
  }

  function handleCollapseAllRawJson() {
    if (parsedRawBody === undefined) {
      return;
    }

    setRawCollapsedPaths(new Set(getCollapsibleJsonPaths(parsedRawBody)));
  }

  function handleExpandAllRawJson() {
    setRawCollapsedPaths(new Set());
  }

  function toggleRawPath(path: string) {
    setRawCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function handleUrlPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pastedText = event.clipboardData.getData('text').trim();
    if (!/^curl\s+/i.test(pastedText)) {
      return;
    }

    const parsed = parseCurl(pastedText);
    if (!parsed.url) {
      return;
    }

    event.preventDefault();
    updateDraft({
      name: !draft.name || draft.name === 'Untitled Request'
        ? extractNameFromUrl(parsed.url)
        : draft.name,
      method: parsed.method,
      url: parsed.url,
      queryParams: '[]',
      headers: JSON.stringify(parsed.headers, null, 2),
      bodyType: parsed.bodyType,
      body: parsed.body,
      bodyMeta: parsed.bodyMeta,
      authType: parsed.authType,
      authConfig: parsed.authConfig,
    });
  }

  return (
    <>
      <div className="shrink-0 flex items-center gap-0 px-4 py-2.5 border-b border-pm-border-s bg-pm-bg">
        <select
          className={`pm-input w-auto min-w-[100px] py-[7px] px-2.5 font-bold text-[13px] bg-pm-bg-t border-pm-border rounded-l rounded-r-none border-r-0 cursor-pointer ${
            METHOD_SELECT_COLOR[draft.method] ?? ''
          }`}
          value={draft.method}
          onChange={(e) => updateDraft({ method: e.target.value as HttpMethod })}
        >
          {METHODS.map((method) => (
            <option key={method} value={method}>{method}</option>
          ))}
        </select>
        <input
          className="pm-input flex-1 py-[7px] px-3 text-[15px] bg-pm-bg-input border-pm-border rounded-none border-l-0 border-r-0"
          value={draft.url}
          onChange={(e) => updateDraft({ url: e.target.value })}
          onPaste={handleUrlPaste}
          placeholder="Enter request URL"
        />
        <button
          className={`py-[7px] px-5 text-white font-bold text-[13px] rounded-r rounded-l-none border whitespace-nowrap transition-colors duration-150 ${
            loading
              ? 'bg-pm-bg-t border-pm-border-strong text-pm-text hover:bg-pm-hover'
              : 'bg-pm-orange border-pm-orange hover:bg-pm-orange-h'
          }`}
          type="button"
          onClick={onSend}
          aria-busy={loading}
        >
          {loading ? 'Cancel' : 'Send'}
        </button>
        <button
          className="ml-2 py-[7px] px-3.5 bg-transparent text-pm-text-s font-semibold text-xs border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
          type="button"
          onClick={onSave}
        >
          Save
        </button>
      </div>

      <div className="shrink-0 flex items-center gap-0 px-4 border-b border-pm-border-s bg-pm-bg">
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

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'Params' && (
          <KeyValueTable
            rows={queryRows}
            field="queryParams"
            onChange={(field, rows, index, next) =>
              updateDraft({ [field]: serializeJson(updateRow(rows, index, next)) })
            }
            onAdd={() => addRow('queryParams', queryRows)}
            onRemove={(index) => removeRow('queryParams', queryRows, index)}
            onToggle={(index, checked) =>
              updateDraft({ queryParams: serializeJson(updateRow(queryRows, index, { enabled: checked })) })
            }
          />
        )}

        {activeTab === 'Headers' && (
          <KeyValueTable
            rows={headerRows}
            field="headers"
            onChange={(field, rows, index, next) =>
              updateDraft({ [field]: serializeJson(updateRow(rows, index, next)) })
            }
            onAdd={() => addRow('headers', headerRows)}
            onRemove={(index) => removeRow('headers', headerRows, index)}
            onToggle={(index, checked) =>
              updateDraft({ headers: serializeJson(updateRow(headerRows, index, { enabled: checked })) })
            }
          />
        )}

        {activeTab === 'Body' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-pm-border-s text-xs text-pm-text-s overflow-x-auto">
              {BODY_TYPES.map((type) => (
                <label
                  key={type}
                  className={`flex items-center gap-1 py-0.5 text-xs whitespace-nowrap ${
                    bodyType === type ? 'text-pm-text' : 'text-pm-text-t'
                  }`}
                >
                  <input
                    type="radio"
                    name="bodyType"
                    checked={bodyType === type}
                    onChange={() => setBodyType(type)}
                    className="w-auto accent-pm-orange"
                  />
                  {type}
                  {type === 'form-data' && formDataCount > 0 ? ` (${formDataCount})` : ''}
                  {type === 'x-www-form-urlencoded' && urlEncodedCount > 0 ? ` (${urlEncodedCount})` : ''}
                </label>
              ))}
              {bodyType === 'raw' && (
                <>
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
                      if (!draft.body) {
                        return;
                      }

                      try {
                        updateDraft({ body: JSON.stringify(JSON.parse(draft.body), null, 2) });
                      } catch {
                        // Leave non-JSON bodies unchanged.
                      }
                    }}
                    title="Format JSON body"
                  >
                    Prettify
                  </button>
                  {formattedRawBody && parsedRawBody !== undefined && (
                    <>
                      <button
                        type="button"
                        onClick={() => setRawJsonViewMode('editor')}
                        className={`px-2.5 py-0.5 text-[11px] font-medium border rounded transition-all duration-150 ${
                          rawJsonViewMode === 'editor'
                            ? 'border-pm-orange text-pm-text bg-pm-active'
                            : 'border-pm-border text-pm-text-t hover:bg-pm-hover hover:text-pm-text'
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setRawJsonViewMode('preview')}
                        className={`px-2.5 py-0.5 text-[11px] font-medium border rounded transition-all duration-150 ${
                          rawJsonViewMode === 'preview'
                            ? 'border-pm-orange text-pm-text bg-pm-active'
                            : 'border-pm-border text-pm-text-t hover:bg-pm-hover hover:text-pm-text'
                        }`}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyRawBody()}
                        className="px-2.5 py-0.5 text-[11px] font-medium text-pm-text-t border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                      >
                        {copyLabel}
                      </button>
                      {rawJsonViewMode === 'preview' && (
                        <>
                          <button
                            type="button"
                            onClick={handleExpandAllRawJson}
                            className="px-2.5 py-0.5 text-[11px] font-medium text-pm-text-t border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                          >
                            Expand all
                          </button>
                          <button
                            type="button"
                            onClick={handleCollapseAllRawJson}
                            className="px-2.5 py-0.5 text-[11px] font-medium text-pm-text-t border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                          >
                            Collapse all
                          </button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {bodyType === 'none' && (
              <div className="flex-1 grid place-items-center text-sm text-pm-text-t">
                No request body will be sent.
              </div>
            )}

            {bodyType === 'raw' && (
              formattedRawBody && parsedRawBody !== undefined ? (
                rawJsonViewMode === 'preview' ? (
                  <div className="flex-1 overflow-auto">
                    <JsonTreeView value={parsedRawBody} collapsedPaths={rawCollapsedPaths} onToggle={toggleRawPath} />
                  </div>
                ) : (
                <HighlightedJsonEditor
                  value={draft.body ?? ''}
                  onChange={(value) => updateDraft({ body: value || null })}
                  placeholder='{"key": "value"}'
                />
                )
              ) : (
                <textarea
                  className="flex-1 w-full min-h-[200px] p-4 bg-pm-bg border-none rounded-none font-mono text-xs leading-relaxed text-pm-text resize-none outline-none focus:ring-0 focus:border-transparent"
                  value={draft.body ?? ''}
                  onChange={(e) => updateDraft({ body: e.target.value || null })}
                  placeholder='{"key": "value"}'
                  spellCheck={false}
                />
              )
            )}

            {bodyType === 'form-data' && (
              <FormDataTable
                rows={formDataRows}
                onChange={(rows) => updateDraft({ bodyMeta: serializeJson(rows) })}
                onAdd={addFormDataRow}
                onRemove={removeFormDataRow}
                onPickFile={handlePickFormDataFile}
              />
            )}

            {bodyType === 'x-www-form-urlencoded' && (
              <KeyValueTable
                rows={urlEncodedRows}
                field="bodyMeta"
                onChange={(_field, rows, index, next) =>
                  updateDraft({ bodyMeta: serializeJson(updateRow(rows, index, next)) })
                }
                onAdd={() => addBodyRow(urlEncodedRows)}
                onRemove={(index) => removeBodyRow(urlEncodedRows, index)}
                onToggle={(index, checked) =>
                  updateDraft({ bodyMeta: serializeJson(updateRow(urlEncodedRows, index, { enabled: checked })) })
                }
              />
            )}

            {bodyType === 'binary' && (
              <div className="flex-1 p-4 flex flex-col gap-4">
                <div className="rounded-lg border border-pm-border-s bg-pm-bg-s p-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-pm-text-s">Selected file</span>
                  <span className="text-sm text-pm-text">
                    {binaryConfig.fileName ?? 'No file selected'}
                  </span>
                  {binaryConfig.filePath && (
                    <span className="text-xs text-pm-text-t break-all">{binaryConfig.filePath}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handlePickBinaryFile()}
                    className="px-3 py-1.5 rounded border border-pm-border text-xs font-medium text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                  >
                    {binaryConfig.filePath ? 'Replace file' : 'Choose file'}
                  </button>
                  {binaryConfig.filePath && (
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft({
                          bodyMeta: serializeJson({
                            filePath: null,
                            fileName: null,
                            contentType: null,
                          } satisfies BinaryBodyConfig),
                        })
                      }
                      className="px-3 py-1.5 rounded border border-pm-border text-xs font-medium text-pm-text-t hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
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
                  updateDraft({ authType: e.target.value === 'none' ? null : e.target.value })
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
                  onChange={(e) => updateDraft({ authConfig: e.target.value || null })}
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

        {activeTab === 'cURL' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-pm-border-s bg-pm-bg">
              <span className="text-xs text-pm-text-s">
                Generated cURL for this request
              </span>
              <button
                type="button"
                onClick={() => void handleCopyCurl()}
                className="px-2.5 py-0.5 text-[11px] font-medium text-pm-text-t border border-pm-border rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
              >
                {curlCopyLabel}
              </button>
            </div>
            <textarea
              className="flex-1 w-full min-h-[200px] p-4 bg-pm-bg border-none rounded-none font-mono text-xs leading-relaxed text-pm-text resize-none outline-none focus:ring-0 focus:border-transparent"
              value={generatedCurl}
              readOnly
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </>
  );
}

function buildCurlCommand({
  draft,
  bodyType,
  queryRows,
  headerRows,
  formDataRows,
  urlEncodedRows,
  binaryConfig,
}: {
  draft: SaveRequestDraftInput;
  bodyType: RequestBodyType;
  queryRows: KeyValueRow[];
  headerRows: KeyValueRow[];
  formDataRows: FormDataRow[];
  urlEncodedRows: KeyValueRow[];
  binaryConfig: BinaryBodyConfig;
}) {
  const segments: string[] = ['curl', `-X ${draft.method}`];
  const headers = new Map<string, { key: string; value: string }>();

  for (const row of headerRows) {
    if (!row.enabled || !row.key) {
      continue;
    }

    headers.set(row.key.toLowerCase(), { key: row.key, value: row.value });
  }

  if (draft.authType === 'bearer' && draft.authConfig) {
    headers.set('authorization', {
      key: 'Authorization',
      value: `Bearer ${draft.authConfig}`,
    });
  } else if (draft.authType === 'apikey' && draft.authConfig) {
    try {
      const config = JSON.parse(draft.authConfig) as { key?: string; value?: string };
      if (config.key && config.value) {
        headers.set(config.key.toLowerCase(), {
          key: config.key,
          value: config.value,
        });
      }
    } catch {
      // Ignore invalid auth config in export.
    }
  }

  const finalUrl = buildRequestUrl(draft.url, queryRows);
  segments.push(quoteCurlArg(finalUrl));

  if (draft.authType === 'basic' && draft.authConfig) {
    try {
      const creds = JSON.parse(draft.authConfig) as { username?: string; password?: string };
      segments.push(`-u ${quoteCurlArg(`${creds.username ?? ''}:${creds.password ?? ''}`)}`);
    } catch {
      // Ignore invalid auth config in export.
    }
  }

  if (bodyType === 'x-www-form-urlencoded' && !headers.has('content-type')) {
    headers.set('content-type', {
      key: 'Content-Type',
      value: 'application/x-www-form-urlencoded;charset=UTF-8',
    });
  }

  if (bodyType === 'binary' && binaryConfig.contentType && !headers.has('content-type')) {
    headers.set('content-type', {
      key: 'Content-Type',
      value: binaryConfig.contentType,
    });
  }

  for (const { key, value } of headers.values()) {
    segments.push(`-H ${quoteCurlArg(`${key}: ${value}`)}`);
  }

  switch (bodyType) {
    case 'raw':
      if (draft.body) {
        segments.push(`--data-raw ${quoteCurlArg(draft.body)}`);
      }
      break;
    case 'x-www-form-urlencoded': {
      const searchParams = new URLSearchParams();
      for (const row of urlEncodedRows) {
        if (row.enabled && row.key) {
          searchParams.append(row.key, row.value);
        }
      }
      const encodedBody = searchParams.toString();
      if (encodedBody) {
        segments.push(`--data-raw ${quoteCurlArg(encodedBody)}`);
      }
      break;
    }
    case 'form-data':
      for (const row of formDataRows) {
        if (!row.enabled || !row.key) {
          continue;
        }

        if (row.kind === 'file' && row.filePath) {
          const filePart = row.contentType
            ? `@${row.filePath};type=${row.contentType}`
            : `@${row.filePath}`;
          segments.push(`--form ${quoteCurlArg(`${row.key}=${filePart}`)}`);
          continue;
        }

        if (row.kind === 'text') {
          segments.push(`--form ${quoteCurlArg(`${row.key}=${row.value}`)}`);
        }
      }
      break;
    case 'binary':
      if (binaryConfig.filePath) {
        segments.push(`--data-binary ${quoteCurlArg(`@${binaryConfig.filePath}`)}`);
      }
      break;
    case 'none':
    default:
      break;
  }

  return segments.join(' \\\n  ');
}

function buildRequestUrl(url: string, queryRows: KeyValueRow[]) {
  const enabledParams = queryRows.filter((row) => row.enabled && row.key);
  if (enabledParams.length === 0) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    for (const row of enabledParams) {
      parsedUrl.searchParams.set(row.key, row.value);
    }
    return parsedUrl.toString();
  } catch {
    const searchParams = new URLSearchParams();
    for (const row of enabledParams) {
      searchParams.append(row.key, row.value);
    }
    const queryString = searchParams.toString();
    if (!queryString) {
      return url;
    }
    return `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
  }
}

function quoteCurlArg(value: string) {
  return JSON.stringify(value);
}

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
      <div className="grid grid-cols-[32px_1fr_1fr_32px] items-center min-h-[36px] border-b border-pm-border-s bg-pm-bg-s text-[11px] font-semibold text-pm-text-t uppercase tracking-wide">
        <span />
        <span className="px-2.5 py-1.5">Key</span>
        <span className="px-2.5 py-1.5">Value</span>
        <span />
      </div>

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

interface FormDataTableProps {
  rows: FormDataRow[];
  onChange(rows: FormDataRow[]): void;
  onAdd(): void;
  onRemove(index: number): void;
  onPickFile(index: number): Promise<void>;
}

function FormDataTable({ rows, onChange, onAdd, onRemove, onPickFile }: FormDataTableProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-[32px_1fr_110px_1.6fr_32px] items-center min-h-[36px] border-b border-pm-border-s bg-pm-bg-s text-[11px] font-semibold text-pm-text-t uppercase tracking-wide">
        <span />
        <span className="px-2.5 py-1.5">Key</span>
        <span className="px-2.5 py-1.5">Type</span>
        <span className="px-2.5 py-1.5">Value</span>
        <span />
      </div>

      {rows.map((row, index) => (
        <div
          className="group grid grid-cols-[32px_1fr_110px_1.6fr_32px] items-center min-h-[44px] border-b border-pm-border-s"
          key={`form-data-${index}`}
        >
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => onChange(updateRow(rows, index, { enabled: e.target.checked }))}
              className="w-3.5 h-3.5 accent-pm-orange cursor-pointer"
            />
          </div>
          <input
            className="border-none rounded-none px-2.5 py-1.5 text-xs bg-transparent outline-none placeholder:text-pm-text-t focus:bg-pm-bg-input focus:ring-1 focus:ring-inset focus:ring-pm-orange"
            value={row.key}
            onChange={(e) => onChange(updateRow(rows, index, { key: e.target.value }))}
            placeholder="Key"
          />
          <select
            className="mx-2 pm-input w-auto text-xs bg-pm-bg-t border-pm-border rounded"
            value={row.kind}
            onChange={(e) =>
              onChange(updateRow(rows, index, {
                kind: e.target.value as FormDataRow['kind'],
                value: '',
                filePath: null,
                fileName: null,
                contentType: null,
              }))
            }
          >
            <option value="text">Text</option>
            <option value="file">File</option>
          </select>
          {row.kind === 'text' ? (
            <input
              className="border-none rounded-none px-2.5 py-1.5 text-xs bg-transparent outline-none placeholder:text-pm-text-t focus:bg-pm-bg-input focus:ring-1 focus:ring-inset focus:ring-pm-orange"
              value={row.value}
              onChange={(e) => onChange(updateRow(rows, index, { value: e.target.value }))}
              placeholder="Value"
            />
          ) : (
            <div className="px-2.5 py-1.5 flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => void onPickFile(index)}
                className="px-2.5 py-1 rounded border border-pm-border text-xs text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150 shrink-0"
              >
                {row.filePath ? 'Replace' : 'Choose file'}
              </button>
              <span className="text-xs text-pm-text truncate" title={row.filePath ?? undefined}>
                {row.fileName ?? 'No file selected'}
              </span>
              {row.filePath && (
                <button
                  type="button"
                  onClick={() =>
                    onChange(updateRow(rows, index, {
                      filePath: null,
                      fileName: null,
                      contentType: null,
                    }))
                  }
                  className="text-[11px] text-pm-text-t hover:text-pm-text shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          )}
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

      <div className="px-2 py-1">
        <button
          type="button"
          onClick={onAdd}
          className="text-xs text-pm-text-t px-2 py-1 rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
        >
          + Add form field
        </button>
      </div>
    </div>
  );
}
