import { useMemo, useState } from "react";
import type { CollectionRecord, RequestRecord } from "@shared/models";
import { METHOD_COLOR } from "../utils/method-colors";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface SidebarProps {
  workspaceName: string;
  collections: CollectionRecord[];
  requests: RequestRecord[];
  activeRequestId: string | null;
  selectedCollectionId: string | null;
  historyCount: number;
  environmentCount: number;
  onNewCollection(name: string): void;
  onNewFolder(name: string, parentId: string): void;
  onImportCollection(): void;
  onSelectCollection(collection: CollectionRecord | null): void;
  onNewRequest(name: string, collectionId: string | null): void;
  onMoveRequest(requestId: string, collectionId: string | null): void;
  onRenameCollection(collectionId: string, name: string): void;
  onDeleteCollection(collectionId: string): void;
  onExportCollection(collectionId: string): void;
  onImportCurl(collectionId?: string | null): void;
  onRenameRequest(requestId: string, name: string): void;
  onDeleteRequest(requestId: string): void;
  onSelectRequest(request: RequestRecord): void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface FolderNode {
  folder: CollectionRecord;
  folders: FolderNode[];
  requests: RequestRecord[];
}

interface CollectionNode {
  collection: CollectionRecord;
  folders: FolderNode[];
  requests: RequestRecord[];
}

type CreateState =
  | { type: "collection" }
  | { type: "folder"; parentId: string }
  | { type: "request"; targetId: string | null }
  | null;

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ArrowIcon({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      {up ? <polyline points="17 8 12 3 7 8" /> : <polyline points="7 10 12 15 17 10" />}
      <line x1="12" y1={up ? "3" : "15"} x2="12" y2={up ? "15" : "3"} />
    </svg>
  );
}

function PlusIcon({ small = false }: { small?: boolean }) {
  return (
    <svg width={small ? "12" : "14"} height={small ? "12" : "14"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={small ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CurlIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function Sidebar({
  workspaceName,
  collections,
  requests,
  activeRequestId,
  selectedCollectionId,
  onNewCollection,
  onNewFolder,
  onImportCollection,
  onSelectCollection,
  onNewRequest,
  onMoveRequest,
  onRenameCollection,
  onDeleteCollection,
  onExportCollection,
  onImportCurl,
  onRenameRequest,
  onDeleteRequest,
  onSelectRequest,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [createState, setCreateState] = useState<CreateState>(null);
  const [draftName, setDraftName] = useState("");
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [collectionRenameDraft, setCollectionRenameDraft] = useState("");
  const [renamingRequestId, setRenamingRequestId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [draggedRequestId, setDraggedRequestId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const [isDropTargetRoot, setIsDropTargetRoot] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const selectedItem = collections.find((item) => item.id === selectedCollectionId) ?? null;
  const canExportSelectedCollection = selectedItem?.kind === "collection";

  const topLevelCollections = useMemo(
    () =>
      collections
        .filter((item) => item.kind === "collection" && item.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [collections],
  );

  const filteredCollections = useMemo(() => {
    const childFoldersByParent = new Map<string, CollectionRecord[]>();

    for (const item of collections) {
      if (item.kind !== "folder" || !item.parentId) {
        continue;
      }

      const siblings = childFoldersByParent.get(item.parentId) ?? [];
      siblings.push(item);
      childFoldersByParent.set(item.parentId, siblings);
    }

    const matchesCollection = (collection: CollectionRecord) =>
      normalizedQuery.length === 0 || collection.name.toLowerCase().includes(normalizedQuery);
    const matchesRequest = (request: RequestRecord) =>
      normalizedQuery.length === 0 ||
      request.name.toLowerCase().includes(normalizedQuery) ||
      request.method.toLowerCase().includes(normalizedQuery);
    const sortFolders = (items: CollectionRecord[]) =>
      [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const buildFolders = (parentId: string, collectionId: string): FolderNode[] =>
      sortFolders(childFoldersByParent.get(parentId) ?? [])
        .map((folder) => {
          const folders = buildFolders(folder.id, collectionId);
          const folderRequests = requests.filter(
            (request) =>
              request.collectionId === collectionId &&
              request.folderId === folder.id &&
              matchesRequest(request),
          );
          const includeFolder =
            normalizedQuery.length === 0 ||
            matchesCollection(folder) ||
            folderRequests.length > 0 ||
            folders.length > 0;

          if (!includeFolder) {
            return null;
          }

          return { folder, folders, requests: folderRequests } satisfies FolderNode;
        })
        .filter((item): item is FolderNode => item !== null);

    return topLevelCollections
      .map((collection) => {
        const collectionRequests = requests.filter(
          (request) =>
            request.collectionId === collection.id &&
            request.folderId === null &&
            matchesRequest(request),
        );
        const folders = buildFolders(collection.id, collection.id);
        const includeCollection =
          normalizedQuery.length === 0 ||
          matchesCollection(collection) ||
          collectionRequests.length > 0 ||
          folders.length > 0;

        if (!includeCollection) {
          return null;
        }

        return { collection, folders, requests: collectionRequests } satisfies CollectionNode;
      })
      .filter((item): item is CollectionNode => item !== null);
  }, [collections, normalizedQuery, requests, topLevelCollections]);

  const rootRequests = useMemo(
    () =>
      requests.filter((request) => {
        const requestMatches =
          normalizedQuery.length === 0 ||
          request.name.toLowerCase().includes(normalizedQuery) ||
          request.method.toLowerCase().includes(normalizedQuery);
        return request.collectionId === null && requestMatches;
      }),
    [normalizedQuery, requests],
  );

  function isCollectionExpanded(collectionId: string) {
    return expandedCollections[collectionId] ?? true;
  }

  function setCollectionExpanded(collectionId: string, open: boolean) {
    setExpandedCollections((prev) => ({ ...prev, [collectionId]: open }));
  }

  function findCollection(itemId: string | null | undefined) {
    if (!itemId) {
      return null;
    }

    return collections.find((item) => item.id === itemId) ?? null;
  }

  function findParentCollectionId(itemId: string | null | undefined): string | null {
    let current = findCollection(itemId);

    while (current?.kind === "folder" && current.parentId) {
      current = findCollection(current.parentId);
    }

    return current?.kind === "collection" ? current.id : null;
  }

  function getDropPlacement(targetId: string | null) {
    const target = findCollection(targetId);
    if (!target) {
      return { collectionId: null, folderId: null };
    }

    if (target.kind === "collection") {
      return { collectionId: target.id, folderId: null };
    }

    const collectionId = findParentCollectionId(target.id);
    return {
      collectionId,
      folderId: collectionId ? target.id : null,
    };
  }

  function startCreateCollection() {
    setWorkspaceOpen(true);
    setCreateState({ type: "collection" });
    setDraftName("");
  }

  function startCreateFolder(parentId: string) {
    setWorkspaceOpen(true);
    setCollectionExpanded(parentId, true);
    setCreateState({ type: "folder", parentId });
    setDraftName("");
  }

  function startCreateRequest(targetId: string | null = selectedCollectionId) {
    setWorkspaceOpen(true);
    if (targetId) {
      setCollectionExpanded(targetId, true);
    }
    setCreateState({ type: "request", targetId });
    setDraftName("");
  }

  function confirmCreate() {
    if (!createState) {
      return;
    }

    const nextName = draftName.trim();
    const pendingCreate = createState;
    setCreateState(null);
    setDraftName("");

    if (pendingCreate.type === "collection") {
      onNewCollection(nextName || "New Collection");
      return;
    }

    if (pendingCreate.type === "folder") {
      onNewFolder(nextName || "New Folder", pendingCreate.parentId);
      return;
    }

    onNewRequest(nextName || "Untitled Request", pendingCreate.targetId);
  }

  function cancelCreate() {
    setCreateState(null);
    setDraftName("");
  }

  function startRenameRequest(request: RequestRecord) {
    if (request.collectionId) {
      setCollectionExpanded(request.collectionId, true);
    }
    if (request.folderId) {
      setCollectionExpanded(request.folderId, true);
    }
    setRenamingRequestId(request.id);
    setRenameDraft(request.name);
  }

  function startRenameCollection(collection: CollectionRecord) {
    setCollectionExpanded(collection.id, true);
    setRenamingCollectionId(collection.id);
    setCollectionRenameDraft(collection.name);
  }

  function confirmRenameCollection(collection: CollectionRecord) {
    const trimmedName = collectionRenameDraft.trim();
    setRenamingCollectionId(null);
    setCollectionRenameDraft("");

    if (!trimmedName || trimmedName === collection.name) {
      return;
    }

    onRenameCollection(collection.id, trimmedName);
  }

  function cancelRenameCollection() {
    setRenamingCollectionId(null);
    setCollectionRenameDraft("");
  }

  function confirmRenameRequest(request: RequestRecord) {
    const trimmedName = renameDraft.trim();
    setRenamingRequestId(null);
    setRenameDraft("");

    if (!trimmedName || trimmedName === request.name) {
      return;
    }

    onRenameRequest(request.id, trimmedName);
  }

  function cancelRenameRequest() {
    setRenamingRequestId(null);
    setRenameDraft("");
  }

  function clearDragState() {
    setDraggedRequestId(null);
    setDropTargetItemId(null);
    setIsDropTargetRoot(false);
  }

  function getDraggedRequest() {
    return requests.find((request) => request.id === draggedRequestId) ?? null;
  }

  function canDropIntoCollection(targetCollectionId: string | null) {
    const draggedRequest = getDraggedRequest();
    if (!draggedRequest) {
      return false;
    }

    if (targetCollectionId === null) {
      return draggedRequest.collectionId !== null || draggedRequest.folderId !== null;
    }

    const targetPlacement = getDropPlacement(targetCollectionId);
    return (
      draggedRequest.collectionId !== targetPlacement.collectionId ||
      draggedRequest.folderId !== targetPlacement.folderId
    );
  }

  function handleRequestDragStart(event: React.DragEvent, request: RequestRecord) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", request.id);
    setDraggedRequestId(request.id);
    setDropTargetItemId(null);
    setIsDropTargetRoot(false);
  }

  function handleRequestDragEnd() {
    clearDragState();
  }

  function handleCollectionDragOver(event: React.DragEvent, targetCollectionId: string) {
    if (!canDropIntoCollection(targetCollectionId)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetItemId(targetCollectionId);
    setIsDropTargetRoot(false);
  }

  function handleCollectionDrop(event: React.DragEvent, targetCollectionId: string) {
    if (!canDropIntoCollection(targetCollectionId) || !draggedRequestId) {
      return;
    }

    event.preventDefault();
    onMoveRequest(draggedRequestId, targetCollectionId);
    clearDragState();
  }

  function handleRootDragOver(event: React.DragEvent) {
    if (!canDropIntoCollection(null)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetItemId(null);
    setIsDropTargetRoot(true);
  }

  function handleRootDrop(event: React.DragEvent) {
    if (!canDropIntoCollection(null) || !draggedRequestId) {
      return;
    }

    event.preventDefault();
    onMoveRequest(draggedRequestId, null);
    clearDragState();
  }

  const workspaceMenuItems: ContextMenuItem[] = [
    { label: "New Collection", icon: <FolderIcon />, onClick: startCreateCollection },
    { label: "New Request", icon: <PlusIcon />, onClick: () => startCreateRequest(selectedCollectionId) },
    { label: "Import Collection", icon: <ArrowIcon />, onClick: onImportCollection },
    { label: "Import cURL", icon: <CurlIcon />, onClick: () => onImportCurl(selectedCollectionId) },
  ];

  function openCollectionMenu(event: React.MouseEvent, collection: CollectionRecord) {
    event.preventDefault();
    const renameLabel = collection.kind === "folder" ? "Rename Folder" : "Rename Collection";
    const deleteLabel = collection.kind === "folder" ? "Delete Folder" : "Delete Collection";
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Add Request", icon: <PlusIcon />, onClick: () => startCreateRequest(collection.id) },
        { label: "Add Folder", icon: <FolderIcon />, onClick: () => startCreateFolder(collection.id) },
        { label: "Import cURL", icon: <CurlIcon />, onClick: () => onImportCurl(collection.id) },
        ...(collection.kind === "collection"
          ? [{ label: "Export Collection", icon: <ArrowIcon up />, onClick: () => onExportCollection(collection.id) }]
          : []),
        { label: renameLabel, icon: <EditIcon />, onClick: () => startRenameCollection(collection) },
        { label: deleteLabel, icon: <TrashIcon />, onClick: () => onDeleteCollection(collection.id) },
      ],
    });
  }

  function openWorkspaceMenu(event: React.MouseEvent) {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, items: workspaceMenuItems });
  }

  function renderRequestCreateInput(targetCollectionId: string | null) {
    if (createState?.type !== "request" || createState.targetId !== targetCollectionId) {
      return null;
    }

    return (
      <div className="flex items-center gap-1.5 py-1 px-2">
        <span className="text-[10px] font-bold min-w-[36px] text-center shrink-0 text-method-get">GET</span>
        <input
          className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input flex-1"
          placeholder="Request name..."
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmCreate();
            if (e.key === "Escape") cancelCreate();
          }}
          onBlur={confirmCreate}
          autoFocus
        />
      </div>
    );
  }

  function renderFolderCreateInput(parentId: string) {
    if (createState?.type !== "folder" || createState.parentId !== parentId) {
      return null;
    }

    return (
      <div className="flex items-center gap-1.5 py-1 px-2">
        <span className="w-4 h-4 flex items-center justify-center text-pm-text-t shrink-0">
          <FolderIcon />
        </span>
        <input
          className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input flex-1"
          placeholder="Folder name..."
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmCreate();
            if (e.key === "Escape") cancelCreate();
          }}
          onBlur={confirmCreate}
          autoFocus
        />
      </div>
    );
  }

  function renderRequestRow(request: RequestRecord) {
    const isRenaming = renamingRequestId === request.id;
    const isDragging = draggedRequestId === request.id;

    return (
      <div
        key={request.id}
        className={`flex items-center gap-2 py-1 px-2 rounded w-full text-left text-[13px] transition-colors duration-150 hover:bg-pm-hover ${
          activeRequestId === request.id ? "bg-pm-active" : ""
        } ${isDragging ? "opacity-50" : ""}`}
        draggable={!isRenaming}
        onDragStart={(event) => handleRequestDragStart(event, request)}
        onDragEnd={handleRequestDragEnd}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
              { label: "Rename Request", icon: <EditIcon />, onClick: () => startRenameRequest(request) },
              { label: "Delete Request", icon: <TrashIcon />, onClick: () => onDeleteRequest(request.id) },
            ],
          });
        }}
      >
        <button
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
          onClick={() => onSelectRequest(request)}
          onDoubleClick={() => startRenameRequest(request)}
          type="button"
        >
          <span
            className={`text-[10px] font-bold min-w-[36px] text-center shrink-0 tracking-tight ${
              METHOD_COLOR[request.method] ?? ""
            }`}
          >
            {request.method}
          </span>
          {isRenaming ? (
            <input
              className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input min-w-0"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={() => confirmRenameRequest(request)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmRenameRequest(request);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRenameRequest();
                }
              }}
              autoFocus
            />
          ) : (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-pm-text">
              {request.name}
            </span>
          )}
        </button>
      </div>
    );
  }

  function renderFolderNode(node: FolderNode) {
    const isExpanded = normalizedQuery ? true : isCollectionExpanded(node.folder.id);
    const isSelected = selectedCollectionId === node.folder.id;
    const isRenamingCollection = renamingCollectionId === node.folder.id;
    const hasChildren = node.folders.length > 0 || node.requests.length > 0;

    return (
      <div key={node.folder.id} className="space-y-1">
        <div
          className={`group flex items-center gap-1.5 py-1 px-1 rounded text-[13px] text-pm-text transition-colors duration-150 ${
            dropTargetItemId === node.folder.id
              ? "bg-pm-active ring-1 ring-pm-orange"
              : isSelected
                ? "bg-pm-active"
                : "hover:bg-pm-hover"
          }`}
          onClick={() => onSelectCollection(node.folder)}
          onDragOver={(event) => handleCollectionDragOver(event, node.folder.id)}
          onDragLeave={() => {
            if (dropTargetItemId === node.folder.id) {
              setDropTargetItemId(null);
            }
          }}
          onDrop={(event) => handleCollectionDrop(event, node.folder.id)}
          onContextMenu={(event) => openCollectionMenu(event, node.folder)}
        >
          <button
            className={`w-3.5 h-3.5 flex items-center justify-center text-pm-text-t text-[10px] shrink-0 transition-transform duration-150 ${
              isExpanded ? "rotate-90" : ""
            } ${hasChildren ? "" : "opacity-40"}`}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) {
                setCollectionExpanded(node.folder.id, !isExpanded);
              }
            }}
            type="button"
          >
            &#9654;
          </button>
          <span className="w-4 h-4 flex items-center justify-center text-pm-text-t shrink-0">
            <FolderIcon />
          </span>
          {isRenamingCollection ? (
            <input
              className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input min-w-0 flex-1"
              value={collectionRenameDraft}
              onChange={(e) => setCollectionRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={() => confirmRenameCollection(node.folder)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmRenameCollection(node.folder);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRenameCollection();
                }
              }}
              autoFocus
            />
          ) : (
            <span
              className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
              onDoubleClick={(event) => {
                event.stopPropagation();
                startRenameCollection(node.folder);
              }}
            >
              {node.folder.name}
            </span>
          )}
          <button
            className="w-5 h-5 flex items-center justify-center rounded text-pm-text-t opacity-0 group-hover:opacity-100 hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={(event) => {
              event.stopPropagation();
              startCreateRequest(node.folder.id);
            }}
            type="button"
            title="New Request in Folder"
          >
            <PlusIcon small />
          </button>
        </div>

        {isExpanded && (
          <div className="ml-3 pl-4 space-y-1 border-l border-pm-border-s/70">
            {renderFolderCreateInput(node.folder.id)}
            {renderRequestCreateInput(node.folder.id)}
            {node.folders.map(renderFolderNode)}
            {node.requests.map(renderRequestRow)}
            {node.folders.length === 0 &&
              node.requests.length === 0 &&
              createState?.type !== "folder" &&
              !(createState?.type === "request" && createState.targetId === node.folder.id) &&
              normalizedQuery.length === 0 && (
                <div className="py-1 px-2 text-[11px] text-pm-text-t">No requests yet</div>
              )}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="bg-pm-bg-sidebar border-r border-pm-border-s flex flex-col overflow-hidden max-lg:hidden">
      <div className="flex items-center justify-between pt-2.5 px-3 gap-2">
        <span className="text-xs font-semibold text-pm-text-s uppercase tracking-wide">Collections</span>
        <div className="flex items-center gap-0.5">
          <button
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={() => startCreateRequest(selectedCollectionId)}
            type="button"
            title={selectedItem ? `New Request in ${selectedItem.kind === "folder" ? "Folder" : "Collection"}` : "New Request"}
          >
            <PlusIcon />
          </button>
          <button
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={startCreateCollection}
            type="button"
            title="New Collection"
          >
            <FolderIcon />
          </button>
          <button
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={onImportCollection}
            type="button"
            title="Import ReqKit Collection"
          >
            <ArrowIcon />
          </button>
          <button
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150 disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={() => {
              if (canExportSelectedCollection && selectedItem) {
                onExportCollection(selectedItem.id);
              }
            }}
            type="button"
            title="Export Selected Collection"
            disabled={!canExportSelectedCollection}
          >
            <ArrowIcon up />
          </button>
          <button
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={() => onImportCurl(selectedCollectionId)}
            type="button"
            title="Import cURL"
          >
            <CurlIcon />
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <input
          className="pm-input bg-pm-bg border-pm-border-s text-xs text-pm-text-t"
          placeholder="Filter requests or collections..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="mb-0.5">
          <div
            className={`flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-[13px] font-medium transition-colors duration-150 ${
              isDropTargetRoot
                ? "bg-pm-active ring-1 ring-pm-orange"
                : selectedCollectionId === null
                  ? "bg-pm-active"
                  : "hover:bg-pm-hover"
            }`}
            onClick={() => {
              onSelectCollection(null);
              setWorkspaceOpen((prev) => (normalizedQuery ? true : !prev));
            }}
            onContextMenu={openWorkspaceMenu}
            onDragOver={handleRootDragOver}
            onDragLeave={() => setIsDropTargetRoot(false)}
            onDrop={handleRootDrop}
          >
            <button
              className={`w-3.5 h-3.5 flex items-center justify-center text-pm-text-t text-[10px] shrink-0 transition-transform duration-150 ${
                workspaceOpen ? "rotate-90" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setWorkspaceOpen((prev) => !prev);
              }}
              type="button"
            >
              &#9654;
            </button>
            <span className="w-4 h-4 flex items-center justify-center text-pm-text-t shrink-0">
              <FolderIcon />
            </span>
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{workspaceName}</span>
          </div>

          {(workspaceOpen || normalizedQuery) && (
            <div className="pl-5 space-y-1">
              {createState?.type === "collection" && (
                <div className="flex items-center gap-1.5 py-1 px-2">
                  <span className="w-4 h-4 flex items-center justify-center text-pm-text-t shrink-0">
                    <FolderIcon />
                  </span>
                  <input
                    className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input flex-1"
                    placeholder="Collection name..."
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmCreate();
                      if (e.key === "Escape") cancelCreate();
                    }}
                    onBlur={confirmCreate}
                    autoFocus
                  />
                </div>
              )}

              {filteredCollections.map((node) => {
                const isExpanded = normalizedQuery ? true : isCollectionExpanded(node.collection.id);
                const isSelected = selectedCollectionId === node.collection.id;
                const isRenamingCollection = renamingCollectionId === node.collection.id;
                const hasChildren = node.folders.length > 0 || node.requests.length > 0;

                return (
                  <div key={node.collection.id} className="mb-0.5">
                    <div
                      className={`group flex items-center gap-1.5 py-1 px-1 rounded cursor-pointer text-[13px] transition-colors duration-150 ${
                        dropTargetItemId === node.collection.id
                          ? "bg-pm-active ring-1 ring-pm-orange"
                          : isSelected
                            ? "bg-pm-active"
                            : "hover:bg-pm-hover"
                      }`}
                      onClick={() => onSelectCollection(node.collection)}
                      onDragOver={(event) => handleCollectionDragOver(event, node.collection.id)}
                      onDragLeave={() => {
                        if (dropTargetItemId === node.collection.id) {
                          setDropTargetItemId(null);
                        }
                      }}
                      onDrop={(event) => handleCollectionDrop(event, node.collection.id)}
                      onContextMenu={(event) => openCollectionMenu(event, node.collection)}
                    >
                      <button
                        className={`w-3.5 h-3.5 flex items-center justify-center text-pm-text-t text-[10px] shrink-0 transition-transform duration-150 ${
                          isExpanded ? "rotate-90" : ""
                        } ${hasChildren ? "" : "opacity-40"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (hasChildren) {
                            setCollectionExpanded(node.collection.id, !isExpanded);
                          }
                        }}
                        type="button"
                      >
                        &#9654;
                      </button>
                      <span className="w-4 h-4 flex items-center justify-center text-pm-text-t shrink-0">
                        <FolderIcon />
                      </span>
                      {isRenamingCollection ? (
                        <input
                          className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input min-w-0 flex-1"
                          value={collectionRenameDraft}
                          onChange={(e) => setCollectionRenameDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onBlur={() => confirmRenameCollection(node.collection)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              confirmRenameCollection(node.collection);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRenameCollection();
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-pm-text"
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            startRenameCollection(node.collection);
                          }}
                        >
                          {node.collection.name}
                        </span>
                      )}
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded text-pm-text-t opacity-0 group-hover:opacity-100 hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
                        onClick={(event) => {
                          event.stopPropagation();
                          startCreateRequest(node.collection.id);
                        }}
                        type="button"
                        title="New Request in Collection"
                      >
                        <PlusIcon small />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="ml-3 pl-4 pt-1 space-y-1 border-l border-pm-border-s/70">
                        {renderFolderCreateInput(node.collection.id)}
                        {renderRequestCreateInput(node.collection.id)}
                        {node.folders.map(renderFolderNode)}
                        {node.requests.map(renderRequestRow)}
                        {node.folders.length === 0 &&
                          node.requests.length === 0 &&
                          createState?.type !== "folder" &&
                          !(createState?.type === "request" && createState.targetId === node.collection.id) &&
                          normalizedQuery.length === 0 && (
                            <div className="py-1 px-2 text-[11px] text-pm-text-t">No requests yet</div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="pl-4 pt-1 space-y-1">
                {renderRequestCreateInput(null)}
                {rootRequests.map(renderRequestRow)}
              </div>

              {filteredCollections.length === 0 && rootRequests.length === 0 && createState === null && (
                <div className="py-4 px-3 text-center text-pm-text-t text-xs">
                  {normalizedQuery ? (
                    "No matching requests or collections"
                  ) : (
                    <>
                      <div className="mb-1">No collections yet</div>
                      <button className="text-pm-orange hover:underline" onClick={startCreateCollection} type="button">
                        Create one
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}
