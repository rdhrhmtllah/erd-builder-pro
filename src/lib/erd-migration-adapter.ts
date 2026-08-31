import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import type { ErdMigrationSchema } from '../../shared/erd-migration-planner';

const columnIdFromHandle = (handle?: string | null) => handle?.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '') || '';

export function canvasToMigrationSchema(nodes: Node<Entity>[], edges: Edge[]): ErdMigrationSchema {
  return {
    tables: nodes.map(node => ({
      id: node.id,
      name: node.data.name,
      columns: node.data.columns,
      indexes: node.data.indexes || [],
      constraints: node.data.constraints || [],
    })),
    relationships: edges.map(edge => ({
      id: edge.id,
      source_entity_id: edge.source,
      target_entity_id: edge.target,
      source_column_id: columnIdFromHandle(edge.sourceHandle),
      target_column_id: columnIdFromHandle(edge.targetHandle),
      constraint_name: (edge.data as any)?.constraint_name,
      on_delete: (edge.data as any)?.on_delete,
      on_update: (edge.data as any)?.on_update,
      source_cardinality: (edge.data as any)?.source_cardinality,
      target_cardinality: (edge.data as any)?.target_cardinality,
    })),
  };
}

export function historySnapshotToMigrationSchema(snapshot: Record<string, any>): ErdMigrationSchema {
  const tables = Array.isArray(snapshot.entities) ? snapshot.entities : [];
  const relationships = Array.isArray(snapshot.relationships) ? snapshot.relationships : [];
  return {
    tables: tables.map((table: any) => ({
      id: String(table.id),
      name: String(table.name || table.id),
      columns: Array.isArray(table.columns) ? table.columns : [],
      indexes: Array.isArray(table.indexes) ? table.indexes : [],
      constraints: Array.isArray(table.constraints) ? table.constraints : [],
    })),
    relationships: relationships.map((relationship: any) => ({
      id: String(relationship.id),
      source_entity_id: relationship.source_entity_id ?? relationship.sourceEntityId,
      target_entity_id: relationship.target_entity_id ?? relationship.targetEntityId,
      source_column_id: relationship.source_column_id ?? relationship.sourceColumnId,
      target_column_id: relationship.target_column_id ?? relationship.targetColumnId,
      constraint_name: relationship.constraint_name ?? relationship.constraintName,
      on_delete: relationship.on_delete ?? relationship.onDelete,
      on_update: relationship.on_update ?? relationship.onUpdate,
      source_cardinality: relationship.source_cardinality ?? relationship.sourceCardinality,
      target_cardinality: relationship.target_cardinality ?? relationship.targetCardinality,
    })),
  };
}
