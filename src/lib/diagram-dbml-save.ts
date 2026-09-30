import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { erdToDBML } from '@/lib/dbml-converter';
import { loadDbmlParser } from '@/lib/load-dbml-parser';

// A failed parser load must not drop the save: the fallbacks below give the
// same results the parser gives for DBML it cannot read.

export function schemaFingerprint(nodes: Node<Entity>[], edges: Edge[]): string {
  const tableById = new Map(nodes.map(n => [n.id, n]));
  const columnName = (nodeId: string, handle?: string | null) => {
    const node = tableById.get(nodeId);
    const colId = handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
    return node?.data.columns.find(c => c.id === colId)?.name ?? '';
  };
  return JSON.stringify({
    nodes: nodes.map(n => ({
      name: n.data.name,
      columns: (n.data.columns || []).map(c => ({
        name: c.name,
        type: c.type,
        is_pk: c.is_pk,
        is_nullable: c.is_nullable,
        default_value: c.default_value,
        is_unique: c.is_unique,
        comment: c.comment,
        enum_name: c.enum_name,
        enum_values: c.enum_values,
      })).sort((a, b) => a.name.localeCompare(b.name)),
      comment: n.data.comment || '',
      constraints: (n.data.constraints || []).map(constraint => ({
        kind: constraint.kind,
        name: constraint.name || '',
        columns: (constraint.column_ids || []).map(id => n.data.columns.find(column => column.id === id)?.name || id).sort(),
        expression: constraint.expression || '',
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      indexes: (n.data.indexes || []).map(index => ({
        name: index.name,
        is_unique: Boolean(index.is_unique),
        algorithm: index.algorithm || '',
        columns: (index.column_ids || []).map(id => n.data.columns.find(column => column.id === id)?.name || id).sort(),
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    })).sort((a, b) => a.name.localeCompare(b.name)),
    edges: edges.map(e => ({
      source: tableById.get(e.source)?.data.name,
      target: tableById.get(e.target)?.data.name,
      sourceColumn: columnName(e.source, e.sourceHandle),
      targetColumn: columnName(e.target, e.targetHandle),
      on_delete: (e.data as any)?.on_delete,
      on_update: (e.data as any)?.on_update,
      constraint_name: (e.data as any)?.constraint_name,
      source_cardinality: (e.data as any)?.source_cardinality,
      target_cardinality: (e.data as any)?.target_cardinality,
    })).sort((a, b) => `${a.source}.${a.sourceColumn}>${a.target}.${a.targetColumn}`.localeCompare(`${b.source}.${b.sourceColumn}>${b.target}.${b.targetColumn}`)),
  });
}

export function readDraftSchemaFingerprint(data: any): string | null {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return parsed?.schema_fingerprint ?? null;
  } catch {
    return null;
  }
}

async function dbmlMatchesCanvas(dbml: string | null | undefined, nodes: Node<Entity>[], edges: Edge[]): Promise<boolean> {
  if (!dbml?.trim()) return true;
  const parser = await loadDbmlParser();
  if (!parser) return true;
  try {
    const parsed = parser.dbmlToERD(dbml);
    return schemaFingerprint(parsed.nodes, parsed.edges) === schemaFingerprint(nodes, edges);
  } catch {
    return true;
  }
}

export interface DiagramDbmlSaveInput {
  nodes: Node<Entity>[];
  edges: Edge[];
  isProductionDb: boolean;
  /** DBML passed explicitly by the caller; `undefined` means "derive it". */
  dbmlSource: string | null | undefined;
  /** DBML already stored for this diagram (cache, record, or ''). */
  fallbackDbmlSource: string;
  /** schema_fingerprint from the stored draft, or null for older drafts. */
  previousSchemaFingerprint: string | null;
}

export interface DiagramDbmlSaveResult {
  nextDbmlSource: string;
  persistedNodes: Node<Entity>[];
  nextSchemaFingerprint: string;
  persistedSchemaFingerprint: string;
}

/** Decide which DBML a diagram save persists, and restore DBML-only metadata onto its nodes. */
export async function resolveDiagramDbmlForSave({
  nodes,
  edges,
  isProductionDb,
  dbmlSource,
  fallbackDbmlSource,
  previousSchemaFingerprint,
}: DiagramDbmlSaveInput): Promise<DiagramDbmlSaveResult> {
  const nextSchemaFingerprint = schemaFingerprint(nodes, edges);
  const shouldRefreshDbmlFromCanvas = dbmlSource === undefined &&
    !!fallbackDbmlSource &&
    (
      previousSchemaFingerprint !== null
        ? previousSchemaFingerprint !== nextSchemaFingerprint
        : !(await dbmlMatchesCanvas(fallbackDbmlSource, nodes, edges))
    );
  const nextDbmlSource = dbmlSource ?? (
    shouldRefreshDbmlFromCanvas
      ? erdToDBML(nodes, edges)
      : fallbackDbmlSource
  );

  const shouldApplyDbmlMetadata = !isProductionDb && !!nextDbmlSource.trim() && (
    dbmlSource !== undefined ||
    shouldRefreshDbmlFromCanvas ||
    nodes.some(node => !Array.isArray(node.data.constraints) || !Array.isArray(node.data.indexes))
  );
  const parser = shouldApplyDbmlMetadata ? await loadDbmlParser() : null;
  const persistedNodes = parser
    ? parser.applyDBMLMetadata(nodes, nextDbmlSource)
    : nodes;

  return {
    nextDbmlSource,
    persistedNodes,
    nextSchemaFingerprint,
    persistedSchemaFingerprint: schemaFingerprint(persistedNodes, edges),
  };
}
