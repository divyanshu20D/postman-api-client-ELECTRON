import { useEffect, useState } from 'react';
import type { EnvironmentRecord, VariableRecord } from '@shared/models';

interface EnvironmentsPanelProps {
  workspaceId: string;
  environments: EnvironmentRecord[];
  onEnvironmentsChanged(): void;
}

export function EnvironmentsPanel({ workspaceId, environments, onEnvironmentsChanged }: EnvironmentsPanelProps) {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(environments[0]?.id ?? null);
  const [variables, setVariables] = useState<VariableRecord[]>([]);
  const [newEnvName, setNewEnvName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Load variables when selected environment changes
  useEffect(() => {
    if (!selectedEnvId) {
      setVariables([]);
      return;
    }
    void window.appApi.listVariables(selectedEnvId).then(setVariables);
  }, [selectedEnvId]);

  async function handleCreateEnv() {
    if (!newEnvName.trim()) return;
    const env = await window.appApi.createEnvironment({ workspaceId, name: newEnvName.trim() });
    setNewEnvName('');
    setIsCreating(false);
    setSelectedEnvId(env.id);
    onEnvironmentsChanged();
  }

  async function handleDeleteEnv(id: string) {
    await window.appApi.deleteEnvironment(id);
    if (selectedEnvId === id) {
      setSelectedEnvId(null);
    }
    onEnvironmentsChanged();
  }

  async function handleSaveVariable(variable: Partial<VariableRecord> & { key: string }) {
    const saved = await window.appApi.saveVariable({
      id: variable.id,
      environmentId: selectedEnvId!,
      workspaceId,
      key: variable.key,
      value: variable.value ?? null,
      isSecret: variable.isSecret ?? false,
    });
    // Refresh variables
    const updated = await window.appApi.listVariables(selectedEnvId!);
    setVariables(updated);
    return saved;
  }

  async function handleDeleteVariable(id: string) {
    await window.appApi.deleteVariable(id);
    setVariables((prev) => prev.filter((v) => v.id !== id));
  }

  const selectedEnv = environments.find((e) => e.id === selectedEnvId) ?? null;

  return (
    <aside className="bg-pm-bg-sidebar border-r border-pm-border-s flex flex-col overflow-hidden max-lg:hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between pt-2.5 px-3 gap-2">
        <span className="text-xs font-semibold text-pm-text-s uppercase tracking-wide">Environments</span>
        <button
          className="w-[26px] h-[26px] flex items-center justify-center rounded text-pm-text-s text-base hover:bg-pm-hover hover:text-pm-text transition-all duration-150"
          onClick={() => setIsCreating(true)}
          type="button"
          title="New Environment"
        >
          +
        </button>
      </div>

      {/* Create new environment */}
      {isCreating && (
        <div className="px-3 py-2 flex gap-1.5">
          <input
            className="pm-input bg-pm-bg border-pm-border-s text-xs flex-1"
            placeholder="Environment name..."
            value={newEnvName}
            onChange={(e) => setNewEnvName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateEnv();
              if (e.key === 'Escape') { setIsCreating(false); setNewEnvName(''); }
            }}
            autoFocus
          />
          <button
            className="px-2 py-1 text-xs bg-pm-orange text-white rounded hover:bg-pm-orange-h transition-colors"
            onClick={() => void handleCreateEnv()}
            type="button"
          >
            Add
          </button>
        </div>
      )}

      {/* Environment list */}
      <div className="px-2 py-1 flex flex-col gap-0.5">
        {environments.length === 0 && !isCreating && (
          <div className="py-6 px-3 text-center text-pm-text-t text-xs">
            <div className="text-2xl mb-2">&#127758;</div>
            <div className="font-medium text-pm-text-s mb-1">No environments</div>
            <div>Create one to manage variables like base URLs and API keys.</div>
          </div>
        )}
        {environments.map((env) => (
          <div
            key={env.id}
            className={`group flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-[13px] transition-colors duration-150 hover:bg-pm-hover ${
              selectedEnvId === env.id ? 'bg-pm-active' : ''
            }`}
            onClick={() => setSelectedEnvId(env.id)}
          >
            <span className="w-4 h-4 flex items-center justify-center text-pm-text-t shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </span>
            <span className="flex-1 truncate text-pm-text">{env.name}</span>
            <button
              className="text-pm-text-t opacity-0 group-hover:opacity-100 hover:text-st-error transition-all duration-150"
              onClick={(e) => { e.stopPropagation(); void handleDeleteEnv(env.id); }}
              type="button"
              title="Delete environment"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Divider */}
      {selectedEnv && <div className="h-px bg-pm-border-s mx-3 my-1" />}

      {/* Variables editor */}
      {selectedEnv && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-pm-text-t uppercase tracking-wide">
              Variables — {selectedEnv.name}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {/* Variable rows */}
            {variables.map((variable) => (
              <VariableRow
                key={variable.id}
                variable={variable}
                onSave={(updates) => void handleSaveVariable({ ...variable, ...updates })}
                onDelete={() => void handleDeleteVariable(variable.id)}
              />
            ))}

            {/* Add variable button */}
            <button
              className="text-xs text-pm-text-t px-2 py-1.5 rounded hover:bg-pm-hover hover:text-pm-text transition-all duration-150 w-full text-left"
              onClick={() => void handleSaveVariable({ key: 'new_variable', value: '', isSecret: false })}
              type="button"
            >
              + Add variable
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ===== Variable Row ===== */

interface VariableRowProps {
  variable: VariableRecord;
  onSave(updates: { key?: string; value?: string | null }): void;
  onDelete(): void;
}

function VariableRow({ variable, onSave, onDelete }: VariableRowProps) {
  const [editingKey, setEditingKey] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [keyDraft, setKeyDraft] = useState(variable.key);
  const [valueDraft, setValueDraft] = useState(variable.value ?? '');

  return (
    <div className="group flex items-center gap-1 py-1 px-1 rounded hover:bg-pm-hover/50 transition-colors">
      {/* Key */}
      {editingKey ? (
        <input
          className="pm-input text-xs flex-1 py-0.5 px-1.5 bg-pm-bg-input"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          onBlur={() => { setEditingKey(false); if (keyDraft !== variable.key) onSave({ key: keyDraft }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          autoFocus
        />
      ) : (
        <span
          className="flex-1 text-xs text-pm-orange cursor-pointer truncate px-1.5 py-0.5"
          onClick={() => setEditingKey(true)}
        >
          {variable.key}
        </span>
      )}

      {/* Value */}
      {editingValue ? (
        <input
          className="pm-input text-xs flex-1 py-0.5 px-1.5 bg-pm-bg-input"
          value={valueDraft}
          onChange={(e) => setValueDraft(e.target.value)}
          onBlur={() => { setEditingValue(false); if (valueDraft !== (variable.value ?? '')) onSave({ value: valueDraft }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          type={variable.isSecret ? 'password' : 'text'}
          autoFocus
        />
      ) : (
        <span
          className="flex-1 text-xs text-pm-text-s cursor-pointer truncate px-1.5 py-0.5"
          onClick={() => setEditingValue(true)}
        >
          {variable.isSecret ? '••••••••' : (variable.value || '(empty)')}
        </span>
      )}

      {/* Delete */}
      <button
        className="text-pm-text-t opacity-0 group-hover:opacity-100 hover:text-st-error transition-all duration-150 shrink-0"
        onClick={onDelete}
        type="button"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
