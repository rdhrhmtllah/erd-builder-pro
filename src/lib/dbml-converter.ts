// String-only DBML helpers. Keep @dbml/core out of this module: it is imported
// on the boot path, and the parser lives in dbml-parser.ts.
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { normalizeColumnDefault, supportsColumnLength, supportsNumericPrecision } from '@/lib/column-metadata';
import { inferRelationshipSemantics } from '@/lib/relationship-semantics';
import { governanceFrom } from '../../shared/erd-governance';
import { recommendedDBMLEnumName } from '@/lib/dbml-utils';


export function removeEmptyDBMLIndexes(text: string): string {
  const lines = text.split(/\r?\n/);
  const normalized: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*Indexes\s*\{\s*$/.test(lines[index])) {
      let closingIndex = index + 1;
      while (closingIndex < lines.length && !lines[closingIndex].trim()) closingIndex += 1;
      if (lines[closingIndex]?.trim() === '}') {
        index = closingIndex;
        continue;
      }
    }
    normalized.push(lines[index]);
  }
  return normalized.join('\n');
}

export function normalizeDBMLIndexSyntax(text: string): string {
  const lines = text.split(/\r?\n/);
  const normalized: string[] = [];
  let inIndexes = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Indexes\s*\{\s*$/i.test(trimmed)) {
      inIndexes = true;
      normalized.push(line);
      continue;
    }
    if (inIndexes && trimmed === '}') {
      inIndexes = false;
      normalized.push(line);
      continue;
    }
    if (inIndexes) {
      const singleColumn = line.match(/^(\s*)(?:"([^"]+)"|([A-Za-z_]\w*))(?=\s+\[)/);
      if (singleColumn) {
        const columnName = singleColumn[2] ? `"${singleColumn[2]}"` : singleColumn[3];
        normalized.push(`${singleColumn[1]}(${columnName})${line.slice(singleColumn[0].length)}`);
        continue;
      }
    }
    normalized.push(line);
  }
  return normalized.join('\n');
}

const edgeColumnId = (handle?: string | null) => handle?.replace(/^col-/, '').replace(/-(source|target)(-[lr])?$/, '') || '';

/** Find the existing canvas relation for a DBML relation after node/column ID remapping. */
export function findMatchingCanvasEdge(edges: Edge[], source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null): Edge | undefined {
  const sourceColumnId = edgeColumnId(sourceHandle);
  const targetColumnId = edgeColumnId(targetHandle);
  return edges.find(edge => edge.source === source && edge.target === target
    && edgeColumnId(edge.sourceHandle) === sourceColumnId
    && edgeColumnId(edge.targetHandle) === targetColumnId);
}

/**
 * Generate DBML text from ERD nodes + edges.
 */
