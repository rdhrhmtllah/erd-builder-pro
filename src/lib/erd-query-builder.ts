import type { Column, Entity, Relationship } from '@/types';
import {
  generateMySQL, generatePostgreSQL, generateSQLServer, quoteIdentifier, type SQLDialect,
} from './sql-generator';

export type SqlDialect = SQLDialect;
export type PlaceholderStyle = 'named' | 'positional' | 'literal';
export type QueryVerb = 'select' | 'insert' | 'update' | 'delete';
/** Everything a copy action can produce, including the two that are not statements. */
export type CopyKind = QueryVerb | 'columns' | 'ddl';

export interface QueryOptions {
  dialect: SqlDialect;
  placeholders: PlaceholderStyle;
}

/** Columns are listed one per line past this count, so a wide table stays readable. */
const INLINE_COLUMN_LIMIT = 6;

function q(value: string, options: QueryOptions): string {
  return quoteIdentifier(value, options.dialect);
}

function baseType(column: Column): string {
  return String(column.type || '').toLowerCase().replace(/\(.*/, '').trim();
}

/** A parameter name has to survive being pasted next to a driver, so keep it plain. */
function paramName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_') || 'value';
}

function sampleValue(column: Column, dialect: SqlDialect): string {
  const type = baseType(column);
  if (['int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'double', 'real'].includes(type)) return '0';
  if (['boolean', 'bool', 'bit'].includes(type)) return dialect === 'sqlserver' ? '0' : 'FALSE';
  if (['timestamp', 'datetime', 'timestamptz'].includes(type)) return dialect === 'sqlserver' ? 'SYSDATETIME()' : 'CURRENT_TIMESTAMP';
  if (type === 'date') return dialect === 'sqlserver' ? 'CAST(SYSDATETIME() AS DATE)' : 'CURRENT_DATE';
  if (type === 'time') return dialect === 'sqlserver' ? 'CAST(SYSDATETIME() AS TIME)' : 'CURRENT_TIME';
  if (type === 'json' || type === 'jsonb') return "'{}'";
  return "''";
}

function placeholder(column: Column, options: QueryOptions): string {
  if (options.placeholders === 'positional') return '?';
  if (options.placeholders === 'literal') return sampleValue(column, options.dialect);
  // T-SQL has no ":name" syntax; its parameters are "@name".
  const prefix = options.dialect === 'sqlserver' ? '@' : ':';
  return `${prefix}${paramName(column.name)}`;
}

/**
 * Whether the database supplies this key itself.
 *
 * The DDL this app generates marks a lone integer primary key AUTO_INCREMENT or
 * IDENTITY, so an INSERT that names it would fight the database. A composite key
 * or a uuid always comes from the caller.
 */
function isGeneratedKey(entity: Entity, column: Column): boolean {
  if (!column.is_pk) return false;
  if (entity.columns.filter(c => c.is_pk).length !== 1) return false;
  return ['int', 'integer', 'bigint', 'smallint', 'serial', 'bigserial'].includes(baseType(column));
}

/** The list that follows SELECT, carrying its own leading space or line break. */
function selectList(names: string[], options: QueryOptions): string {
  const quoted = names.map(name => q(name, options));
  return quoted.length > INLINE_COLUMN_LIMIT ? `\n  ${quoted.join(',\n  ')}` : ` ${quoted.join(', ')}`;
}

/** The parenthesised list an INSERT names its columns with. */
function parenList(names: string[], options: QueryOptions): string {
  const quoted = names.map(name => q(name, options));
  return quoted.length > INLINE_COLUMN_LIMIT ? `(\n  ${quoted.join(',\n  ')}\n)` : `(${quoted.join(', ')})`;
}

/**
 * The condition that identifies one row.
 *
 * A table with no primary key gets `WHERE 1 = 0` rather than no condition at
 * all: a pasted UPDATE or DELETE that runs before it is edited must not be able
 * to touch every row.
 */
function whereClause(entity: Entity, options: QueryOptions): string {
  const keys = entity.columns.filter(column => column.is_pk);
  if (keys.length === 0) {
    return `-- ${q(entity.name, options)} has no primary key: replace this condition before running.\nWHERE 1 = 0`;
  }
  return `WHERE ${keys.map(key => `${q(key.name, options)} = ${placeholder(key, options)}`).join(' AND ')}`;
}

/** The column names of a table, quoted and comma-separated, ready to paste. */
export function buildColumnList(entity: Entity, options: QueryOptions): string {
  return entity.columns.map(column => q(column.name, options)).join(', ');
}

/**
 * A ready-to-run statement for one table.
 *
 * Columns are always named rather than collapsed into `*`, because a star hides
 * columns added later and turns pasted code quietly wrong.
 */
export function buildTableQuery(entity: Entity, verb: QueryVerb, options: QueryOptions): string {
  const table = q(entity.name, options);
  if (entity.columns.length === 0) return `-- ${table} has no columns yet.`;

  if (verb === 'select') {
    return `SELECT${selectList(entity.columns.map(c => c.name), options)}\nFROM ${table};`;
  }

  if (verb === 'insert') {
    const insertable = entity.columns.filter(column => !isGeneratedKey(entity, column));
    if (insertable.length === 0) return `-- ${table} has no insertable columns.`;
    const names = parenList(insertable.map(c => c.name), options);
    const values = insertable.map(column => placeholder(column, options)).join(', ');
    return `INSERT INTO ${table} ${names}\nVALUES (${values});`;
  }

  if (verb === 'update') {
    const assignable = entity.columns.filter(column => !column.is_pk);
    if (assignable.length === 0) return `-- ${table} has no columns to update.`;
    const assignments = assignable
      .map(column => `${q(column.name, options)} = ${placeholder(column, options)}`)
      .join(',\n    ');
    return `UPDATE ${table}\nSET ${assignments}\n${whereClause(entity, options)};`;
  }

  return `DELETE FROM ${table}\n${whereClause(entity, options)};`;
}

// ── Multi-table SELECT ──

type JoinEdge = { otherId: string; sourceId: string; sourceColumn: string; targetId: string; targetColumn: string };

/** Adjacency over the tables, keyed by entity id, skipping relationships whose columns are gone. */
function buildGraph(entities: Entity[], relationships: Relationship[]): Map<string, JoinEdge[]> {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const graph = new Map<string, JoinEdge[]>();

  const columnName = (entityId: string, columnId?: string) =>
    byId.get(entityId)?.columns.find(column => column.id === columnId)?.name;

  for (const relationship of relationships) {
    const { source_entity_id: sourceId, target_entity_id: targetId } = relationship;
    const sourceColumn = columnName(sourceId, relationship.source_column_id);
    const targetColumn = columnName(targetId, relationship.target_column_id);
    if (!sourceColumn || !targetColumn || sourceId === targetId) continue;

    const edge = { sourceId, sourceColumn, targetId, targetColumn };
    graph.set(sourceId, [...(graph.get(sourceId) || []), { ...edge, otherId: targetId }]);
    graph.set(targetId, [...(graph.get(targetId) || []), { ...edge, otherId: sourceId }]);
  }
  return graph;
}

/** Shortest path from anything already joined to `goal`, as the edges to add. */
function pathToGoal(graph: Map<string, JoinEdge[]>, from: Set<string>, goal: string): JoinEdge[] | null {
  const cameFrom = new Map<string, { edge: JoinEdge; from: string }>();
  const seen = new Set(from);
  let frontier = [...from];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of graph.get(id) || []) {
        if (seen.has(edge.otherId)) continue;
        seen.add(edge.otherId);
        cameFrom.set(edge.otherId, { edge, from: id });

        if (edge.otherId === goal) {
          const path: JoinEdge[] = [];
          let cursor = goal;
          while (cameFrom.has(cursor)) {
            const step = cameFrom.get(cursor)!;
            path.unshift(step.edge);
            cursor = step.from;
          }
          return path;
        }
        next.push(edge.otherId);
      }
    }
    frontier = next;
  }
  return null;
}

