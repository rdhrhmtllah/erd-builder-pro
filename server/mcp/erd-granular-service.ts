import { randomUUID } from "node:crypto";
import { getDiagramWithData, saveDiagram } from "../routes/diagrams/save-service.js";
import { analyzeErdImpact, type ErdImpactOperation } from "../../shared/erd-impact.js";
import { planErdMigration } from "../../shared/erd-migration-planner.js";

const MAX_OPERATIONS = 100;
const MAX_TABLES = 2_000;
const MAX_COLUMNS_PER_TABLE = 1_000;
const PROPOSAL_TTL_MS = 10 * 60 * 1000;

export const ERD_PATCH_OPERATIONS = [
  "table_add", "table_update", "table_delete",
  "column_add", "column_update", "column_delete",
  "index_add", "index_update", "index_delete",
  "constraint_add", "constraint_update", "constraint_delete",
  "relationship_add", "relationship_update", "relationship_delete",
] as const;
export type ErdPatchOperationName = (typeof ERD_PATCH_OPERATIONS)[number];
export type ErdPatchOperation = Record<string, any> & { op: ErdPatchOperationName };

type ErdSnapshot = {
  uid: string;
  name: string;
  version: number;
  updatedAt: string | null;
  viewport: { x: number; y: number; zoom: number };
  entities: any[];
  relationships: any[];
};

type ErdPatchProposal = {
  id: string;
  userId: string;
  uid: string;
  operations: ErdPatchOperation[];
  expectedUpdatedAt: string | null;
  expectedVersion: number;
  preview: Record<string, unknown>;
  expiresAt: number;
};

const proposals = new Map<string, ErdPatchProposal>();

function serialize(value: unknown): any {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function requiredText(value: unknown, field: string, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${field} is required and must be at most ${max} characters`);
  return value.trim();
}

function optionalText(value: unknown, field: string, max = 2_000) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} must be a string of at most ${max} characters`);
  return value;
}

function finiteNumber(value: unknown, field: string, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error(`${field} must be a finite number`);
  return value;
}

function bool(value: unknown, field: string, fallback: boolean) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function mapped(value: any, snake: string, camel: string, fallback?: any) {
  return value?.[snake] ?? value?.[camel] ?? fallback;
}

function normalizeColumn(value: any, generatedId?: string) {
  if (!value || typeof value !== "object") throw new Error("column must be an object");
  return {
    id: generatedId || requiredText(value.id, "column.id", 160),
    name: requiredText(value.name, "column.name", 200),
    type: requiredText(value.type, "column.type", 100),
    is_pk: bool(mapped(value, "is_pk", "isPk"), "column.is_pk", false),
    is_nullable: bool(mapped(value, "is_nullable", "isNullable"), "column.is_nullable", true),
    default_value: optionalText(mapped(value, "default_value", "defaultValue"), "column.default_value", 10_000) ?? null,
    is_unique: bool(mapped(value, "is_unique", "isUnique"), "column.is_unique", false),
    enum_values: optionalText(mapped(value, "enum_values", "enumValues"), "column.enum_values", 20_000) || "",
    enum_name: optionalText(mapped(value, "enum_name", "enumName"), "column.enum_name", 200) || "",
    comment: optionalText(value.comment, "column.comment", 10_000) ?? null,
    max_length: mapped(value, "max_length", "maxLength") ?? null,
    numeric_precision: mapped(value, "numeric_precision", "numericPrecision") ?? null,
    numeric_scale: mapped(value, "numeric_scale", "numericScale") ?? null,
    sort_order: Number(mapped(value, "sort_order", "sortOrder", 0)) || 0,
  };
}

