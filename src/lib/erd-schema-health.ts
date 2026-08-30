import type { Edge, Node } from '@xyflow/react';
import type { Column, Entity } from '@/types';
import { inferRelationshipSemantics } from '@/lib/relationship-semantics';

export type SchemaHealthSeverity = 'error' | 'warning' | 'info';

export type SchemaHealthIssue = {
  id: string;
  rule: string;
  severity: SchemaHealthSeverity;
  title: string;
  description: string;
  recommendation: string;
  nodeIds: string[];
  edgeIds: string[];
};

export type SchemaHealthReport = {
  score: number;
  issues: SchemaHealthIssue[];
  counts: Record<SchemaHealthSeverity, number>;
  checkedTables: number;
  checkedRelationships: number;
};

const severityWeight: Record<SchemaHealthSeverity, number> = { error: 15, warning: 5, info: 1 };

function columnIdFromHandle(handle?: string | null) {
  return handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') || null;
}

function key(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function canonicalType(type: string) {
  const base = type.trim().toUpperCase().replace(/\s+/g, ' ').replace(/\(.*/, '');
  const aliases: Record<string, string> = {
    INT: 'INTEGER', INT4: 'INTEGER', SERIAL: 'INTEGER',
    INT8: 'BIGINT', BIGSERIAL: 'BIGINT',
    BOOL: 'BOOLEAN',
    'CHARACTER VARYING': 'VARCHAR',
    'DOUBLE PRECISION': 'DOUBLE', FLOAT8: 'DOUBLE',
    DEC: 'DECIMAL', NUMERIC: 'DECIMAL',
    TIMESTAMPTZ: 'TIMESTAMP WITH TIME ZONE',
  };
  return aliases[base] || base;
}

function indexStartsWithColumn(entity: Entity, column: Column) {
  if (column.is_pk || column.is_unique) return true;
  const firstColumnMatches = (columnIds?: string[]) => key(columnIds?.[0]) === key(column.id);
  return (entity.indexes || []).some(index => firstColumnMatches(index.column_ids))
    || (entity.constraints || []).some(constraint =>
      (constraint.kind === 'primary_key' || constraint.kind === 'unique') && firstColumnMatches(constraint.column_ids));
}

function issue(value: SchemaHealthIssue): SchemaHealthIssue {
  return value;
}

export function analyzeErdSchemaHealth(nodes: Node<Entity>[], edges: Edge[]): SchemaHealthReport {
  const issues: SchemaHealthIssue[] = [];
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const connectedNodeIds = new Set<string>();

  const tablesByName = new Map<string, Node<Entity>[]>();
  for (const node of nodes) {
    const tableName = key(node.data.name);
    tablesByName.set(tableName, [...(tablesByName.get(tableName) || []), node]);

    if (!node.data.columns.some(column => column.is_pk)
      && !(node.data.constraints || []).some(constraint => constraint.kind === 'primary_key')) {
      issues.push(issue({
        id: `missing-pk:${node.id}`, rule: 'missing-primary-key', severity: 'error',
        title: `${node.data.name} has no primary key`,
        description: 'Rows cannot be addressed reliably and relationship targets may be ambiguous.',
        recommendation: 'Add a primary key column or a composite primary-key constraint.',
        nodeIds: [node.id], edgeIds: [],
      }));
    }
    if (node.data.columns.length === 0) {
      issues.push(issue({
        id: `empty-table:${node.id}`, rule: 'empty-table', severity: 'warning',
        title: `${node.data.name} has no columns`,
        description: 'The table cannot store data in its current form.',
        recommendation: 'Add columns or remove the placeholder table.',
        nodeIds: [node.id], edgeIds: [],
      }));
    }

    const columnsByName = new Map<string, Column[]>();
    for (const column of node.data.columns) {
      const name = key(column.name);
      columnsByName.set(name, [...(columnsByName.get(name) || []), column]);
      if (column.is_pk && column.is_nullable) {
        issues.push(issue({
          id: `nullable-pk:${node.id}:${column.id}`, rule: 'nullable-primary-key', severity: 'error',
          title: `${node.data.name}.${column.name} is a nullable primary key`,
          description: 'Primary-key columns must not accept NULL values.',
          recommendation: 'Mark this column as NOT NULL.',
          nodeIds: [node.id], edgeIds: [],
        }));
      }
      if (!/^[a-z][a-z0-9_]*$/.test(column.name)) {
        issues.push(issue({
          id: `column-name:${node.id}:${column.id}`, rule: 'identifier-naming', severity: 'info',
          title: `${node.data.name}.${column.name} uses a mixed naming style`,
          description: 'This identifier differs from lowercase snake_case, making generated queries less consistent.',
          recommendation: 'Use lowercase snake_case unless the project intentionally follows another convention.',
          nodeIds: [node.id], edgeIds: [],
        }));
      }
    }
    for (const [columnName, duplicates] of columnsByName) {
      if (columnName && duplicates.length > 1) {
        issues.push(issue({
          id: `duplicate-column:${node.id}:${columnName}`, rule: 'duplicate-column-name', severity: 'error',
          title: `${node.data.name} repeats column “${duplicates[0].name}”`,
          description: 'Column names must be unique within a table, ignoring letter case.',
          recommendation: 'Rename or remove the duplicate column.',
          nodeIds: [node.id], edgeIds: [],
        }));
      }
    }
    if (!/^[a-z][a-z0-9_]*$/.test(node.data.name)) {
      issues.push(issue({
        id: `table-name:${node.id}`, rule: 'identifier-naming', severity: 'info',
        title: `${node.data.name} uses a mixed naming style`,
        description: 'This table name differs from lowercase snake_case.',
        recommendation: 'Use one naming convention consistently across the schema.',
        nodeIds: [node.id], edgeIds: [],
      }));
    }
  }

  for (const [tableName, duplicates] of tablesByName) {
    if (tableName && duplicates.length > 1) {
      issues.push(issue({
        id: `duplicate-table:${tableName}`, rule: 'duplicate-table-name', severity: 'error',
        title: `Duplicate table name “${duplicates[0].data.name}”`,
        description: 'Table names collide when compared without letter case.',
        recommendation: 'Rename one of these tables before generating migrations.',
        nodeIds: duplicates.map(node => node.id), edgeIds: [],
      }));
    }
  }

  const relationKeys = new Map<string, Edge[]>();
  for (const edge of edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const sourceColumnId = columnIdFromHandle(edge.sourceHandle);
    const targetColumnId = columnIdFromHandle(edge.targetHandle);
    const sourceColumn = sourceNode?.data.columns.find(column => key(column.id) === key(sourceColumnId));
    const targetColumn = targetNode?.data.columns.find(column => key(column.id) === key(targetColumnId));

    if (sourceNode) connectedNodeIds.add(sourceNode.id);
    if (targetNode) connectedNodeIds.add(targetNode.id);

    if (!sourceNode || !targetNode || !sourceColumn || !targetColumn) {
      issues.push(issue({
        id: `broken-relation:${edge.id}`, rule: 'broken-relationship', severity: 'error',
        title: 'Relationship points to a missing table or column',
        description: `Relationship ${edge.label || edge.id} cannot resolve both endpoints.`,
        recommendation: 'Reconnect the relationship to existing columns or remove it.',
        nodeIds: [edge.source, edge.target].filter(id => nodesById.has(id)), edgeIds: [edge.id],
      }));
      continue;
    }

    const relationKey = `${sourceNode.id}:${key(sourceColumn.id)}>${targetNode.id}:${key(targetColumn.id)}`;
    relationKeys.set(relationKey, [...(relationKeys.get(relationKey) || []), edge]);

    if (canonicalType(sourceColumn.type) !== canonicalType(targetColumn.type)) {
      issues.push(issue({
        id: `type-mismatch:${edge.id}`, rule: 'relationship-type-mismatch', severity: 'error',
        title: `${sourceNode.data.name}.${sourceColumn.name} type does not match its target`,
        description: `${sourceColumn.type} references ${targetNode.data.name}.${targetColumn.name} (${targetColumn.type}).`,
        recommendation: 'Use compatible data types on both relationship columns.',
        nodeIds: [sourceNode.id, targetNode.id], edgeIds: [edge.id],
      }));
    }
    if (!targetColumn.is_pk && !targetColumn.is_unique
      && !(targetNode.data.constraints || []).some(constraint =>
        (constraint.kind === 'primary_key' || constraint.kind === 'unique')
        && constraint.column_ids?.some(id => key(id) === key(targetColumn.id)))) {
      issues.push(issue({
        id: `non-key-target:${edge.id}`, rule: 'non-key-relationship-target', severity: 'warning',
        title: `${targetNode.data.name}.${targetColumn.name} is not a key`,
        description: 'The relationship references a column that is neither primary nor unique.',
        recommendation: 'Reference a primary/unique key or add an appropriate unique constraint.',
        nodeIds: [sourceNode.id, targetNode.id], edgeIds: [edge.id],
      }));
    }
    if (!indexStartsWithColumn(sourceNode.data, sourceColumn)) {
      issues.push(issue({
        id: `unindexed-fk:${edge.id}`, rule: 'unindexed-foreign-key', severity: 'warning',
        title: `${sourceNode.data.name}.${sourceColumn.name} is not indexed`,
        description: 'Joins and parent-row updates may scan the referencing table.',
        recommendation: 'Add an index whose first column is this foreign key.',
        nodeIds: [sourceNode.id], edgeIds: [edge.id],
      }));
    }
    const targetIsKey = targetColumn.is_pk || targetColumn.is_unique
      || (targetNode.data.constraints || []).some(constraint =>
        (constraint.kind === 'primary_key' || constraint.kind === 'unique')
        && constraint.column_ids?.some(id => key(id) === key(targetColumn.id)));
    if (!sourceColumn.is_pk && targetIsKey) {
      const semantics = inferRelationshipSemantics(edge, Boolean(sourceColumn.is_nullable));
      const targetIsOptional = semantics.target.startsWith('zero-or-');
      if (targetIsOptional !== Boolean(sourceColumn.is_nullable)) {
        issues.push(issue({
          id: `optionality-mismatch:${edge.id}`, rule: 'relationship-optionality-mismatch', severity: 'warning',
          title: `${sourceNode.data.name}.${sourceColumn.name} optionality conflicts with the relationship`,
          description: sourceColumn.is_nullable
            ? `The foreign key accepts NULL, but the target endpoint is ${semantics.targetSymbol}.`
            : `The foreign key is required, but the target endpoint is ${semantics.targetSymbol}.`,
          recommendation: sourceColumn.is_nullable
            ? 'Use 0..1 at the target endpoint or make the foreign key NOT NULL.'
            : 'Use exactly 1 at the target endpoint or make the foreign key nullable.',
          nodeIds: [sourceNode.id, targetNode.id], edgeIds: [edge.id],
        }));
      }
    }
  }

  for (const [relationKey, duplicates] of relationKeys) {
    if (duplicates.length > 1) {
      issues.push(issue({
        id: `duplicate-relation:${relationKey}`, rule: 'duplicate-relationship', severity: 'warning',
        title: 'Duplicate relationship',
        description: `${duplicates.length} relationships connect the same pair of columns.`,
        recommendation: 'Keep one relationship and remove the duplicates.',
        nodeIds: [...new Set(duplicates.flatMap(edge => [edge.source, edge.target]))],
        edgeIds: duplicates.map(edge => edge.id),
      }));
    }
  }

  if (nodes.length > 1) {
    for (const node of nodes) {
      if (!connectedNodeIds.has(node.id)) {
        issues.push(issue({
          id: `isolated-table:${node.id}`, rule: 'isolated-table', severity: 'info',
          title: `${node.data.name} is isolated`,
          description: 'This table has no relationships to the rest of the schema.',
          recommendation: 'Confirm that the table is intentionally standalone or add its missing relationships.',
          nodeIds: [node.id], edgeIds: [],
        }));
      }
    }
  }

  const order: Record<SchemaHealthSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title));
  const counts = issues.reduce<Record<SchemaHealthSeverity, number>>((result, item) => {
    result[item.severity] += 1;
    return result;
  }, { error: 0, warning: 0, info: 0 });
  const score = Math.max(0, 100 - issues.reduce((total, item) => total + severityWeight[item.severity], 0));
  return { score, issues, counts, checkedTables: nodes.length, checkedRelationships: edges.length };
}
