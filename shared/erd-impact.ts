export const ERD_IMPACT_OPERATIONS = [
  'table-delete',
  'table-rename',
  'column-delete',
  'column-rename',
  'column-type-change',
  'column-nullability-change',
] as const;

export type ErdImpactOperation = (typeof ERD_IMPACT_OPERATIONS)[number];
export type ErdImpactRisk = 'low' | 'medium' | 'high' | 'critical';

export type ErdImpactColumn = {
  id: string;
  name: string;
  type?: string;
  is_pk?: boolean;
  isPk?: boolean;
  is_unique?: boolean;
  isUnique?: boolean;
  is_nullable?: boolean;
  isNullable?: boolean;
};

export type ErdImpactTable = {
  id: string;
  name: string;
  columns?: ErdImpactColumn[];
};

export type ErdImpactRelationship = {
  id: string;
  source_entity_id?: string;
  sourceEntityId?: string;
  target_entity_id?: string;
  targetEntityId?: string;
  source_column_id?: string | null;
  sourceColumnId?: string | null;
  target_column_id?: string | null;
  targetColumnId?: string | null;
  constraint_name?: string | null;
  constraintName?: string | null;
};

export type ErdImpactRequest = {
  operation: ErdImpactOperation;
  table_id: string;
  column_id?: string;
};

export type ErdImpactedTable = {
  id: string;
  name: string;
  depth: number;
  direction: 'dependent' | 'referenced';
  path_table_ids: string[];
  path_table_names: string[];
  relationship_ids: string[];
  reasons: string[];
};

export type ErdImpactReport = {
  operation: ErdImpactOperation;
  root: { table_id: string; table_name: string; column_id?: string; column_name?: string };
  risk: ErdImpactRisk;
  risk_score: number;
  summary: string;
  direct_tables: ErdImpactedTable[];
  transitive_tables: ErdImpactedTable[];
  affected_relationship_ids: string[];
  affected_table_ids: string[];
  affected_columns: Array<{ table_id: string; table_name: string; column_id: string; column_name: string }>;
  recommendations: string[];
  assumptions: string[];
};

const text = (value: unknown) => String(value ?? '');
const sourceTableId = (relationship: ErdImpactRelationship) => text(relationship.source_entity_id ?? relationship.sourceEntityId);
const targetTableId = (relationship: ErdImpactRelationship) => text(relationship.target_entity_id ?? relationship.targetEntityId);
const sourceColumnId = (relationship: ErdImpactRelationship) => text(relationship.source_column_id ?? relationship.sourceColumnId);
const targetColumnId = (relationship: ErdImpactRelationship) => text(relationship.target_column_id ?? relationship.targetColumnId);