function normalizeEntity(value: any) {
  const columns = Array.isArray(value.columns) ? value.columns.map((column: any) => normalizeColumn(column)) : [];
  return {
    id: requiredText(value.id, "entity.id", 160),
    name: requiredText(value.name, "entity.name", 200),
    x: finiteNumber(value.x, "entity.x", 0),
    y: finiteNumber(value.y, "entity.y", 0),
    color: typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color.toLowerCase() : "#6366f1",
    comment: optionalText(value.comment, "entity.comment", 10_000) ?? null,
    columns,
    constraints: Array.isArray(value.constraints) ? value.constraints.map((item: any) => ({
      id: item.id, entity_id: value.id, kind: item.kind, name: item.name ?? null,
      column_ids: mapped(item, "column_ids", "columnIds", []), expression: item.expression ?? null,
    })) : [],
    indexes: Array.isArray(value.indexes) ? value.indexes.map((item: any) => ({
      id: item.id, entity_id: value.id, name: item.name,
      column_ids: mapped(item, "column_ids", "columnIds", []), is_unique: Boolean(mapped(item, "is_unique", "isUnique")), algorithm: item.algorithm ?? null,
    })) : [],
  };
}

function normalizeRelationship(value: any, generatedId?: string) {
  const sourceEntityId = requiredText(mapped(value, "source_entity_id", "sourceEntityId"), "relationship.source_entity_id", 160);
  const targetEntityId = requiredText(mapped(value, "target_entity_id", "targetEntityId"), "relationship.target_entity_id", 160);
  const sourceColumnId = requiredText(mapped(value, "source_column_id", "sourceColumnId"), "relationship.source_column_id", 160);
  const targetColumnId = requiredText(mapped(value, "target_column_id", "targetColumnId"), "relationship.target_column_id", 160);
  const legacy = cardinalitiesFromLegacy(value.type || value.label);
  const sourceCardinality = normalizeCardinality(mapped(value, "source_cardinality", "sourceCardinality"), legacy.source);
  const targetCardinality = normalizeCardinality(mapped(value, "target_cardinality", "targetCardinality"), legacy.target);
  return {
    id: generatedId || requiredText(value.id, "relationship.id", 160),
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    source_column_id: sourceColumnId,
    target_column_id: targetColumnId,
    source_handle: `col-${sourceColumnId}-source`,
    target_handle: `col-${targetColumnId}-target`,
    type: relationshipType(sourceCardinality, targetCardinality),
    label: optionalText(value.label, "relationship.label", 500) ?? null,
    on_delete: optionalText(mapped(value, "on_delete", "onDelete"), "relationship.on_delete", 50) ?? null,
    on_update: optionalText(mapped(value, "on_update", "onUpdate"), "relationship.on_update", 50) ?? null,
    constraint_name: optionalText(mapped(value, "constraint_name", "constraintName"), "relationship.constraint_name", 200) ?? null,
    source_cardinality: sourceCardinality,
    target_cardinality: targetCardinality,
  };
}

function relationshipType(source: string, target: string) {
  const sourceMany = source.endsWith("many");
  const targetMany = target.endsWith("many");
  if (sourceMany && targetMany) return "many-to-many";
  if (!sourceMany && !targetMany) return "one-to-one";
  return "one-to-many";
}

function cardinalitiesFromLegacy(value: unknown) {
  const legacy = String(value || '').toLowerCase();
  if (legacy.includes('many-to-many') || legacy.includes('n:m')) return { source: 'zero-or-many', target: 'zero-or-many' };
  if (legacy.includes('one-to-one') || legacy.includes('1:1')) return { source: 'exactly-one', target: 'exactly-one' };
  return { source: 'zero-or-many', target: 'exactly-one' };
}

function normalizeCardinality(value: unknown, fallback: string) {
  const normalized = value ?? fallback;
  if (!["zero-or-one", "exactly-one", "zero-or-many", "one-or-many"].includes(String(normalized))) {
    throw new Error("Relationship cardinality must be zero-or-one, exactly-one, zero-or-many, or one-or-many");
  }
  return String(normalized);
}

function normalizeSnapshot(raw: any): ErdSnapshot {
  if (!raw || raw.isDeleted || raw.is_deleted) throw new Error("Diagram not found");
  if (raw.sourceType === "production_db" || raw.source_type === "production_db" || raw.data) {
    throw new Error("Production database diagrams are not writable through granular MCP");
  }
  return {
    uid: String(raw.uid || raw.id),
    name: String(raw.name || "Untitled diagram"),
    version: Number(raw.version ?? raw._version ?? 0),
    updatedAt: raw.updatedAt || raw.updated_at ? new Date(raw.updatedAt || raw.updated_at).toISOString() : null,
    viewport: {
      x: Number(raw.viewportX ?? raw.viewport_x ?? 0),
      y: Number(raw.viewportY ?? raw.viewport_y ?? 0),
      zoom: Number(raw.viewportZoom ?? raw.viewport_zoom ?? 1),
    },
    entities: (raw.entities || []).map(normalizeEntity),
    relationships: (raw.relationships || []).map((item: any) => normalizeRelationship(item)),
  };
}

