import { useCallback, useEffect, useRef, useState } from "react";
import type { AppBootstrap, SaveRequestDraftInput } from "@shared/ipc";
import type {
  CollectionRecord,
  ExecutionResult,
  HistoryEntryRecord,
  HttpMethod,
  RequestBodyType,
  RequestRecord,
  VariableRecord,
} from "@shared/models";
import { EnvironmentsPanel } from "./components/EnvironmentsPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ImportCurlModal } from "./components/ImportCurlModal";
import { RequestEditor } from "./components/RequestEditor";
import { ResponsePanel } from "./components/ResponsePanel";
import { Sidebar } from "./components/Sidebar";
import reqKitLogo from "./assets/reqkit-logo.svg";
import { parseCurl } from "./utils/curl-parser";
import { METHOD_COLOR } from "./utils/method-colors";

type RailTab = "collections" | "environments" | "history";

interface RequestTab {
  tabId: string;
  draft: SaveRequestDraftInput;
  savedRequestId: string | null;
  isDirty: boolean;
  response: ExecutionResult | null;
  loading: boolean;
  currentExecutionId: string | null;
  error: string | null;
  consoleLogs: string[];
}

let nextTabId = 1;
function generateTabId(): string {
  return `tab-${nextTabId++}-${Date.now()}`;
}

const EMPTY_METHOD: HttpMethod = "GET";

function createDraft(
  workspaceId: string,
  name?: string,
  collectionId: string | null = null,
): SaveRequestDraftInput {
  return {
    workspaceId,
    collectionId,
    name: name ?? "Untitled Request",
    method: EMPTY_METHOD,
    url: "",
    queryParams: "[]",
    headers: "[]",
    bodyType: "none",
    body: null,
    bodyMeta: null,
    authType: null,
    authConfig: null,
  };
}

function createTab(
  draft: SaveRequestDraftInput,
  savedRequestId: string | null = null,
): RequestTab {
  return {
    tabId: savedRequestId ?? generateTabId(),
    draft,
    savedRequestId,
    isDirty: !savedRequestId,
    response: null,
    loading: false,
    currentExecutionId: null,
    error: null,
    consoleLogs: [],
  };
}