function aliasFor(name: string, used: Set<string>): string {
  const parts = name.toLowerCase().replace(/[^a-z0-9_]/g, '').split('_').filter(Boolean);
  const base = (parts.length > 1 ? parts.map(part => part[0]).join('') : parts[0]?.slice(0, 1)) || 't';

  let alias = base;
  let suffix = 1;
  while (used.has(alias)) {
    suffix += 1;
    alias = `${base}${suffix}`;
  }
  used.add(alias);
  return alias;
}

/**
 * One SELECT across several tables, joined along their foreign keys.
 *
 * Tables that are only indirectly related are reached through the tables
 * between them; those bridges are joined but not selected from, since the user
 * did not ask for their columns. A selected table with no path to the rest gets
 * its own statement underneath rather than being dropped silently.
 */
export function buildJoinedSelect(
  selected: Entity[],
  allEntities: Entity[],
  relationships: Relationship[],
  options: QueryOptions,
): string {
  if (selected.length === 0) return '-- No tables selected.';
  if (selected.length === 1) return buildTableQuery(selected[0], 'select', options);

  const universe = [...allEntities];
  for (const entity of selected) if (!universe.some(known => known.id === entity.id)) universe.push(entity);
  const byId = new Map(universe.map(entity => [entity.id, entity]));
  const graph = buildGraph(universe, relationships);
  const wanted = new Set(selected.map(entity => entity.id));

  const root = selected[0];
  const joined = new Set<string>([root.id]);
  const order: string[] = [root.id];
  const joinEdges = new Map<string, JoinEdge>();
  const orphans: Entity[] = [];

  for (const entity of selected.slice(1)) {
    if (joined.has(entity.id)) continue;
    const path = pathToGoal(graph, joined, entity.id);
    if (!path) {
      orphans.push(entity);
      continue;
    }
    for (const edge of path) {
      const added = joined.has(edge.sourceId) ? edge.targetId : edge.sourceId;
      if (joined.has(added)) continue;
      joined.add(added);
      order.push(added);
      joinEdges.set(added, edge);
    }
  }

  const used = new Set<string>();
  const alias = new Map<string, string>();
  for (const id of order) alias.set(id, aliasFor(byId.get(id)!.name, used));

  // Two tables both offering "id" would come back as two columns of the same
  // name, which most clients render as one. Only the clashing ones get aliased,
  // so the common case stays uncluttered.
  const selectedIds = order.filter(id => wanted.has(id));
  const nameCounts = new Map<string, number>();
  for (const id of selectedIds) {
    for (const column of byId.get(id)!.columns) {
      nameCounts.set(column.name, (nameCounts.get(column.name) || 0) + 1);
    }
  }

  const selectLines = selectedIds
    .map(id => byId.get(id)!.columns.map(column => {
      const reference = `${alias.get(id)}.${q(column.name, options)}`;
      if ((nameCounts.get(column.name) || 0) < 2) return reference;
      return `${reference} AS ${q(`${alias.get(id)}_${column.name}`, options)}`;
    }).join(', '))
    .filter(Boolean);

  const lines = [`SELECT\n  ${selectLines.join(',\n  ')}`, `FROM ${q(byId.get(root.id)!.name, options)} ${alias.get(root.id)}`];

  for (const id of order.slice(1)) {
    const edge = joinEdges.get(id)!;
    const condition = `${alias.get(edge.sourceId)}.${q(edge.sourceColumn, options)} = ${alias.get(edge.targetId)}.${q(edge.targetColumn, options)}`;
    const bridge = wanted.has(id) ? '' : '  -- bridge, columns not selected';
    lines.push(`JOIN ${q(byId.get(id)!.name, options)} ${alias.get(id)} ON ${condition}${bridge}`);
  }

  const blocks = [`${lines.join('\n')};`];
  for (const entity of orphans) {
    blocks.push(`-- ${q(entity.name, options)} is not related to the other selected tables.\n${buildTableQuery(entity, 'select', options)}`);
  }
  return blocks.join('\n\n');
}