function prepareOperations(operations: ErdPatchOperation[]) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > MAX_OPERATIONS) {
    throw new Error(`operations must contain between 1 and ${MAX_OPERATIONS} items`);
  }
  return operations.map((operation, index) => {
    if (!operation || typeof operation !== "object" || !ERD_PATCH_OPERATIONS.includes(operation.op)) throw new Error(`operations[${index}].op is invalid`);
    if (operation.op === "table_add") return {
      ...operation,
      table: {
        ...operation.table,
        id: randomUUID(),
        columns: Array.isArray(operation.table?.columns)
          ? operation.table.columns.map((column: any) => ({ ...column, id: randomUUID() }))
          : [],
        indexes: Array.isArray(operation.table?.indexes)
          ? operation.table.indexes.map((index: any) => ({ ...index, id: randomUUID() }))
          : [],
        constraints: Array.isArray(operation.table?.constraints)
          ? operation.table.constraints.map((constraint: any) => ({ ...constraint, id: randomUUID() }))
          : [],
      },
    };
    if (operation.op === "column_add") return { ...operation, column: { ...operation.column, id: randomUUID() } };
    if (operation.op === "index_add") return { ...operation, index: { ...operation.index, id: randomUUID() } };
    if (operation.op === "constraint_add") return { ...operation, constraint: { ...operation.constraint, id: randomUUID() } };
    if (operation.op === "relationship_add") return { ...operation, relationship: { ...operation.relationship, id: randomUUID() } };
    return { ...operation };
  });
}

function findEntity(entities: any[], id: unknown) {
  const tableId = requiredText(id, "table_id", 160);
  const entity = entities.find(item => item.id === tableId);
  if (!entity) throw new Error(`Table not found: ${tableId}`);
  return entity;
}

function changesObject(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as object).length === 0) throw new Error(`${field} must be a non-empty object`);
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, field: string, max = 100) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max || value.some(item => typeof item !== "string" || !item)) {
    throw new Error(`${field} must be a non-empty string array with at most ${max} items`);
  }
  return [...new Set(value)];
}

function normalizeIndex(value: any, tableId: string) {
  if (!value || typeof value !== "object") throw new Error("index must be an object");
  return {
    id: requiredText(value.id, "index.id", 160), entity_id: tableId,
    name: requiredText(value.name, "index.name", 200),
    column_ids: stringArray(mapped(value, "column_ids", "columnIds"), "index.column_ids"),
    is_unique: bool(mapped(value, "is_unique", "isUnique"), "index.is_unique", false),
    algorithm: optionalText(value.algorithm, "index.algorithm", 50) ?? null,
  };
}

function normalizeConstraint(value: any, tableId: string) {
  if (!value || typeof value !== "object") throw new Error("constraint must be an object");
  const kind = requiredText(value.kind, "constraint.kind", 50);
  if (!["primary_key", "unique", "check"].includes(kind)) throw new Error("constraint.kind must be primary_key, unique, or check");
  const columnIds = kind === "check" && (!value.column_ids && !value.columnIds)
    ? [] : stringArray(mapped(value, "column_ids", "columnIds"), "constraint.column_ids");
  const expression = optionalText(value.expression, "constraint.expression", 10_000) ?? null;
  if (kind === "check" && !expression) throw new Error("check constraint requires an expression");
  return {
    id: requiredText(value.id, "constraint.id", 160), entity_id: tableId, kind,
    name: optionalText(value.name, "constraint.name", 200) ?? null,
    column_ids: columnIds, expression,
  };
}

