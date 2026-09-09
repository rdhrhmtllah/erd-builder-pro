import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/**
 * Lines holding a `<DropdownMenuLabel` that no open `<DropdownMenuGroup` encloses.
 *
 * Depth counting is enough here: these are hand-written, well-indented JSX trees,
 * and the tag is never built dynamically.
 */
function ungroupedLabels(source: string): number[] {
  let depth = 0;
  const offenders: number[] = [];

  source.split('\n').forEach((line, index) => {
    if (line.includes('<DropdownMenuLabel') && depth === 0) offenders.push(index + 1);
    depth += (line.match(/<DropdownMenuGroup[\s>]/g) || []).length;
    depth -= (line.match(/<\/DropdownMenuGroup>/g) || []).length;
  });

  return offenders;
}

describe('DropdownMenuLabel placement', () => {
  /**
   * Base UI's GroupLabel reads a context that only Menu.Group provides and throws
   * outright when it is missing — error #31, which unmounts the whole React tree
   * and leaves a black screen. There is no DOM test environment in this project to
   * catch that by rendering, so the contract is checked against the source.
   */
  it('is always inside a DropdownMenuGroup', () => {
    const offenders = tsxFiles(SRC)
      .filter(path => !path.endsWith(join('ui', 'dropdown-menu.tsx')))
      .flatMap(path => ungroupedLabels(readFileSync(path, 'utf8')).map(line => `${path.slice(SRC.length + 1)}:${line}`));

    expect(offenders).toEqual([]);
  });

  it('spots a label that is outside every group', () => {
    // Guards the guard: the check above is only worth having if it can fail.
    expect(ungroupedLabels('<DropdownMenuSubContent>\n  <DropdownMenuLabel>Hi</DropdownMenuLabel>\n</DropdownMenuSubContent>'))
      .toEqual([2]);
  });

  it('accepts a label wrapped in a group', () => {
    expect(ungroupedLabels('<DropdownMenuGroup>\n  <DropdownMenuLabel>Hi</DropdownMenuLabel>\n</DropdownMenuGroup>'))
      .toEqual([]);
  });
});
