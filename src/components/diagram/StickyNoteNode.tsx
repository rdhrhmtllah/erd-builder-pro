import React, { memo, useState, useEffect } from 'react';
import { NodeProps, Handle, Position } from '@xyflow/react';
import { StickyNote, Trash2 } from 'lucide-react';
import { useEntityNodeRuntime } from '@/contexts/EntityNodeRuntimeContext';
import { cn } from '@/lib/utils';

const PASTEL_COLORS = [
  { bg: '#fef08a', border: '#fde047', text: '#713f12', label: 'Yellow' },
  { bg: '#bae6fd', border: '#7dd3fc', text: '#0369a1', label: 'Blue' },
  { bg: '#bbf7d0', border: '#86efac', text: '#15803d', label: 'Green' },
  { bg: '#fbcfe8', border: '#f472b6', text: '#9d174d', label: 'Pink' },
  { bg: '#e9d5ff', border: '#d8b4fe', text: '#6b21a8', label: 'Purple' },
  { bg: '#fed7aa', border: '#fdba74', text: '#c2410c', label: 'Orange' },
];

export const StickyNoteNode = memo(({ data, id, selected }: NodeProps) => {
  const { isReadOnly, hideHandles, deleteNode, updateNodeData } = useEntityNodeRuntime();
  const [text, setText] = useState(data.comment || '');
  const currentColor = data.color || '#fef08a';

  useEffect(() => {
    setText(data.comment || '');
  }, [data.comment]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleBlur = () => {
    if (text !== (data.comment || '')) {
      updateNodeData?.(id, { comment: text });
    }
  };

  const handleColorSelect = (color: string) => {
    if (isReadOnly) return;
    updateNodeData?.(id, { color });
  };

  const activeColor = PASTEL_COLORS.find(c => c.bg === currentColor) || {
    bg: currentColor,
    border: currentColor,
    text: '#1e293b',
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-3 min-w-[200px] max-w-[280px] shadow-lg transition-all select-none group",
        selected && "ring-2 ring-primary/60 scale-[1.01]"
      )}
      style={{
        backgroundColor: activeColor.bg,
        borderColor: activeColor.border,
        color: activeColor.text,
      }}
    >
      {/* Handles for connections */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-black/20 !border-none opacity-0 group-hover:opacity-100" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-black/20 !border-none opacity-0 group-hover:opacity-100" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-black/20 !border-none opacity-0 group-hover:opacity-100" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-black/20 !border-none opacity-0 group-hover:opacity-100" />

      {/* Header bar */}
      <div className="flex items-center justify-between gap-1 pb-2 border-b border-black/10 text-xs font-semibold">
        <div className="flex items-center gap-1.5 opacity-80">
          <StickyNote className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Note</span>
        </div>

        {/* Color picker pills */}
        {!isReadOnly && !hideHandles && (
          <div className="flex items-center gap-1 mx-auto">
            {PASTEL_COLORS.map(c => (
              <button
                key={c.bg}
                type="button"
                onClick={() => handleColorSelect(c.bg)}
                className={cn(
                  "size-3 rounded-full border border-black/20 transition-transform cursor-pointer",
                  currentColor === c.bg ? "scale-125 ring-1 ring-black/40 font-bold" : "hover:scale-110 opacity-70 hover:opacity-100"
                )}
                style={{ backgroundColor: c.bg }}
                title={c.label}
              />
            ))}
          </div>
        )}

        {/* Delete button */}
        {!isReadOnly && !hideHandles && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteNode?.(id);
            }}
            className="size-5 rounded flex items-center justify-center text-black/50 hover:text-red-600 hover:bg-black/10 transition-colors cursor-pointer"
            title="Delete note"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Note Content */}
      <div className="pt-2">
        {hideHandles || isReadOnly ? (
          <div className="text-xs whitespace-pre-wrap leading-relaxed min-h-[60px] font-sans break-words">
            {text || <span className="opacity-40 italic">Empty note</span>}
          </div>
        ) : (
          <textarea
            value={text}
            onChange={handleTextChange}
            onBlur={handleBlur}
            placeholder="Write your note or reminder here..."
            className="w-full text-xs bg-transparent border-0 resize-y outline-none leading-relaxed min-h-[70px] placeholder:text-black/40 font-sans custom-scrollbar"
            rows={3}
          />
        )}
      </div>
    </div>
  );
});

StickyNoteNode.displayName = 'StickyNoteNode';