export function erdToDBML(nodes: Node<Entity>[], edges: Edge[]): string {
  const lines: string[] = [];

  // Collect enum columns. Explicit enum_name comes from DBML parsing and must
  // win over column-name guessing.
  const enumColumns: { nodeId: string; colId: string; tableName: string; colName: string; values: string; enumName?: string }[] = [];

  for (const node of nodes) {
    for (const col of node.data.columns) {
      if (col.type.toUpperCase() === 'ENUM' && col.enum_values) {
        enumColumns.push({
          nodeId: node.id,
          colId: col.id,
          tableName: node.data.name,
          colName: col.name,
          values: col.enum_values,
          enumName: col.enum_name,
        });
      }
    }
  }

  // Build colEnumName map for use in Table blocks (must run before Table emit)
  const usedEnumNames = new Map<string, string>();
  const enumMap = new Map<string, { name: string; values: string }>();
  const colEnumName = new Map<string, string>(); // `${nodeId}:${colId}` → enum name

  for (const ec of enumColumns) {
    const norm = normalizeEnumValues(ec.values);
    // Use explicit enum_name if set by user, otherwise default to {tableName}_{colName}
    // getAvailableEnumName handles conflicts (same name, different values) by adding suffix
    const baseName = ec.enumName || recommendedDBMLEnumName(ec.tableName, ec.colName);
    const name = getAvailableEnumName(baseName, norm, usedEnumNames);
    const mapKey = `${name}:${norm}`;
    if (!enumMap.has(mapKey)) {
      enumMap.set(mapKey, { name, values: ec.values });
    }
    colEnumName.set(`${ec.nodeId}:${ec.colId}`, name);
  }

  for (const node of nodes) {
    const tableName = needsQuote(node.data.name) ? `"${node.data.name}"` : node.data.name;
    lines.push(`Table ${tableName} {`);
    const tableGovernance = governanceFrom(node.data);
    if (Object.keys(tableGovernance).length) lines.push(`  // erd-governance-table: ${encodeURIComponent(JSON.stringify(tableGovernance))}`);
    for (const col of node.data.columns) {
      const settings: string[] = [];
      if (col.is_pk) settings.push('pk');
      if (col.is_nullable === false) settings.push('not null');
      if (col.is_unique) settings.push('unique');
      const defaultValue = normalizeColumnDefault(col.default_value, Boolean(col.is_nullable));
      if (defaultValue) settings.push(`default: ${defaultValue}`);
      if (col.comment) settings.push(`note: '${col.comment.replace(/'/g, "\\'")}'`);
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      const colName = needsQuote(col.name) ? `"${col.name}"` : col.name;
      // Use enum name instead of raw ENUM type
      const enumName = colEnumName.get(`${node.id}:${col.id}`);
      const colType = enumName ? formatIdentifier(enumName) : formatTypeWithModifiers(col.type, col.max_length, col.numeric_precision, col.numeric_scale);
      lines.push(`  ${colName} ${colType}${suffix}`);
      const columnGovernance = governanceFrom(col);
      if (Object.keys(columnGovernance).length) lines.push(`  // erd-governance-column: name=${encodeURIComponent(col.name)} data=${encodeURIComponent(JSON.stringify(columnGovernance))}`);
    }
    const constraints = node.data.constraints || [];
    const indexes = node.data.indexes || [];
    const checkConstraints = constraints.filter((constraint: any) => constraint.kind === 'check');
    const keyConstraints = constraints.filter((constraint: any) => constraint.kind === 'primary_key' || constraint.kind === 'unique');
    if (checkConstraints.length > 0) {
      lines.push('  Checks {');
      for (const constraint of checkConstraints) {
        const expression = String(constraint.expression || '').replace(/`/g, '\\`');
        const name = constraint.name ? ` [name: '${String(constraint.name).replace(/'/g, "\\'")}']` : '';
        lines.push(`    \`${expression}\`${name}`);
      }
      lines.push('  }');
    }
    const renderableKeyConstraints = keyConstraints.filter((constraint: any) => {
      const columns = (constraint.column_ids || []).map((id: string) => node.data.columns.find(column => column.id === id)?.name).filter(Boolean);
      if (columns.length === 0) return false;
      const column = columns.length === 1 ? node.data.columns.find(item => item.name === columns[0]) : null;
      return !column || !((constraint.kind === 'primary_key' && column.is_pk) || (constraint.kind === 'unique' && column.is_unique));
    });
    const renderableIndexes = indexes.filter((index: any) => {
      const columns = (index.column_ids || []).map((id: string) => node.data.columns.find(column => column.id === id)?.name).filter(Boolean);
      if (columns.length === 0) return false;
      const column = columns.length === 1 ? node.data.columns.find(item => item.name === columns[0]) : null;
      return !(column && index.is_unique && column.is_unique && String(index.name).startsWith('unique:'));
    });
    if (renderableKeyConstraints.length > 0 || renderableIndexes.length > 0) {
      lines.push('  Indexes {');
      for (const constraint of renderableKeyConstraints) {
        const columns = (constraint.column_ids || []).map((id: string) => node.data.columns.find(column => column.id === id)?.name).filter(Boolean);
        const key = `(${columns.join(', ')})`;
        const settings = [constraint.kind === 'primary_key' ? 'pk' : 'unique', constraint.name ? `name: \"${String(constraint.name).replace(/\"/g, '\\\"')}\"` : ''].filter(Boolean);
        lines.push(`    ${key} [${settings.join(', ')}]`);
      }
      for (const index of renderableIndexes) {
        const columns = (index.column_ids || []).map((id: string) => node.data.columns.find(column => column.id === id)?.name).filter(Boolean);
        const key = `(${columns.join(', ')})`;
        const settings = [index.is_unique ? 'unique' : '', index.algorithm ? `type: ${index.algorithm}` : '', `name: \"${String(index.name).replace(/\"/g, '\\\"')}\"`].filter(Boolean);
        lines.push(`    ${key} [${settings.join(', ')}]`);
      }
      lines.push('  }');
    }
    if (node.data.comment) lines.push(`  Note: '${String(node.data.comment).replace(/'/g, "\\'")}'`);
    lines.push('}');
    lines.push('');
  }

  // Emit Enum blocks between Table and Ref sections
  const emitted = new Set<string>();
  for (const [, { name, values }] of enumMap) {
    if (emitted.has(name)) continue;
    emitted.add(name);
    const enumName = needsQuote(name) ? `"${name}"` : name;
    lines.push(`Enum ${enumName} {`);
    for (const v of values.split(',')) {
      lines.push(`  ${v.trim()}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const edge of edges) {
    const srcNode = nodes.find(n => n.id === edge.source);
    const tgtNode = nodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcCol = srcNode.data.columns.find(c =>
      edge.sourceHandle?.includes(c.id),
    );
    const tgtCol = tgtNode.data.columns.find(c =>
      edge.targetHandle?.includes(c.id),
    );
    if (!srcCol || !tgtCol) continue;

    const relation = edge.data as any;
    const semantics = inferRelationshipSemantics(edge, Boolean(srcCol.is_nullable));
    const refName = relation?.constraint_name ? ` "${String(relation.constraint_name).replace(/"/g, '\\"')}"` : '';
    const actions = [
      relation?.on_update ? `update: ${String(relation.on_update).toLowerCase()}` : '',
      relation?.on_delete ? `delete: ${String(relation.on_delete).toLowerCase()}` : '',
    ].filter(Boolean);
    const operator = semantics.type === 'one-to-one'
      ? '-'
      : semantics.source.endsWith('many') ? '>' : '<';
    lines.push(`Ref${refName}: ${tableNear(srcNode.data.name, srcCol.name)} ${operator} ${tableNear(tgtNode.data.name, tgtCol.name)}${actions.length ? ` [${actions.join(', ')}]` : ''} // erd-cardinality: source=${semantics.source} target=${semantics.target}`);
  }

  return lines.join('\n');
}

/** Quote only if name contains non-identifier chars */
function needsQuote(name: string): boolean {
  return !/^[a-zA-Z_]\w*$/.test(name);
}

function formatIdentifier(name: string): string {
  return needsQuote(name) ? `"${name}"` : name;
}

function formatTypeWithModifiers(type: string, maxLength?: number | null, precision?: number | null, scale?: number | null): string {
  if (precision && supportsNumericPrecision(type)) return `${type}(${precision}${scale !== null && scale !== undefined ? `,${scale}` : ''})`;
  return maxLength && supportsColumnLength(type) ? `${type}(${maxLength})` : type;
}

/** Format as table.col, quoting each part only if needed */
function tableNear(table: string, col: string): string {
  return `${formatIdentifier(table)}.${formatIdentifier(col)}`;
}

function normalizeEnumValues(values: string): string {
  return values
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
}

function getAvailableEnumName(baseName: string, valueKey: string, usedNames: Map<string, string>): string {
  const cleanBase = baseName.trim() || 'enum_value';
  const lowerBase = cleanBase.toLowerCase();
  const existingValueKey = usedNames.get(lowerBase);
  if (!existingValueKey || existingValueKey === valueKey) {
    usedNames.set(lowerBase, valueKey);
    return cleanBase;
  }

  let i = 2;
  while (true) {
    const candidate = `${cleanBase}_${i}`;
    const lowerCandidate = candidate.toLowerCase();
    const candidateValueKey = usedNames.get(lowerCandidate);
    if (!candidateValueKey || candidateValueKey === valueKey) {
      usedNames.set(lowerCandidate, valueKey);
      return candidate;
    }
    i += 1;
  }
}
