import React from 'react';
import { Layers3 } from 'lucide-react';

type Props = { data: { name?: string; color?: string; description?: string; tableCount?: number } };

/** Visual-only React Flow node used as a background frame for a perspective section. */
export const PerspectiveSectionNode = React.memo(function PerspectiveSectionNode({ data }: Props) {
  const color = data.color || '#6366f1';
  return (
    <div
      className="h-full w-full rounded-2xl border-2 border-dashed bg-background/25 p-3 shadow-sm backdrop-blur-[1px]"
      style={{ borderColor: `${color}b3`, boxShadow: `inset 0 0 0 9999px ${color}12` }}
    >
      <div className="flex items-center gap-2 text-xs font-bold" style={{ color }}>
        <Layers3 className="h-3.5 w-3.5" />
        <span className="truncate">{data.name || 'Section'}</span>
        <span className="ml-auto rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">{data.tableCount || 0}</span>
      </div>
      {data.description && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{data.description}</p>}
    </div>
  );
});
