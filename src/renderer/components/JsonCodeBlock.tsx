import { useRef } from 'react';

interface HighlightedJsonViewProps {
  value: string;
  className?: string;
}

interface HighlightedJsonEditorProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  className?: string;
}

interface JsonTreeViewProps {
  value: JsonValue;
  collapsedPaths: Set<string>;
  onToggle(path: string): void;
  className?: string;
}

interface JsonToken {
  text: string;
  className: string;
}

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const JSON_TOKEN_PATTERN = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]/g;

export function formatJson(value: string): string | null {
  const parsed = parseJsonValue(value);
  if (parsed === undefined) {
    return null;
  }

  return JSON.stringify(parsed, null, 2);
}

export function parseJsonValue(value: string): JsonValue | undefined {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return undefined;
  }
}

export function getCollapsibleJsonPaths(value: JsonValue): string[] {
  const paths: string[] = [];

  function walk(node: JsonValue, path: string) {
    if (!isContainer(node)) {
      return;
    }

    paths.push(path);

    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }

    Object.entries(node).forEach(([key, child]) => {
      walk(child, `${path}.${key}`);
    });
  }

  walk(value, '$');
  return paths;
}

export async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function HighlightedJsonView({ value, className = '' }: HighlightedJsonViewProps) {
  return (
    <pre className={`m-0 p-4 font-mono text-xs leading-[1.7] whitespace-pre-wrap break-words ${className}`}>
      {highlightJson(value)}
    </pre>
  );
}

export function HighlightedJsonEditor({
  value,
  onChange,
  placeholder,
  className = '',
}: HighlightedJsonEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  function syncScroll() {
    if (!textareaRef.current || !overlayRef.current) {
      return;
    }

    overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }

  return (
    <div className={`relative flex-1 min-h-[200px] bg-pm-bg ${className}`}>
      <div
        ref={overlayRef}
        className="absolute inset-0 overflow-auto pointer-events-none"
        aria-hidden="true"
      >
        <HighlightedJsonView value={value || placeholder || ''} className={value ? '' : 'text-pm-text-t'} />
      </div>
      <textarea
        ref={textareaRef}
        className="absolute inset-0 w-full h-full p-4 bg-transparent border-none rounded-none font-mono text-xs leading-[1.7] resize-none outline-none focus:ring-0 focus:border-transparent text-transparent caret-pm-text selection:bg-pm-active"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}

export function JsonTreeView({ value, collapsedPaths, onToggle, className = '' }: JsonTreeViewProps) {
  return (
    <div className={`p-4 font-mono text-xs leading-[1.7] text-pm-text ${className}`}>
      <TreeNode
        label={null}
        value={value}
        path="$"
        depth={0}
        parentType={null}
        collapsedPaths={collapsedPaths}
        onToggle={onToggle}
      />
    </div>
  );
}

function TreeNode({
  label,
  value,
  path,
  depth,
  parentType,
  collapsedPaths,
  onToggle,
}: {
  label: string | null;
  value: JsonValue;
  path: string;
  depth: number;
  parentType: 'array' | 'object' | null;
  collapsedPaths: Set<string>;
  onToggle(path: string): void;
}) {
  const indentStyle = { paddingLeft: `${8 + depth * 20}px` };

  if (!isContainer(value)) {
    return (
      <div style={indentStyle} className="flex items-start gap-1 whitespace-pre">
        <span className="w-4 h-4 shrink-0" />
        <span>
          <NodeLabel label={label} parentType={parentType} />
          <PrimitiveValue value={value} />
        </span>
      </div>
    );
  }

  const collapsed = collapsedPaths.has(path);
  const openBracket = Array.isArray(value) ? '[' : '{';
  const closeBracket = Array.isArray(value) ? ']' : '}';
  const entries = Array.isArray(value)
    ? value.map((child, index) => [String(index), child] as const)
    : Object.entries(value);
  const hasChildren = entries.length > 0;

  return (
    <div>
      <div style={indentStyle} className="flex items-start gap-1 whitespace-pre">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(path)}
            className="w-4 h-4 mt-[1px] text-pm-text-t hover:text-pm-text transition-colors duration-150 shrink-0"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <span className="min-w-0">
          <NodeLabel label={label} parentType={parentType} />
          <span className="text-pm-text-t">{openBracket}</span>
          {(collapsed || !hasChildren) && hasChildren && (
            <>
              <span className="text-pm-text-t"> </span>
              <span className="text-pm-text">{getCollapsedSummary(value)}</span>
              <span className="text-pm-text-t"> </span>
            </>
          )}
          {(collapsed || !hasChildren) && (
            <span className="text-pm-text-t">{closeBracket}</span>
          )}
        </span>
      </div>

      {!collapsed && entries.map(([childLabel, childValue]) => (
        <TreeNode
          key={`${path}.${childLabel}`}
          label={childLabel}
          value={childValue}
          path={Array.isArray(value) ? `${path}[${childLabel}]` : `${path}.${childLabel}`}
          depth={depth + 1}
          parentType={Array.isArray(value) ? 'array' : 'object'}
          collapsedPaths={collapsedPaths}
          onToggle={onToggle}
        />
      ))}

      {!collapsed && hasChildren && (
        <div style={indentStyle} className="whitespace-pre">
          <span className="inline-block w-4 shrink-0" />
          <span className="text-pm-text-t">{closeBracket}</span>
        </div>
      )}
    </div>
  );
}

function NodeLabel({ label, parentType }: { label: string | null; parentType: 'array' | 'object' | null }) {
  if (label === null) {
    return null;
  }

  if (parentType === 'array') {
    return (
      <>
        <span className="text-pm-text-t">{label}</span>
        <span className="text-pm-text-t">: </span>
      </>
    );
  }

  return (
    <>
      <span className="text-pm-orange">"{label}"</span>
      <span className="text-pm-text-t">: </span>
    </>
  );
}

function PrimitiveValue({ value }: { value: JsonPrimitive }) {
  if (typeof value === 'string') {
    return <span className="text-pm-text">"{value}"</span>;
  }

  if (value === null) {
    return <span className="text-pm-text">null</span>;
  }

  return <span className="text-pm-text">{String(value)}</span>;
}

function isContainer(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null;
}

function getCollapsedSummary(value: JsonValue[] | { [key: string]: JsonValue }) {
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }

  const keys = Object.keys(value);
  return `${keys.length} key${keys.length === 1 ? '' : 's'}`;
}

function highlightJson(value: string) {
  const tokens = tokenizeJson(value);

  return tokens.map((token, index) => (
    <span key={`${index}-${token.text}`} className={token.className}>
      {token.text}
    </span>
  ));
}

function tokenizeJson(value: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let currentIndex = 0;

  for (const match of value.matchAll(JSON_TOKEN_PATTERN)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > currentIndex) {
      tokens.push({
        text: value.slice(currentIndex, matchIndex),
        className: 'text-pm-text',
      });
    }

    const [, stringToken, keyColon] = match;
    const className = getTokenClassName(matchText, Boolean(stringToken && keyColon));
    tokens.push({ text: matchText, className });
    currentIndex = matchIndex + matchText.length;
  }

  if (currentIndex < value.length) {
    tokens.push({
      text: value.slice(currentIndex),
      className: 'text-pm-text',
    });
  }

  return tokens;
}

function getTokenClassName(token: string, isKey: boolean) {
  if (isKey) {
    return 'text-pm-orange';
  }

  if (/^[{}\[\],:]$/.test(token)) {
    return 'text-pm-text-t';
  }

  return 'text-pm-text';
}