export function App() {
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [tabs, setTabs] = useState<RequestTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(null);
  const [activeEnvironmentVariables, setActiveEnvironmentVariables] = useState<VariableRecord[]>([]);
  const [status, setStatus] = useState<string>("Loading workspace...");
  const [activeRail, setActiveRail] = useState<RailTab>("collections");
  const [showCurlModal, setShowCurlModal] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [importTargetCollectionId, setImportTargetCollectionId] = useState<string | null>(null);

  const activeTab = tabs.find((tab) => tab.tabId === activeTabId) ?? null;
  const draft = activeTab?.draft ?? null;

  useEffect(() => {
    void window.appApi.getBootstrap().then((data) => {
      setBootstrap(data);
      setActiveEnvironmentId(data.activeEnvironmentId);
      const initial = data.requests[0];
      const tab = initial
        ? createTab(requestToDraft(initial), initial.id)
        : createTab(createDraft(data.workspace.id));
      setTabs([tab]);
      setActiveTabId(tab.tabId);
      setSelectedCollectionId(
        initial?.collectionId ?? data.collections.find((item) => item.kind === "collection")?.id ?? null,
      );
      setStatus("Ready");
    });
  }, []);

  useEffect(() => {
    if (!bootstrap) {
      return;
    }

    const nextActiveEnvironmentId = bootstrap.environments.some(
      (environment) => environment.id === bootstrap.activeEnvironmentId,
    )
      ? bootstrap.activeEnvironmentId
      : null;

    setActiveEnvironmentId(nextActiveEnvironmentId);
  }, [bootstrap]);

  useEffect(() => {
    let cancelled = false;

    if (!activeEnvironmentId) {
      setActiveEnvironmentVariables([]);
      return () => {
        cancelled = true;
      };
    }

    void window.appApi.listVariables(activeEnvironmentId)
      .then((variables) => {
        if (!cancelled) {
          setActiveEnvironmentVariables(variables);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveEnvironmentVariables([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEnvironmentId]);

  async function refreshBootstrap() {
    const data = await window.appApi.getBootstrap();
    setBootstrap(data);
    return data;
  }

  function updateActiveTab(updater: (tab: RequestTab) => RequestTab) {
    setTabs((prev) =>
      prev.map((tab) => (tab.tabId === activeTabId ? updater(tab) : tab)),
    );
  }

  function updateTabById(
    tabId: string,
    updater: (tab: RequestTab) => RequestTab,
  ) {
    setTabs((prev) =>
      prev.map((tab) => (tab.tabId === tabId ? updater(tab) : tab)),
    );
  }

  function handleDraftChange(newDraft: SaveRequestDraftInput) {
    updateActiveTab((tab) => ({ ...tab, draft: newDraft, isDirty: true }));
  }

  function addTab(tab: RequestTab) {
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.tabId);
  }

  function removeTabsForRequests(requestIds: string[]) {
    if (!bootstrap || requestIds.length === 0) {
      return;
    }

    const deletedRequestIds = new Set(requestIds);
    setTabs((prev) => {
      const next = prev.filter(
        (tab) => !(tab.savedRequestId && deletedRequestIds.has(tab.savedRequestId)),
      );

      if (next.length === 0) {
        const empty = createTab(createDraft(bootstrap.workspace.id));
        setActiveTabId(empty.tabId);
        return [empty];
      }

      if (!next.some((tab) => tab.tabId === activeTabId)) {
        setActiveTabId(next[0].tabId);
      }

      return next;
    });
  }

  function closeTab(tabId: string) {
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.tabId !== tabId);
      if (next.length === 0 && bootstrap) {
        const empty = createTab(createDraft(bootstrap.workspace.id));
        setActiveTabId(empty.tabId);
        return [empty];
      }

      if (tabId === activeTabId) {
        const closedIndex = prev.findIndex((tab) => tab.tabId === tabId);
        const newActive = next[Math.min(closedIndex, next.length - 1)];
        setActiveTabId(newActive.tabId);
      }

      return next;
    });
  }

  async function handleSave() {
    if (!draft || !bootstrap || !activeTab) return;
    setStatus("Saving...");
    const saved = await window.appApi.saveRequestDraft(draft);
    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    setTabs((prev) =>
      prev.map((tab) =>
        tab.tabId === activeTabId
          ? {
              ...tab,
              tabId: saved.id,
              draft: requestToDraft(saved),
              savedRequestId: saved.id,
              isDirty: false,
            }
          : tab,
      ),
    );
    setActiveTabId(saved.id);
    setStatus("Saved");
  }

  async function handleSend() {
    if (!draft || !activeTab) return;

    if (activeTab.loading) {
      if (!activeTab.currentExecutionId) return;
      setStatus("Cancelling...");
      await window.appApi.cancelRequestExecution(activeTab.currentExecutionId);
      return;
    }

    if (!draft.url.trim()) {
      setStatus("Enter a URL first");
      return;
    }

    const originTabId = activeTab.tabId;
    const executionId = crypto.randomUUID();
    const time = new Date().toLocaleTimeString();

    updateTabById(originTabId, (tab) => ({
      ...tab,
      loading: true,
      currentExecutionId: executionId,
      response: null,
      error: null,
      consoleLogs: [
        ...tab.consoleLogs,
        `[${time}] ${draft.method} ${draft.url}`,
        `[${time}] Sending request...`,
      ],
    }));
    setStatus("Sending...");

    try {
      const result = await window.appApi.executeRequest({
        executionId,
        workspaceId: draft.workspaceId,
        requestId: activeTab.savedRequestId ?? undefined,
        name: draft.name,
        method: draft.method,
        url: draft.url,
        queryParams: draft.queryParams,
        headers: draft.headers,
        bodyType: draft.bodyType,
        body: draft.body,
        activeEnvironmentId,
        bodyMeta: draft.bodyMeta,
        authType: draft.authType,
        authConfig: draft.authConfig,
      });

      const doneTime = new Date().toLocaleTimeString();
      updateTabById(originTabId, (tab) =>
        tab.currentExecutionId !== executionId
          ? tab
          : {
              ...tab,
              loading: false,
              currentExecutionId: null,
              response: result,
              consoleLogs: [
                ...tab.consoleLogs,
                `[${doneTime}] ${result.statusCode} ${result.statusText} - ${result.durationMs}ms`,
              ],
            },
      );

      void refreshBootstrap();
      setStatus(
        `${result.statusCode} ${result.statusText} - ${result.durationMs}ms`,
      );
    } catch (err) {
      const errTime = new Date().toLocaleTimeString();
      const message = err instanceof Error ? err.message : String(err);
      const wasCancelled = message === "Request cancelled";
      const wasTimedOut = message.startsWith("Request timed out after ");

      updateTabById(originTabId, (tab) =>
        tab.currentExecutionId !== executionId
          ? tab
          : {
              ...tab,
              loading: false,
              currentExecutionId: null,
              response: null,
              error: message,
              consoleLogs: [
                ...tab.consoleLogs,
                wasCancelled
                  ? `[${errTime}] CANCELLED`
                  : wasTimedOut
                    ? `[${errTime}] TIMEOUT: ${message}`
                    : `[${errTime}] ERROR: ${message}`,
              ],
            },
      );
      setStatus(
        wasCancelled
          ? "Request cancelled"
          : wasTimedOut
            ? message
            : "Request failed",
      );
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!event.repeat) {
          void handleSave();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) {
          void handleSend();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleSend]);

  async function handleNewRequest(name?: string, collectionId: string | null = selectedCollectionId) {
    if (!bootstrap) return;
    const newDraft = createDraft(bootstrap.workspace.id, name, collectionId);
    const saved = await window.appApi.saveRequestDraft(newDraft);
    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    const tab = createTab(requestToDraft(saved), saved.id);
    addTab(tab);
    setSelectedCollectionId(saved.collectionId);
    setStatus("New request");
  }

  async function handleNewCollection(name: string) {
    if (!bootstrap) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    setStatus("Creating collection...");
    const created = await window.appApi.createCollection({
      workspaceId: bootstrap.workspace.id,
      name: trimmedName,
      kind: "collection",
    });
    const collections = await window.appApi.listCollections();
    setBootstrap({ ...bootstrap, collections });
    setSelectedCollectionId(created.id);
    setStatus(`Collection created: ${created.name}`);
  }

  async function handleExportCollection(collectionId: string) {
    if (!bootstrap) return;

    const collection = bootstrap.collections.find((item) => item.id === collectionId);
    if (!collection) {
      return;
    }

    setStatus("Exporting collection...");

    try {
      const result = await window.appApi.exportCollection({ collectionId });
      if (!result) {
        setStatus("Export cancelled");
        return;
      }

      setStatus(
        `Exported ${result.collectionName} (${result.folderCount} folders, ${result.requestCount} requests)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Export failed: ${message}`);
    }
  }

  async function handleImportCollection() {
    setStatus("Importing collection...");

    try {
      const result = await window.appApi.importCollection();
      if (!result) {
        setStatus("Import cancelled");
        return;
      }

      await refreshBootstrap();
      setActiveRail("collections");
      setSelectedCollectionId(result.collectionId);
      setStatus(
        result.missingFileCount > 0
          ? `Imported ${result.collectionName} (${result.folderCount} folders, ${result.requestCount} requests, ${result.missingFileCount} missing file refs)`
          : `Imported ${result.collectionName} (${result.folderCount} folders, ${result.requestCount} requests)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Import failed: ${message}`);
    }
  }

  async function handleImportCurl(curlText: string) {
    if (!bootstrap) return;
    const parsed = parseCurl(curlText);
    const targetCollectionId = importTargetCollectionId ?? selectedCollectionId;
    const importedDraft: SaveRequestDraftInput = {
      workspaceId: bootstrap.workspace.id,
      collectionId: targetCollectionId,
      name: extractNameFromUrl(parsed.url),
      method: parsed.method,
      url: parsed.url,
      queryParams: "[]",
      headers: JSON.stringify(parsed.headers, null, 2),
      bodyType: parsed.bodyType,
      body: parsed.body,
      bodyMeta: parsed.bodyMeta,
      authType: parsed.authType,
      authConfig: parsed.authConfig,
    };
    const saved = await window.appApi.saveRequestDraft(importedDraft);
    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    const tab = createTab(requestToDraft(saved), saved.id);
    addTab(tab);
    setSelectedCollectionId(saved.collectionId);
    setImportTargetCollectionId(null);
    setShowCurlModal(false);
    setStatus("Imported from cURL");
  }

  async function handleRenameRequest(requestId: string, nextName: string) {
    if (!bootstrap) return;

    const request = bootstrap.requests.find((item) => item.id === requestId);
    const openTab = tabs.find((tab) => tab.savedRequestId === requestId);
    const trimmedName = nextName.trim();
    if (!request || !trimmedName || trimmedName === request.name) {
      return;
    }

    setStatus("Renaming request...");

    const sourceDraft = openTab?.draft ?? requestToDraft(request);

    const saved = await window.appApi.saveRequestDraft({
      id: request.id,
      workspaceId: sourceDraft.workspaceId,
      collectionId: sourceDraft.collectionId,
      folderId: sourceDraft.folderId,
      name: trimmedName,
      method: sourceDraft.method,
      url: sourceDraft.url,
      queryParams: sourceDraft.queryParams,
      headers: sourceDraft.headers,
      bodyType: sourceDraft.bodyType,
      body: sourceDraft.body,
      bodyMeta: sourceDraft.bodyMeta,
      authType: sourceDraft.authType,
      authConfig: sourceDraft.authConfig,
    });

    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    setTabs((prev) =>
      prev.map((tab) =>
        tab.savedRequestId === requestId
          ? {
              ...tab,
              tabId: saved.id,
              draft: requestToDraft(saved),
              savedRequestId: saved.id,
            }
          : tab,
      ),
    );
    setStatus(`Renamed to ${saved.name}`);
  }

  async function handleMoveRequest(requestId: string, targetCollectionId: string | null) {
    if (!bootstrap) return;

    const request = bootstrap.requests.find((item) => item.id === requestId);
    const openTab = tabs.find((tab) => tab.savedRequestId === requestId);
    if (!request || request.collectionId === targetCollectionId) {
      return;
    }

    const sourceDraft = openTab?.draft ?? requestToDraft(request);
    const saved = await window.appApi.saveRequestDraft({
      id: request.id,
      workspaceId: sourceDraft.workspaceId,
      collectionId: targetCollectionId,
      folderId: null,
      name: sourceDraft.name,
      method: sourceDraft.method,
      url: sourceDraft.url,
      queryParams: sourceDraft.queryParams,
      headers: sourceDraft.headers,
      bodyType: sourceDraft.bodyType,
      body: sourceDraft.body,
      bodyMeta: sourceDraft.bodyMeta,
      authType: sourceDraft.authType,
      authConfig: sourceDraft.authConfig,
    });

    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    setTabs((prev) =>
      prev.map((tab) =>
        tab.savedRequestId === requestId
          ? {
              ...tab,
              draft: {
                ...tab.draft,
                collectionId: targetCollectionId,
                folderId: null,
              },
            }
          : tab,
      ),
    );
    setSelectedCollectionId(targetCollectionId);

    const targetLabel = targetCollectionId
      ? bootstrap.collections.find((collection) => collection.id === targetCollectionId)?.name ?? "Collection"
      : "Requests";
    setStatus(`Moved ${saved.name} to ${targetLabel}`);
  }

  async function handleRenameCollection(collectionId: string, nextName: string) {
    if (!bootstrap) return;

    const collection = bootstrap.collections.find((item) => item.id === collectionId);
    const trimmedName = nextName.trim();
    if (!collection || !trimmedName || trimmedName === collection.name) {
      return;
    }

    setStatus("Renaming collection...");
    const saved = await window.appApi.updateCollection({
      id: collectionId,
      name: trimmedName,
    });
    const collections = await window.appApi.listCollections();
    setBootstrap({ ...bootstrap, collections });
    setStatus(`Renamed collection to ${saved.name}`);
  }

  async function handleDeleteRequest(requestId: string) {
    if (!bootstrap) return;

    const request = bootstrap.requests.find((item) => item.id === requestId);
    if (!request) {
      return;
    }

    const confirmed = window.confirm(`Delete request "${request.name}"?`);
    if (!confirmed) {
      return;
    }

    setStatus("Deleting request...");
    await window.appApi.deleteRequest(requestId);
    removeTabsForRequests([requestId]);
    await refreshBootstrap();
    setStatus(`Deleted request: ${request.name}`);
  }

  async function handleDeleteCollection(collectionId: string) {
    if (!bootstrap) return;

    const collection = bootstrap.collections.find((item) => item.id === collectionId);
    if (!collection) {
      return;
    }

    const deletedRequestIds = bootstrap.requests
      .filter((request) => request.collectionId === collectionId)
      .map((request) => request.id);
    const confirmed = window.confirm(
      `Delete collection "${collection.name}" and its ${deletedRequestIds.length} request${deletedRequestIds.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) {
      return;
    }

    setStatus("Deleting collection...");
    const result = await window.appApi.deleteCollection(collectionId);
    removeTabsForRequests(deletedRequestIds);
    const refreshed = await refreshBootstrap();

    if (selectedCollectionId === collectionId) {
      setSelectedCollectionId(
        refreshed.collections.find((item) => item.kind === "collection")?.id ?? null,
      );
    }

    setStatus(
      `Deleted ${collection.name} (${result.deletedCollectionCount} items, ${result.deletedRequestCount} requests)`,
    );
  }

  function handleSelectRequest(request: RequestRecord) {
    setSelectedCollectionId(request.collectionId);
    const existing = tabs.find((tab) => tab.savedRequestId === request.id);
    if (existing) {
      setActiveTabId(existing.tabId);
      setStatus(`Editing: ${request.name}`);
      return;
    }

    const tab = createTab(requestToDraft(request), request.id);
    addTab(tab);
    setStatus(`Editing: ${request.name}`);
  }

  function handleSelectHistoryEntry(entry: HistoryEntryRecord) {
    if (!bootstrap) return;
    try {
      const snap = JSON.parse(entry.requestSnapshot) as RequestRecord;
        const tab = createTab({
          workspaceId: entry.workspaceId,
          collectionId: snap.collectionId ?? null,
          folderId: snap.folderId ?? null,
          name: snap.name ?? "From History",
          method: snap.method ?? "GET",
        url: snap.url ?? "",
        queryParams: snap.queryParams ?? "[]",
        headers: snap.headers ?? "[]",
        bodyType: normalizeBodyType(snap.bodyType ?? null, snap.body ?? null),
        body: snap.body ?? null,
        bodyMeta: snap.bodyMeta ?? null,
        authType: snap.authType ?? null,
        authConfig: snap.authConfig ?? null,
      });
      addTab(tab);
      setStatus("Loaded from history");
    } catch {
      setStatus("Failed to load history entry");
    }
  }

  async function handleClearHistory() {
    await window.appApi.clearHistory();
    await refreshBootstrap();
    setStatus("History cleared");
  }

  async function handleActiveEnvironmentChange(nextEnvironmentId: string | null) {
    const previousEnvironmentId = activeEnvironmentId;
    setActiveEnvironmentId(nextEnvironmentId);
    if (!nextEnvironmentId) {
      setActiveEnvironmentVariables([]);
    }

    try {
      await window.appApi.setActiveEnvironment(nextEnvironmentId);
      setBootstrap((prev) => (
        prev
          ? {
              ...prev,
              activeEnvironmentId: nextEnvironmentId,
            }
          : prev
      ));

      const environmentName = nextEnvironmentId
        ? bootstrap?.environments.find((environment) => environment.id === nextEnvironmentId)?.name ?? "Environment"
        : null;
      setStatus(environmentName ? `Environment: ${environmentName}` : "No environment selected");
    } catch (error) {
      setActiveEnvironmentId(previousEnvironmentId);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Failed to switch environment: ${message}`);
    }
  }

  if (!bootstrap || tabs.length === 0 || !draft) {
    return (
      <div className="h-screen grid place-items-center bg-pm-bg text-pm-text-s">
        <div className="text-center">
          <div className="text-3xl mb-3 text-pm-orange">&#9676;</div>
          <div>{status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen grid grid-rows-[48px_1fr] bg-pm-bg">
      <header className="flex items-center gap-3 px-3 bg-pm-bg-topbar border-b border-pm-border-s z-50 [-webkit-app-region:drag]">
        <div className="flex items-center gap-0.5 [-webkit-app-region:no-drag]">
          <div className="flex items-center  px-2.5 py-1.5 rounded-md font-bold text-sm text-pm-text tracking-tight">
            <img
              src={reqKitLogo}
              alt="ReqKit"
              className="w-8 h-8 shrink-0 rounded-sm"
            />
            ReqKit
          </div>
          <div className="w-px h-6 bg-pm-border mx-1.5" />
          <nav className="flex items-center gap-px">
            <button
              className="px-3 py-1.5 rounded text-xs font-medium text-pm-text bg-pm-active transition-all duration-150"
              type="button"
            >
              Home
            </button>
          </nav>
        </div>

        <div className="flex-1 flex justify-center [-webkit-app-region:no-drag]">
          <input
            className="pm-input max-w-[400px] bg-pm-bg rounded-lg text-xs text-pm-text-t pl-8 py-1.5"
            placeholder="&#128269;  Search APIs, collections..."
            readOnly
          />
        </div>

        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <button
            className="px-3 py-1 rounded text-xs font-semibold text-pm-text-s border border-pm-border hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            type="button"
          >
            Invite
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            type="button"
            title="Settings"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            type="button"
            title="Notifications"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-[42px_280px_1fr] min-h-0 overflow-hidden max-xl:grid-cols-[42px_240px_1fr] max-lg:grid-cols-[42px_1fr] max-sm:grid-cols-[1fr]">
        <aside className="bg-pm-bg-s border-r border-pm-border-s flex flex-col items-center py-2 gap-0.5 max-sm:hidden">
          <RailButton
            title="Collections"
            active={activeRail === "collections"}
            onClick={() => setActiveRail("collections")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </RailButton>
          <RailButton
            title="Environments"
            active={activeRail === "environments"}
            onClick={() => setActiveRail("environments")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </RailButton>
          <RailButton
            title="History"
            active={activeRail === "history"}
            onClick={() => setActiveRail("history")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </RailButton>
        </aside>

        {activeRail === "collections" && (
          <Sidebar
            workspaceName={bootstrap.workspace.name}
            collections={bootstrap.collections}
            requests={bootstrap.requests}
            activeRequestId={activeTab?.savedRequestId ?? null}
            selectedCollectionId={selectedCollectionId}
            historyCount={bootstrap.history.length}
            environmentCount={bootstrap.environments.length}
            onNewCollection={(name) => void handleNewCollection(name)}
            onImportCollection={() => void handleImportCollection()}
            onSelectCollection={(collection: CollectionRecord | null) => {
              setSelectedCollectionId(collection?.id ?? null);
              setStatus(collection ? `Selected collection: ${collection.name}` : "Showing requests outside collections");
            }}
            onNewRequest={(name, collectionId) => handleNewRequest(name, collectionId)}
            onMoveRequest={(requestId, collectionId) =>
              void handleMoveRequest(requestId, collectionId)
            }
            onRenameCollection={(collectionId, name) =>
              void handleRenameCollection(collectionId, name)
            }
            onDeleteCollection={(collectionId) =>
              void handleDeleteCollection(collectionId)
            }
            onExportCollection={(collectionId) =>
              void handleExportCollection(collectionId)
            }
            onImportCurl={(collectionId) => {
              setImportTargetCollectionId(collectionId ?? null);
              setShowCurlModal(true);
            }}
            onRenameRequest={(requestId, name) =>
              void handleRenameRequest(requestId, name)
            }
            onDeleteRequest={(requestId) =>
              void handleDeleteRequest(requestId)
            }
            onSelectRequest={handleSelectRequest}
          />
        )}
        {activeRail === "environments" && (
          <EnvironmentsPanel
            workspaceId={bootstrap.workspace.id}
            environments={bootstrap.environments}
            onEnvironmentCreated={(environment) => {
              setBootstrap((prev) => (
                prev
                  ? {
                      ...prev,
                      environments: [...prev.environments, environment],
                    }
                  : prev
              ));
            }}
            onEnvironmentUpdated={(environment) => {
              setBootstrap((prev) => (
                prev
                  ? {
                      ...prev,
                      environments: prev.environments.map((item) => (
                        item.id === environment.id ? environment : item
                      )),
                    }
                  : prev
              ));
            }}
            onEnvironmentDeleted={(environmentId) => {
              setActiveEnvironmentId((prev) => (prev === environmentId ? null : prev));
              setBootstrap((prev) => (
                prev
                  ? {
                      ...prev,
                      activeEnvironmentId: prev.activeEnvironmentId === environmentId ? null : prev.activeEnvironmentId,
                      environments: prev.environments.filter((item) => item.id !== environmentId),
                    }
                  : prev
              ));
            }}
            onVariablesChanged={(environmentId) => {
              if (environmentId !== activeEnvironmentId) {
                return;
              }

              void window.appApi.listVariables(environmentId)
                .then((variables) => setActiveEnvironmentVariables(variables))
                .catch(() => setActiveEnvironmentVariables([]));
            }}
          />
        )}
        {activeRail === "history" && (
          <HistoryPanel
            history={bootstrap.history}
            onSelectEntry={handleSelectHistoryEntry}
            onClearHistory={() => void handleClearHistory()}
          />
        )}

        <main className="flex flex-col min-w-0 min-h-0 bg-pm-bg overflow-hidden">
          <div className="flex items-stretch bg-pm-bg-s border-b border-pm-border-s min-h-[36px] overflow-x-auto [&::-webkit-scrollbar]:h-0">
            {tabs.map((tab) => {
              const isActive = tab.tabId === activeTabId;
              return (
                <button
                  key={tab.tabId}
                  className={`group flex items-center gap-1.5 px-3 text-xs border-r border-pm-border-s whitespace-nowrap transition-all duration-100 min-w-0 max-w-[200px] ${
                    isActive
                      ? "tab-active-line"
                      : "text-pm-text-s hover:bg-pm-hover hover:text-pm-text"
                  }`}
                  onClick={() => setActiveTabId(tab.tabId)}
                  type="button"
                >
                  <span
                    className={`text-[9px] font-bold shrink-0 ${METHOD_COLOR[tab.draft.method] ?? ""}`}
                  >
                    {tab.draft.method}
                  </span>
                  <span className="truncate">
                    {tab.draft.name || "Untitled"}
                  </span>
                  {tab.isDirty && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-pm-orange shrink-0"
                      title="Unsaved"
                    />
                  )}
                  {tabs.length > 1 && (
                    <span
                      className="w-4 h-4 flex items-center justify-center rounded-sm text-[13px] text-pm-text-t shrink-0 opacity-0 group-hover:opacity-100 hover:bg-pm-active hover:text-pm-text transition-all duration-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.tabId);
                      }}
                    >
                      &times;
                    </span>
                  )}
                </button>
              );
            })}
            <button
              className="px-3 text-pm-text-t text-base hover:text-pm-text hover:bg-pm-hover transition-all duration-150 shrink-0"
              type="button"
              onClick={() => handleNewRequest()}
              title="New tab"
            >
              +
            </button>
            <div className="ml-auto flex items-center px-2 gap-1.5 shrink-0">
              <select
                className="pm-input w-auto px-2 py-0.5 rounded text-[11px] text-pm-text-t border-pm-border-s bg-transparent"
                value={activeEnvironmentId ?? ""}
                onChange={(event) => void handleActiveEnvironmentChange(event.target.value || null)}
              >
                <option value="">No Environment</option>
                {bootstrap.environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SplitPane
            top={
              <RequestEditor
                draft={draft}
                loading={activeTab?.loading ?? false}
                activeEnvironmentName={
                  bootstrap.environments.find((environment) => environment.id === activeEnvironmentId)?.name ?? null
                }
                activeEnvironmentVariables={activeEnvironmentVariables}
                onChange={handleDraftChange}
                onSave={handleSave}
                onSend={handleSend}
              />
            }
            bottom={
              <ResponsePanel
                response={activeTab?.response ?? null}
                loading={activeTab?.loading ?? false}
                error={activeTab?.error ?? null}
                consoleLogs={activeTab?.consoleLogs ?? []}
              />
            }
          />

          <div className="flex items-center justify-between px-3 h-6 bg-pm-bg-s border-t border-pm-border-s text-[11px] text-pm-text-t shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-st-success" />
              <span>{status}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {tabs.length} tab{tabs.length !== 1 ? "s" : ""}
              </span>
              <span>Local</span>
            </div>
          </div>
        </main>
      </div>

      {showCurlModal && (
        <ImportCurlModal
          onImport={handleImportCurl}
          onClose={() => {
            setImportTargetCollectionId(null);
            setShowCurlModal(false);
          }}
        />
      )}
    </div>
  );
}

function extractNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1].replace(/[_-]/g, " ");
    }
    return u.hostname;
  } catch {
    return "Imported Request";
  }
}