export function applyErdPatch(snapshot: ErdSnapshot, operations: ErdPatchOperation[]) {
  const entities = snapshot.entities.map(entity => ({
    ...entity,
    columns: entity.columns.map((column: any) => ({ ...column })),
    indexes: entity.indexes.map((index: any) => ({ ...index, column_ids: [...index.column_ids] })),
    constraints: entity.constraints.map((constraint: any) => ({ ...constraint, column_ids: [...constraint.column_ids] })),
  }));
  let relationships = snapshot.relationships.map(relationship => ({ ...relationship }));
  const changes: Record<string, unknown>[] = [];
  let destructive = false;

  for (const operation of operations) {
    if (operation.op === "table_add") {
      const entity = normalizeEntity(operation.table);
      entity.indexes = (operation.table.indexes || []).map((item: any) => normalizeIndex(item, entity.id));
      entity.constraints = (operation.table.constraints || []).map((item: any) => normalizeConstraint(item, entity.id));
      entities.push(entity);
      changes.push({ op: operation.op, table_id: entity.id, name: entity.name, columns_added: entity.columns.length });
    } else if (operation.op === "table_update") {
      const entity = findEntity(entities, operation.table_id);
      const patch = changesObject(operation.changes, "changes");
      const before = { name: entity.name, x: entity.x, y: entity.y, color: entity.color, comment: entity.comment };
      if (patch.name !== undefined) entity.name = requiredText(patch.name, "changes.name", 200);
      if (patch.x !== undefined) entity.x = finiteNumber(patch.x, "changes.x", entity.x);
      if (patch.y !== undefined) entity.y = finiteNumber(patch.y, "changes.y", entity.y);
      if (patch.color !== undefined) {
        if (typeof patch.color !== "string" || !/^#[0-9a-f]{6}$/i.test(patch.color)) throw new Error("changes.color must be a six-digit hex color");
        entity.color = patch.color.toLowerCase();
      }
      if (patch.comment !== undefined) entity.comment = optionalText(patch.comment, "changes.comment", 10_000) ?? null;
      changes.push({ op: operation.op, table_id: entity.id, before, after: { name: entity.name, x: entity.x, y: entity.y, color: entity.color, comment: entity.comment } });
    } else if (operation.op === "table_delete") {
      const entity = findEntity(entities, operation.table_id);
      const index = entities.indexOf(entity);
      const removedRelationships = relationships.filter(item => item.source_entity_id === entity.id || item.target_entity_id === entity.id);
      entities.splice(index, 1);
      relationships = relationships.filter(item => item.source_entity_id !== entity.id && item.target_entity_id !== entity.id);
      destructive = true;
      changes.push({ op: operation.op, table_id: entity.id, name: entity.name, columns_deleted: entity.columns.length, relationships_deleted: removedRelationships.length });
    } else if (operation.op === "column_add") {
      const entity = findEntity(entities, operation.table_id);
      const column = normalizeColumn(operation.column);
      column.sort_order = entity.columns.length;
      entity.columns.push(column);
      changes.push({ op: operation.op, table_id: entity.id, column_id: column.id, name: column.name });
    } else if (operation.op === "column_update") {
      const entity = findEntity(entities, operation.table_id);
      const columnId = requiredText(operation.column_id, "column_id", 160);
      const column = entity.columns.find((item: any) => item.id === columnId);
      if (!column) throw new Error(`Column not found: ${columnId}`);
      const patch = changesObject(operation.changes, "changes");
      const before = { ...column };
      if (patch.name !== undefined) column.name = requiredText(patch.name, "changes.name", 200);
      if (patch.type !== undefined) column.type = requiredText(patch.type, "changes.type", 100);
      for (const [snake, camel, fallback] of [["is_pk", "isPk", column.is_pk], ["is_nullable", "isNullable", column.is_nullable], ["is_unique", "isUnique", column.is_unique]] as const) {
        if (patch[snake] !== undefined || patch[camel] !== undefined) column[snake] = bool(mapped(patch, snake, camel), `changes.${snake}`, fallback);
      }
      if (patch.default_value !== undefined || patch.defaultValue !== undefined) column.default_value = optionalText(mapped(patch, "default_value", "defaultValue"), "changes.default_value", 10_000) ?? null;
      if (patch.comment !== undefined) column.comment = optionalText(patch.comment, "changes.comment", 10_000) ?? null;
      for (const [snake, camel, max] of [["enum_values", "enumValues", 20_000], ["enum_name", "enumName", 200]] as const) {
        if (patch[snake] !== undefined || patch[camel] !== undefined) column[snake] = optionalText(mapped(patch, snake, camel), `changes.${snake}`, max) || "";
      }
      for (const [snake, camel] of [["max_length", "maxLength"], ["numeric_precision", "numericPrecision"], ["numeric_scale", "numericScale"], ["sort_order", "sortOrder"]] as const) {
        if (patch[snake] !== undefined || patch[camel] !== undefined) {
          const value = mapped(patch, snake, camel);
          if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1_000_000)) throw new Error(`changes.${snake} must be a non-negative integer or null`);
          column[snake] = value;
        }
      }
      changes.push({ op: operation.op, table_id: entity.id, column_id: column.id, before, after: { ...column } });
    } else if (operation.op === "column_delete") {
      const entity = findEntity(entities, operation.table_id);
      const columnId = requiredText(operation.column_id, "column_id", 160);
      const column = entity.columns.find((item: any) => item.id === columnId);
      if (!column) throw new Error(`Column not found: ${columnId}`);
      entity.columns = entity.columns.filter((item: any) => item.id !== columnId).map((item: any, index: number) => ({ ...item, sort_order: index }));
      const removedRelationships = relationships.filter(item => item.source_column_id === columnId || item.target_column_id === columnId);
      relationships = relationships.filter(item => item.source_column_id !== columnId && item.target_column_id !== columnId);
      const removedIndexes = entity.indexes.filter((item: any) => item.column_ids.includes(columnId));
      const removedConstraints = entity.constraints.filter((item: any) => item.column_ids.includes(columnId));
      entity.indexes = entity.indexes.filter((item: any) => !item.column_ids.includes(columnId));
      entity.constraints = entity.constraints.filter((item: any) => !item.column_ids.includes(columnId));
      destructive = true;
      changes.push({ op: operation.op, table_id: entity.id, column_id: column.id, name: column.name, relationships_deleted: removedRelationships.length, indexes_deleted: removedIndexes.length, constraints_deleted: removedConstraints.length });
    } else if (operation.op === "index_add") {
      const entity = findEntity(entities, operation.table_id);
      const index = normalizeIndex(operation.index, entity.id);
      entity.indexes.push(index);
      changes.push({ op: operation.op, table_id: entity.id, index_id: index.id, name: index.name, column_ids: index.column_ids });
    } else if (operation.op === "index_update") {
      const entity = findEntity(entities, operation.table_id);
      const indexId = requiredText(operation.index_id, "index_id", 160);
      const index = entity.indexes.find((item: any) => item.id === indexId);
      if (!index) throw new Error(`Index not found: ${indexId}`);
      const patch = changesObject(operation.changes, "changes");
      const before = { ...index };
      if (patch.name !== undefined) index.name = requiredText(patch.name, "changes.name", 200);
      if (patch.column_ids !== undefined || patch.columnIds !== undefined) index.column_ids = stringArray(mapped(patch, "column_ids", "columnIds"), "changes.column_ids");
      if (patch.is_unique !== undefined || patch.isUnique !== undefined) index.is_unique = bool(mapped(patch, "is_unique", "isUnique"), "changes.is_unique", index.is_unique);
      if (patch.algorithm !== undefined) index.algorithm = optionalText(patch.algorithm, "changes.algorithm", 50) ?? null;
      changes.push({ op: operation.op, table_id: entity.id, index_id: index.id, before, after: { ...index } });
    } else if (operation.op === "index_delete") {
      const entity = findEntity(entities, operation.table_id);
      const indexId = requiredText(operation.index_id, "index_id", 160);
      const index = entity.indexes.find((item: any) => item.id === indexId);
      if (!index) throw new Error(`Index not found: ${indexId}`);
      entity.indexes = entity.indexes.filter((item: any) => item.id !== indexId);
      destructive = true;
      changes.push({ op: operation.op, table_id: entity.id, index_id: index.id, name: index.name });
    } else if (operation.op === "constraint_add") {
      const entity = findEntity(entities, operation.table_id);
      const constraint = normalizeConstraint(operation.constraint, entity.id);
      entity.constraints.push(constraint);
      changes.push({ op: operation.op, table_id: entity.id, constraint_id: constraint.id, kind: constraint.kind, column_ids: constraint.column_ids });
    } else if (operation.op === "constraint_update") {
      const entity = findEntity(entities, operation.table_id);
      const constraintId = requiredText(operation.constraint_id, "constraint_id", 160);
      const constraint = entity.constraints.find((item: any) => item.id === constraintId);
      if (!constraint) throw new Error(`Constraint not found: ${constraintId}`);
      const patch = changesObject(operation.changes, "changes");
      const updated = normalizeConstraint({
        ...constraint, ...patch, id: constraint.id,
        column_ids: patch.column_ids ?? patch.columnIds ?? constraint.column_ids,
      }, entity.id);
      Object.assign(constraint, updated);
      changes.push({ op: operation.op, table_id: entity.id, constraint_id: constraint.id, kind: constraint.kind, column_ids: constraint.column_ids });
    } else if (operation.op === "constraint_delete") {
      const entity = findEntity(entities, operation.table_id);
      const constraintId = requiredText(operation.constraint_id, "constraint_id", 160);
      const constraint = entity.constraints.find((item: any) => item.id === constraintId);
      if (!constraint) throw new Error(`Constraint not found: ${constraintId}`);
      entity.constraints = entity.constraints.filter((item: any) => item.id !== constraintId);
      destructive = true;
      changes.push({ op: operation.op, table_id: entity.id, constraint_id: constraint.id, kind: constraint.kind });
    } else if (operation.op === "relationship_add") {
      const relationship = normalizeRelationship(operation.relationship);
      relationships.push(relationship);
      changes.push({ op: operation.op, relationship_id: relationship.id, from: `${relationship.source_entity_id}.${relationship.source_column_id}`, to: `${relationship.target_entity_id}.${relationship.target_column_id}` });
    } else if (operation.op === "relationship_update") {
      const relationshipId = requiredText(operation.relationship_id, "relationship_id", 160);
      const relationship = relationships.find(item => item.id === relationshipId);
      if (!relationship) throw new Error(`Relationship not found: ${relationshipId}`);
      const patch = changesObject(operation.changes, "changes");
      const before = { ...relationship };
      for (const [snake, camel] of [["source_entity_id", "sourceEntityId"], ["target_entity_id", "targetEntityId"], ["source_column_id", "sourceColumnId"], ["target_column_id", "targetColumnId"]] as const) {
        if (patch[snake] !== undefined || patch[camel] !== undefined) relationship[snake] = requiredText(mapped(patch, snake, camel), `changes.${snake}`, 160);
      }
      for (const [snake, camel, max] of [["on_delete", "onDelete", 50], ["on_update", "onUpdate", 50], ["constraint_name", "constraintName", 200]] as const) {
        if (patch[snake] !== undefined || patch[camel] !== undefined) relationship[snake] = optionalText(mapped(patch, snake, camel), `changes.${snake}`, max) ?? null;
      }
      for (const [snake, camel, fallback] of [["source_cardinality", "sourceCardinality", relationship.source_cardinality], ["target_cardinality", "targetCardinality", relationship.target_cardinality]] as const) {
        if (patch[snake] !== undefined || patch[camel] !== undefined) relationship[snake] = normalizeCardinality(mapped(patch, snake, camel), fallback);
      }
      if (patch.type !== undefined && patch.source_cardinality === undefined && patch.sourceCardinality === undefined
        && patch.target_cardinality === undefined && patch.targetCardinality === undefined) {
        const legacy = cardinalitiesFromLegacy(requiredText(patch.type, "changes.type", 50));
        relationship.source_cardinality = legacy.source;
        relationship.target_cardinality = legacy.target;
      }
      relationship.type = relationshipType(relationship.source_cardinality, relationship.target_cardinality);
      if (patch.label !== undefined) relationship.label = optionalText(patch.label, "changes.label", 500) ?? null;
      relationship.source_handle = `col-${relationship.source_column_id}-source`;
      relationship.target_handle = `col-${relationship.target_column_id}-target`;
      changes.push({ op: operation.op, relationship_id: relationship.id, before, after: { ...relationship } });
    } else if (operation.op === "relationship_delete") {
      const relationshipId = requiredText(operation.relationship_id, "relationship_id", 160);
      const relationship = relationships.find(item => item.id === relationshipId);
      if (!relationship) throw new Error(`Relationship not found: ${relationshipId}`);
      relationships = relationships.filter(item => item.id !== relationshipId);
      destructive = true;
      changes.push({ op: operation.op, relationship_id: relationship.id, from: `${relationship.source_entity_id}.${relationship.source_column_id}`, to: `${relationship.target_entity_id}.${relationship.target_column_id}` });
    }
  }

  validateErdSnapshot(entities, relationships);
  return { entities, relationships, changes, destructive };
}

