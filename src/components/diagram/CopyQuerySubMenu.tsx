import React from 'react';
import { toast } from 'sonner';
import { ClipboardCopy, Columns3, FileCode2, Table2 } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { CopyKind, PlaceholderStyle, QueryOptions, QueryVerb, SqlDialect } from '@/lib/erd-query-builder';
import { getQueryPrefs, setQueryPrefs, subscribeQueryPrefs } from '@/lib/erd-query-prefs';

const VERBS: { kind: QueryVerb; label: string }[] = [
  { kind: 'select', label: 'SELECT' },
  { kind: 'insert', label: 'INSERT' },
  { kind: 'update', label: 'UPDATE' },
  { kind: 'delete', label: 'DELETE' },
];

const DIALECTS: SqlDialect[] = ['mysql', 'postgresql', 'sqlserver'];
const DIALECT_LABELS: Record<SqlDialect, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlserver: 'SQL Server',
};

const STYLES: PlaceholderStyle[] = ['named', 'positional', 'literal'];
const STYLE_LABELS: Record<PlaceholderStyle, string> = {
  named: 'Named — :column',
  positional: 'Positional — ?',
  literal: 'Sample values',
};

/** The dialect and placeholder style, shared by every menu that copies a query. */
export function useQueryPrefs(): QueryOptions {
  return React.useSyncExternalStore(subscribeQueryPrefs, getQueryPrefs, getQueryPrefs);
}

/**
 * Put text on the clipboard and say what happened.
 *
 * The clipboard API rejects on an insecure origin or when the browser withholds
 * permission, and a copy that silently does nothing is worse than one that says
 * it failed.
 */
export async function copyToClipboard(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy — the browser blocked clipboard access');
  }
}

interface CopyQuerySubMenuProps {
  label: string;
  /** Called with the kind of copy wanted and the options in force right now. */
  onCopy: (kind: CopyKind, options: QueryOptions) => void;
  disabled?: boolean;
}

export function CopyQuerySubMenu({ label, onCopy, disabled }: CopyQuerySubMenuProps) {
  const prefs = useQueryPrefs();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled} className="cursor-pointer gap-2 px-2 py-1.5">
        <ClipboardCopy className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </DropdownMenuSubTrigger>

      <DropdownMenuSubContent className="w-52">
        {VERBS.map(verb => (
          <DropdownMenuItem
            key={verb.kind}
            onClick={() => onCopy(verb.kind, prefs)}
            className="cursor-pointer font-mono text-xs"
          >
            {verb.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onCopy('columns', prefs)} className="cursor-pointer gap-2">
          <Columns3 className="w-4 h-4 text-muted-foreground" />
          Column list
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCopy('ddl', prefs)} className="cursor-pointer gap-2">
          <Table2 className="w-4 h-4 text-muted-foreground" />
          CREATE TABLE
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer gap-2 px-2 py-1.5">
            <FileCode2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Dialect</span>
            <span className="ml-auto pl-3 text-[10px] text-muted-foreground">{DIALECT_LABELS[prefs.dialect]}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup
              value={prefs.dialect}
              onValueChange={(value: any) => setQueryPrefs({ ...prefs, dialect: value })}
            >
              {DIALECTS.map(dialect => (
                // Keep the menu open: picking a dialect is a setting, not the action.
                <DropdownMenuRadioItem key={dialect} value={dialect} closeOnClick={false} className="cursor-pointer">
                  {DIALECT_LABELS[dialect]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer gap-2 px-2 py-1.5">
            <span className="w-4 text-center font-mono text-xs text-muted-foreground">:</span>
            <span className="text-sm">Placeholder</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Used by INSERT, UPDATE, DELETE</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={prefs.placeholders}
              onValueChange={(value: any) => setQueryPrefs({ ...prefs, placeholders: value })}
            >
              {STYLES.map(style => (
                <DropdownMenuRadioItem key={style} value={style} closeOnClick={false} className="cursor-pointer">
                  {STYLE_LABELS[style]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
