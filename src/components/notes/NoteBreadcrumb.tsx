import { ChevronRight } from 'lucide-react';
import type { Note } from '@/types';
import { noteAncestors } from '@/lib/note-tree';

type Crumb = { id: number | string; uid?: string | null; title?: string | null };

type Props = {
  notes: Note[];
  activeNote: Note;
  onSelect: (uid: string) => void;
};

/**
 * Shows where a sub-page sits, outermost ancestor first.
 *
 * The trail comes from the server with the note itself, because the sidebar
 * list is paginated and rarely holds the ancestors of the page being opened.
 * The loaded list is only a fallback for a note cached before that field
 * existed. A top-level page renders nothing, so an ordinary note gains no
 * chrome.
 */
export function NoteBreadcrumb({ notes, activeNote, onSelect }: Props) {
  const trail: Crumb[] = activeNote.ancestors ?? noteAncestors(notes, activeNote.id);
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Page location" className="flex items-center gap-1 px-4 pt-2 text-xs text-muted-foreground">
      {trail.map(ancestor => {
        const uid = ancestor.uid ?? String(ancestor.id);
        return (
          <span key={uid} className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(uid)}
              className="max-w-[180px] truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
            >
              {ancestor.title || 'Untitled'}
            </button>
            <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden="true" />
          </span>
        );
      })}
      <span className="max-w-[220px] truncate px-1 font-medium text-foreground">
        {activeNote.title || 'Untitled'}
      </span>
    </nav>
  );
}