export function validateErdSnapshot(entities: any[], relationships: any[]) {
  if (entities.length > MAX_TABLES) throw new Error(`Diagram cannot exceed ${MAX_TABLES} tables`);
  const entityIds = new Set<string>();
  const tableNames = new Set<string>();
  const columnsByEntity = new Map<string, Set<string>>();
  const globalColumnIds = new Set<string>();
  for (const entity of entities) {
    if (entityIds.has(entity.id)) throw new Error(`Duplicate table id: ${entity.id}`);
    entityIds.add(entity.id);
    const tableName = entity.name.toLowerCase();
    if (tableNames.has(tableName)) throw new Error(`Duplicate table name: ${entity.name}`);
    tableNames.add(tableName);
    if (entity.columns.length > MAX_COLUMNS_PER_TABLE) throw new Error(`${entity.name} exceeds ${MAX_COLUMNS_PER_TABLE} columns`);
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const column of entity.columns) {
      const name = column.name.toLowerCase();
      if (names.has(name)) throw new Error(`Duplicate column name in ${entity.name}: ${column.name}`);
      if (globalColumnIds.has(column.id)) throw new Error(`Duplicate column id: ${column.id}`);
      names.add(name); ids.add(column.id); globalColumnIds.add(column.id);
    }
    columnsByEntity.set(entity.id, ids);
    const indexNames = new Set<string>();
    for (const index of entity.indexes) {
      if (indexNames.has(index.name.toLowerCase())) throw new Error(`Duplicate index name in ${entity.name}: ${index.name}`);
      indexNames.add(index.name.toLowerCase());
      if (index.column_ids.some((id: string) => !ids.has(id))) throw new Error(`Index ${index.name} references a missing column in ${entity.name}`);
    }
    const constraintIds = new Set<string>();
    for (const constraint of entity.constraints) {
      if (constraintIds.has(constraint.id)) throw new Error(`Duplicate constraint id: ${constraint.id}`);
      constraintIds.add(constraint.id);
      if (constraint.column_ids.some((id: string) => !ids.has(id))) throw new Error(`Constraint ${constraint.name || constraint.id} references a missing column in ${entity.name}`);
    }
  }
  const relationshipIds = new Set<string>();
  const relationKeys = new Set<string>();
  for (const relationship of relationships) {
    if (relationshipIds.has(relationship.id)) throw new Error(`Duplicate relationship id: ${relationship.id}`);
    relationshipIds.add(relationship.id);
    if (!entityIds.has(relationship.source_entity_id) || !entityIds.has(relationship.target_entity_id)) throw new Error(`Relationship ${relationship.id} references a missing table`);
    if (!columnsByEntity.get(relationship.source_entity_id)?.has(relationship.source_column_id)
      || !columnsByEntity.get(relationship.target_entity_id)?.has(relationship.target_column_id)) throw new Error(`Relationship ${relationship.id} references a missing column`);
    const relationKey = `${relationship.source_entity_id}:${relationship.source_column_id}>${relationship.target_entity_id}:${relationship.target_column_id}`;
    if (relationKeys.has(relationKey)) throw new Error(`Duplicate relationship between the same columns: ${relationKey}`);
    relationKeys.add(relationKey);
  }
}