function riskFromScore(score: number): ErdImpactRisk {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

const baseRisk: Record<ErdImpactOperation, number> = {
  'table-delete': 78,
  'table-rename': 34,
  'column-delete': 58,
  'column-rename': 36,
  'column-type-change': 52,
  'column-nullability-change': 42,
};

function operationLabel(operation: ErdImpactOperation) {
  return operation.replace(/-/g, ' ');
}

export function analyzeErdImpact(
  tables: ErdImpactTable[],
  relationships: ErdImpactRelationship[],
  request: ErdImpactRequest,
): ErdImpactReport {
  if (!ERD_IMPACT_OPERATIONS.includes(request.operation)) throw new Error('Unsupported ERD impact operation');
  const table = tables.find(item => text(item.id) === text(request.table_id));
  if (!table) throw new Error(`Table not found: ${request.table_id}`);
  const requiresColumn = request.operation.startsWith('column-');
  const column = requiresColumn
    ? (table.columns || []).find(item => text(item.id) === text(request.column_id))
    : undefined;
  if (requiresColumn && !column) throw new Error(`Column not found in ${table.name}: ${request.column_id || '(missing)'}`);

  const tablesById = new Map(tables.map(item => [text(item.id), item]));
  const relationshipsById = new Map(relationships.map(item => [text(item.id), item]));
  const relationshipsByTarget = new Map<string, ErdImpactRelationship[]>();
  for (const relationship of relationships) {
    const targetId = targetTableId(relationship);
    relationshipsByTarget.set(targetId, [...(relationshipsByTarget.get(targetId) || []), relationship]);
  }
  const relevantRootRelationships = relationships.filter(relationship => {
    if (!requiresColumn) return sourceTableId(relationship) === text(table.id) || targetTableId(relationship) === text(table.id);
    return (sourceTableId(relationship) === text(table.id) && sourceColumnId(relationship) === text(column?.id))
      || (targetTableId(relationship) === text(table.id) && targetColumnId(relationship) === text(column?.id));
  });

  const impacted = new Map<string, ErdImpactedTable>();
  const affectedRelationshipIds = new Set<string>();
  const addImpact = (
    tableId: string,
    direction: ErdImpactedTable['direction'],
    depth: number,
    pathIds: string[],
    relationshipId: string,
    reason: string,
  ) => {
    if (!tableId || tableId === text(table.id)) return;
    const impactedTable = tablesById.get(tableId);
    if (!impactedTable) return;
    affectedRelationshipIds.add(relationshipId);
    const existing = impacted.get(tableId);
    if (existing) {
      if (!existing.relationship_ids.includes(relationshipId)) existing.relationship_ids.push(relationshipId);
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      if (depth < existing.depth || (depth === existing.depth && direction === 'dependent' && existing.direction === 'referenced')) {
        existing.depth = depth;
        existing.direction = direction;
        existing.path_table_ids = pathIds;
        existing.path_table_names = pathIds.map(id => tablesById.get(id)?.name || id);
      }
      return;
    }
    impacted.set(tableId, {
      id: tableId,
      name: impactedTable.name,
      depth,
      direction,
      path_table_ids: pathIds,
      path_table_names: pathIds.map(id => tablesById.get(id)?.name || id),
      relationship_ids: [relationshipId],
      reasons: [reason],
    });
  };

  for (const relationship of relevantRootRelationships) {
    const relationshipId = text(relationship.id);
    affectedRelationshipIds.add(relationshipId);
    if (targetTableId(relationship) === text(table.id)) {
      addImpact(sourceTableId(relationship), 'dependent', 1, [text(table.id), sourceTableId(relationship)], relationshipId,
        requiresColumn ? 'Foreign key depends on the selected column.' : 'Foreign key depends on the selected table.');
    } else {
      addImpact(targetTableId(relationship), 'referenced', 1, [text(table.id), targetTableId(relationship)], relationshipId,
        requiresColumn ? 'Selected foreign-key column owns this relationship.' : 'Changed table owns a relationship to this referenced table.');
    }
  }

  // Deleting a table has the broadest business blast radius. Walk the reverse
  // FK graph so indirect dependants are visible without claiming they will be
  // physically deleted by the database.
  if (request.operation === 'table-delete') {
    const queue = [...impacted.values()]
      .filter(item => item.direction === 'dependent')
      .map(item => ({ tableId: item.id, depth: item.depth, path: item.path_table_ids }));
    const visited = new Set([text(table.id), ...queue.map(item => item.tableId)]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      for (const relationship of relationshipsByTarget.get(current.tableId) || []) {
        const nextId = sourceTableId(relationship);
        const relationshipId = text(relationship.id);
        affectedRelationshipIds.add(relationshipId);
        addImpact(nextId, 'dependent', current.depth + 1, [...current.path, nextId], relationshipId,
          'Indirectly depends on a table in the deletion blast radius.');
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ tableId: nextId, depth: current.depth + 1, path: [...current.path, nextId] });
        }
      }
    }
  }

  const affectedColumns: ErdImpactReport['affected_columns'] = [];
  for (const relationshipId of affectedRelationshipIds) {
    const relationship = relationshipsById.get(relationshipId);
    if (!relationship) continue;
    for (const [tableId, columnId] of [[sourceTableId(relationship), sourceColumnId(relationship)], [targetTableId(relationship), targetColumnId(relationship)]]) {
      const relatedTable = tablesById.get(tableId);
      const relatedColumn = relatedTable?.columns?.find(item => text(item.id) === columnId);
      if (!relatedTable || !relatedColumn || affectedColumns.some(item => item.table_id === tableId && item.column_id === columnId)) continue;
      affectedColumns.push({ table_id: tableId, table_name: relatedTable.name, column_id: columnId, column_name: relatedColumn.name });
    }
  }

  const impactedTables = [...impacted.values()].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const directTables = impactedTables.filter(item => item.depth === 1);
  const transitiveTables = impactedTables.filter(item => item.depth > 1);
  const columnIsKey = Boolean(column
    && (Boolean(column.is_pk ?? column.isPk) || Boolean(column.is_unique ?? column.isUnique)));
  const score = Math.min(100, baseRisk[request.operation]
    + directTables.length * 5
    + transitiveTables.length * 2
    + affectedRelationshipIds.size * 3
    + (columnIsKey ? 10 : 0));
  const risk = riskFromScore(score);
  const objectName = column ? `${table.name}.${column.name}` : table.name;
  const summary = `${operationLabel(request.operation)} on ${objectName} has ${risk} risk: ${directTables.length} direct and ${transitiveTables.length} transitive table dependencies across ${affectedRelationshipIds.size} relationships.`;

  const recommendations: string[] = [];
  if (request.operation.includes('delete')) recommendations.push('Create a backup and use a reversible migration before removing the object.');
  if (request.operation.includes('rename')) recommendations.push('Use a compatibility rename or coordinated application release; update queries, ORM models, and API contracts.');
  if (request.operation === 'column-type-change') recommendations.push('Validate existing values, castability, indexes, defaults, and both sides of every foreign key before altering the type.');
  if (request.operation === 'column-nullability-change') recommendations.push('Check current NULL counts and backfill data before making the column required.');
  if (affectedRelationshipIds.size) recommendations.push('Update or drop dependent foreign keys in migration order, then recreate and validate them after the change.');
  if (transitiveTables.length) recommendations.push('Run integration tests along every listed dependency path; transitive entries indicate business blast radius, not automatic database deletion.');
  recommendations.push('Search application code, reports, ETL jobs, and external consumers; the ERD only proves dependencies modeled in this diagram.');

  return {
    operation: request.operation,
    root: {
      table_id: text(table.id), table_name: table.name,
      ...(column ? { column_id: text(column.id), column_name: column.name } : {}),
    },
    risk,
    risk_score: score,
    summary,
    direct_tables: directTables,
    transitive_tables: transitiveTables,
    affected_relationship_ids: [...affectedRelationshipIds],
    affected_table_ids: impactedTables.map(item => item.id),
    affected_columns: affectedColumns.sort((a, b) => a.table_name.localeCompare(b.table_name) || a.column_name.localeCompare(b.column_name)),
    recommendations,
    assumptions: [
      'Relationship direction is foreign-key/source to referenced-key/target.',
      'Transitive impact describes dependency blast radius and does not imply ON DELETE CASCADE.',
      'Dependencies outside this ERD cannot be discovered automatically.',
    ],
  };
}
