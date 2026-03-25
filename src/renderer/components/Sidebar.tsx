import { useState } from 'react';
import type { RequestRecord } from '@shared/models';
import type { SaveRequestDraftInput } from '@shared/ipc';
import { METHOD_COLOR } from '../utils/method-colors';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

interface SidebarProps {
  workspaceName: string;
  requests: RequestRecord[];
  activeRequestId: string | null;
  historyCount: number;
  environmentCount: number;
  onNewRequest(name: string): void;
  onImportCurl(): void;
  onRenameRequest(requestId: string, name: string): void;
  onSelectRequest(request: RequestRecord): void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function Sidebar({
  workspaceName,
  requests,
  activeRequestId,
  onNewRequest,
  onImportCurl,
  onRenameRequest,
  onSelectRequest,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collectionOpen, setCollectionOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingRequestId, setRenamingRequestId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const filteredRequests = searchQuery
    ? requests.filter(
        (r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.method.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : requests;

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, items: contextMenuItems });
  }

  function startNewRequest() {
    setIsCreating(true);
    setNewName('');
    setCollectionOpen(true);
  }

  function startRenameRequest(request: RequestRecord) {
    setRenamingRequestId(request.id);
    setRenameDraft(request.name);
    setCollectionOpen(true);
  }

  function confirmRenameRequest(request: RequestRecord) {
    const trimmedName = renameDraft.trim();
    setRenamingRequestId(null);
    setRenameDraft('');

    if (!trimmedName || trimmedName === request.name) {
      return;
    }

    onRenameRequest(request.id, trimmedName);
  }

  function cancelRenameRequest() {
    setRenamingRequestId(null);
    setRenameDraft('');
  }

  function confirmNewRequest() {
    const name = newName.trim() || 'Untitled Request';
    setIsCreating(false);
    setNewName('');
    onNewRequest(name);
  }

  function cancelNewRequest() {
    setIsCreating(false);
    setNewName('');
  }

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: 'New Request',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
      onClick: startNewRequest,
    },
    {
      label: 'Import cURL',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
      onClick: onImportCurl,
    },
  ];

  return (
    <aside className="bg-pm-bg-sidebar border-r border-pm-border-s flex flex-col overflow-hidden max-lg:hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between pt-2.5 px-3 gap-2">
        <span className="text-xs font-semibold text-pm-text-s uppercase tracking-wide">
          Collections
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s text-base hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={startNewRequest}
            type="button"
            title="New Request"
          >
            +
          </button>
          <button
            className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
            onClick={onImportCurl}
            type="button"
            title="Import cURL"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          className="pm-input bg-pm-bg border-pm-border-s text-xs text-pm-text-t"
          placeholder="Filter collections..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Collection tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="mb-0.5">
          {/* Collection header — right-clickable */}
          <div
            className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-[13px] font-medium hover:bg-pm-hover transition-colors duration-150"
            onClick={() => setCollectionOpen(!collectionOpen)}
            onContextMenu={handleContextMenu}
          >
            <span
              className={`w-3.5 h-3.5 flex items-center justify-center text-pm-text-t text-[10px] shrink-0 transition-transform duration-150 ${
                collectionOpen ? 'rotate-90' : ''
              }`}
            >
              &#9654;
            </span>
            <span className="w-4 h-4 flex items-center justify-center text-pm-text-t shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </span>
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {workspaceName}
            </span>
          </div>

          {/* Collection items */}
          {collectionOpen && (
            <div className="pl-5">
              {/* Inline new request input */}
              {isCreating && (
                <div className="flex items-center gap-1.5 py-1 px-1">
                  <span className="text-[10px] font-bold min-w-[36px] text-center shrink-0 text-method-get">
                    GET
                  </span>
                  <input
                    className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input flex-1"
                    placeholder="Request name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmNewRequest();
                      if (e.key === 'Escape') cancelNewRequest();
                    }}
                    onBlur={() => {
                      // Small delay to allow click events to fire
                      setTimeout(() => { if (isCreating) confirmNewRequest(); }, 150);
                    }}
                    autoFocus
                  />
                </div>
              )}

              {filteredRequests.length === 0 && !isCreating ? (
                <div className="py-4 px-3 text-center text-pm-text-t text-xs">
                  {searchQuery ? 'No matching requests' : (
                    <>
                      <div className="mb-1">No saved requests yet</div>
                      <button
                        className="text-pm-orange hover:underline"
                        onClick={startNewRequest}
                        type="button"
                      >
                        Create one
                      </button>
                    </>
                  )}
                </div>
              ) : (
                filteredRequests.map((request) => (
                  <div
                    key={request.id}
                    className={`flex items-center gap-2 py-1 px-2 rounded w-full text-left text-[13px] transition-colors duration-150 hover:bg-pm-hover ${
                      activeRequestId === request.id ? 'bg-pm-active' : ''
                    }`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                          {
                            label: 'Rename Request',
                            icon: (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4Z" />
                              </svg>
                            ),
                            onClick: () => startRenameRequest(request),
                          },
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
                          METHOD_COLOR[request.method] ?? ''
                        }`}
                      >
                        {request.method}
                      </span>
                      {renamingRequestId === request.id ? (
                        <input
                          className="pm-input text-xs py-0.5 px-1.5 bg-pm-bg-input min-w-0"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onBlur={() => confirmRenameRequest(request)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              confirmRenameRequest(request);
                            }
                            if (e.key === 'Escape') {
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
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
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