async function ownedSnapshot(userId: string, uid: string) {
  const raw = await getDiagramWithData(uid, userId);
  if (!raw) throw new Error("Diagram not found");
  return normalizeSnapshot(raw);
}

export async function readGranularErd(userId: string, uid: string, tableId?: string) {
  const snapshot = await ownedSnapshot(userId, uid);
  if (!tableId) return serialize(snapshot);
  const entity = snapshot.entities.find(item => item.id === tableId);
  if (!entity) throw new Error("Table not found");
  return serialize({ ...snapshot, entities: [entity], relationships: snapshot.relationships.filter(item => item.source_entity_id === tableId || item.target_entity_id === tableId) });
}

export async function analyzeGranularErdImpact(
  userId: string,
  uid: string,
  operation: ErdImpactOperation,
  tableId: string,
  columnId?: string,
) {
  const snapshot = await ownedSnapshot(userId, uid);
  return serialize(analyzeErdImpact(snapshot.entities, snapshot.relationships, {
    operation,
    table_id: requiredText(tableId, "table_id", 160),
    ...(columnId ? { column_id: requiredText(columnId, "column_id", 160) } : {}),
  }));
}

export async function proposeErdPatch(userId: string, uid: string, operations: ErdPatchOperation[], expectedVersion?: number) {
  const snapshot = await ownedSnapshot(userId, uid);
  if (expectedVersion !== undefined && expectedVersion !== snapshot.version) throw new Error(`Conflict: expected version ${expectedVersion}, current version is ${snapshot.version}`);
  const prepared = prepareOperations(operations);
  const result = applyErdPatch(snapshot, prepared);
  const migrationPlan = planErdMigration(
    { tables: snapshot.entities, relationships: snapshot.relationships },
    { tables: result.entities, relationships: result.relationships },
  );
  const id = randomUUID();
  const preview = {
    operation: "erd_patch",
    diagram_uid: snapshot.uid,
    diagram_name: snapshot.name,
    expected_version: snapshot.version,
    expected_updated_at: snapshot.updatedAt,
    before: { tables: snapshot.entities.length, relationships: snapshot.relationships.length },
    after: { tables: result.entities.length, relationships: result.relationships.length },
    changes: result.changes,
    migration_plan: migrationPlan,
    destructive: result.destructive,
    requires_explicit_confirmation: true,
  };
  proposals.set(id, {
    id, userId, uid: snapshot.uid, operations: prepared,
    expectedUpdatedAt: snapshot.updatedAt, expectedVersion: snapshot.version,
    preview, expiresAt: Date.now() + PROPOSAL_TTL_MS,
  });
  return serialize({ proposal_id: id, confirmation: id, expires_at: new Date(Date.now() + PROPOSAL_TTL_MS), ...preview });
}