function requestToDraft(request: RequestRecord): SaveRequestDraftInput {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    collectionId: request.collectionId,
    folderId: request.folderId,
    name: request.name,
    method: request.method,
    url: request.url,
    queryParams: request.queryParams,
    headers: request.headers,
    bodyType: normalizeBodyType(request.bodyType, request.body),
    body: request.body,
    bodyMeta: request.bodyMeta,
    authType: request.authType,
    authConfig: request.authConfig,
  };
}

function normalizeBodyType(
  bodyType: RequestBodyType | null | undefined,
  body: string | null | undefined,
): RequestBodyType {
  if (bodyType) {
    return bodyType;
  }

  return body ? "raw" : "none";
}

function RailButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`w-[34px] h-[34px] flex items-center justify-center rounded text-pm-text-t hover:bg-pm-hover hover:text-pm-text transition-all duration-150 ${
        active ? "rail-active-indicator" : ""
      }`}
      type="button"
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SplitPane({
  top,
  bottom,
}: {
  top: React.ReactNode;
  bottom: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState<number | null>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newTop = Math.max(
        120,
        Math.min(event.clientY - rect.top, rect.height - 120),
      );
      setTopHeight(newTop);
    }

    function handleMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
    >
      <div
        className="flex flex-col overflow-hidden shrink-0"
        style={{ height: topHeight ?? "50%" }}
      >
        {top}
      </div>
      <div
        className="h-[4px] bg-pm-border-s shrink-0 cursor-row-resize hover:bg-pm-orange active:bg-pm-orange transition-colors duration-100"
        onMouseDown={handleMouseDown}
      />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {bottom}
      </div>
    </div>
  );
}
