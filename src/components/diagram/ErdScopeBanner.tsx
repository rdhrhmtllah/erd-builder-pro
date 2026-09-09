import { EyeOff, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hiddenTablesSummary, type ErdViewScope } from '@/lib/erd-view-scope';

interface ErdScopeBannerProps {
  scope: ErdViewScope;
  onShowAll: () => void;
}

/**
 * Says why the canvas is not showing everything, and offers the way back.
 *
 * Leaving a Subject Area running and then hunting for a table that is merely
 * hidden is the failure this prevents, so it names the view rather than only
 * offering a button.
 */
export function ErdScopeBanner({ scope, onShowAll }: ErdScopeBannerProps) {
  if (!scope.isScoped) return null;
  const summary = hiddenTablesSummary(scope);

  return (
    <div className="nodrag nopan flex items-center gap-2 rounded-full border border-amber-500/40 bg-background/95 py-1 pr-1 pl-3 shadow-md backdrop-blur">
      <EyeOff className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="max-w-[220px] truncate text-xs font-semibold">{scope.label}</span>
      {summary && (
        <span className="hidden text-[11px] text-muted-foreground sm:inline">{summary}</span>
      )}
      <Button size="sm" variant="secondary" className="h-6 cursor-pointer gap-1 rounded-full px-2 text-[11px]" onClick={onShowAll}>
        <Undo2 className="h-3 w-3" />
        Show all tables
      </Button>
    </div>
  );
}