export async function applyErdPatchProposal(userId: string, proposalId: string, confirmation: string) {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.userId !== userId) {
    throw new Error("ERD patch proposal is missing or expired; create a new proposal");
  }
  if (proposal.expiresAt < Date.now()) {
    proposals.delete(proposalId);
    throw new Error("ERD patch proposal is missing or expired; create a new proposal");
  }
  if (confirmation !== proposal.id) throw new Error("Confirmation must exactly match proposal_id");
  const current = await ownedSnapshot(userId, proposal.uid);
  if (current.updatedAt !== proposal.expectedUpdatedAt || current.version !== proposal.expectedVersion) {
    throw new Error("Conflict: diagram changed after this patch proposal was created");
  }
  const result = applyErdPatch(current, proposal.operations);
  const saved = await saveDiagram(proposal.uid, userId, {
    entities: result.entities,
    relationships: result.relationships,
    viewport: current.viewport,
    expectedVersion: proposal.expectedVersion,
  });
  if (!saved) throw new Error("Diagram not found");
  if ((saved as any).conflict) throw new Error("Conflict: diagram changed while applying the patch");
  proposals.delete(proposalId);
  return serialize({ status: "applied", proposal_id: proposal.id, diagram_uid: proposal.uid, changes: result.changes, result: saved });
}

export function cleanupErdPatchProposals() {
  const now = Date.now();
  for (const [id, proposal] of proposals) if (proposal.expiresAt < now) proposals.delete(id);
}
