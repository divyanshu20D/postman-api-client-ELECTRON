import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick(): void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose(): void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[999] min-w-[180px] py-1 bg-pm-bg-t border border-pm-border rounded-md shadow-lg shadow-black/40"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-left transition-colors duration-100 ${
            item.danger
              ? 'text-st-error hover:bg-st-error/10'
              : 'text-pm-text hover:bg-pm-hover'
          }`}
          onClick={() => { item.onClick(); onClose(); }}
          type="button"
        >
          {item.icon && <span className="w-4 h-4 flex items-center justify-center text-pm-text-t">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