// ── What a copy action produces ──

const DDL_GENERATORS: Record<SqlDialect, (entity: Entity) => string> = {
  mysql: generateMySQL,
  postgresql: generatePostgreSQL,
  sqlserver: generateSQLServer,
};

/** Text for one table, whichever kind of copy was asked for. */
export function buildCopyText(kind: CopyKind, entity: Entity, options: QueryOptions): string {
  if (kind === 'columns') return buildColumnList(entity, options);
  if (kind === 'ddl') return DDL_GENERATORS[options.dialect](entity);
  return buildTableQuery(entity, kind, options);
}

/**
 * Text for several tables at once.
 *
 * Only SELECT is worth joining — the other kinds act on one table at a time, so
 * they come out as separate statements in the order the tables were selected.
 */
export function buildMultiCopyText(
  kind: CopyKind,
  selected: Entity[],
  allEntities: Entity[],
  relationships: Relationship[],
  options: QueryOptions,
): string {
  if (selected.length === 0) return '-- No tables selected.';
  if (kind === 'select') return buildJoinedSelect(selected, allEntities, relationships, options);

  return selected
    .map(entity => {
      // A bare list of names says nothing about which table it came from.
      if (kind === 'columns') return `-- ${q(entity.name, options)}\n${buildColumnList(entity, options)}`;
      return buildCopyText(kind, entity, options);
    })
    .join('\n\n');
}
