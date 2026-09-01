export const ERD_MIGRATION_DIALECTS = ['postgresql', 'mysql', 'sqlserver'] as const;
export type ErdMigrationDialect = (typeof ERD_MIGRATION_DIALECTS)[number];
export type ErdMigrationRisk = 'safe' | 'caution' | 'breaking';
export type ErdMigrationPhase = 'drop-relations' | 'drop-supporting' | 'rename' | 'create-tables' | 'alter-columns' | 'add-supporting' | 'add-relations' | 'drop-objects';

export type ErdMigrationColumn = {
  id: string;
  name: string;
  type: string;
  is_pk?: boolean;
  isPk?: boolean;
  is_nullable?: boolean;
  isNullable?: boolean;
  is_unique?: boolean;
  isUnique?: boolean;
  default_value?: unknown;
  defaultValue?: unknown;
  max_length?: number | null;
  maxLength?: number | null;
  numeric_precision?: number | null;
  numericPrecision?: number | null;
  numeric_scale?: number | null;
  numericScale?: number | null;
};

export type ErdMigrationTable = {
  id: string;
  name: string;
  columns?: ErdMigrationColumn[];
  indexes?: ErdMigrationIndex[];
  constraints?: ErdMigrationConstraint[];
};

export type ErdMigrationIndex = {
  id: string;
  name: string;
  column_ids?: string[];
  columnIds?: string[];
  is_unique?: boolean;
  isUnique?: boolean;
  algorithm?: string | null;
};

export type ErdMigrationConstraint = {
  id: string;
  kind: 'primary_key' | 'unique' | 'check';
  name?: string | null;
  column_ids?: string[];
  columnIds?: string[];
  expression?: string | null;
};

export type ErdMigrationRelationship = {
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
  on_delete?: string | null;
  onDelete?: string | null;
  on_update?: string | null;
  onUpdate?: string | null;
  source_cardinality?: string | null;
  sourceCardinality?: string | null;
  target_cardinality?: string | null;
  targetCardinality?: string | null;
};

export type ErdMigrationSchema = { tables: ErdMigrationTable[]; relationships: ErdMigrationRelationship[] };

export type ErdMigrationStep = {
  id: string;
  phase: ErdMigrationPhase;
  kind: 'table' | 'column' | 'relationship' | 'index' | 'constraint';
  risk: ErdMigrationRisk;
  title: string;
  object: string;
  reversible: boolean;
  affected_table_ids: string[];
  affected_relationship_ids: string[];
  warnings: string[];
  forward: Record<ErdMigrationDialect, string>;
  rollback: Record<ErdMigrationDialect, string>;
};

export type ErdMigrationPlan = {
  steps: ErdMigrationStep[];
  summary: { total: number; safe: number; caution: number; breaking: number; reversible: number };
  sql: Record<ErdMigrationDialect, { forward: string; rollback: string }>;
  warnings: string[];
};

const value = (input: unknown) => String(input ?? '');
const lower = (input: unknown) => value(input).trim().toLowerCase();
const sourceTableId = (item: ErdMigrationRelationship) => value(item.source_entity_id ?? item.sourceEntityId);
const targetTableId = (item: ErdMigrationRelationship) => value(item.target_entity_id ?? item.targetEntityId);
const sourceColumnId = (item: ErdMigrationRelationship) => value(item.source_column_id ?? item.sourceColumnId);
const targetColumnId = (item: ErdMigrationRelationship) => value(item.target_column_id ?? item.targetColumnId);
const constraintName = (item: ErdMigrationRelationship) => value(item.constraint_name ?? item.constraintName);
const onDelete = (item: ErdMigrationRelationship) => value(item.on_delete ?? item.onDelete).toUpperCase();
const onUpdate = (item: ErdMigrationRelationship) => value(item.on_update ?? item.onUpdate).toUpperCase();
const sourceCardinality = (item: ErdMigrationRelationship) => value(item.source_cardinality ?? item.sourceCardinality);
const targetCardinality = (item: ErdMigrationRelationship) => value(item.target_cardinality ?? item.targetCardinality);
const isPk = (column: ErdMigrationColumn) => Boolean(column.is_pk ?? column.isPk);
const isNullable = (column: ErdMigrationColumn) => column.is_nullable ?? column.isNullable ?? true;
const isUnique = (column: ErdMigrationColumn) => Boolean(column.is_unique ?? column.isUnique);
const defaultValue = (column: ErdMigrationColumn) => column.default_value ?? column.defaultValue ?? null;
const maxLength = (column: ErdMigrationColumn) => column.max_length ?? column.maxLength ?? null;
const precision = (column: ErdMigrationColumn) => column.numeric_precision ?? column.numericPrecision ?? null;
const scale = (column: ErdMigrationColumn) => column.numeric_scale ?? column.numericScale ?? null;
const metadataColumnIds = (item: ErdMigrationIndex | ErdMigrationConstraint) => item.column_ids ?? item.columnIds ?? [];
const indexIsUnique = (item: ErdMigrationIndex) => Boolean(item.is_unique ?? item.isUnique);

function quote(identifier: string, dialect: ErdMigrationDialect) {
  if (dialect === 'sqlserver') return `[${identifier.replace(/]/g, ']]')}]`;
  const token = dialect === 'mysql' ? '`' : '"';
  return `${token}${identifier.replaceAll(token, token + token)}${token}`;
}

function typeSql(column: ErdMigrationColumn, dialect: ErdMigrationDialect) {
  const raw = column.type.trim().toUpperCase();
  const base = raw.replace(/\(.*/, '');
  const length = maxLength(column);
  const numericPrecision = precision(column);
  const numericScale = scale(column);
  const inlineSize = raw.match(/\(([^)]+)\)/)?.[1];
  if (['VARCHAR', 'CHAR'].includes(base) && (length || inlineSize)) {
    const name = dialect === 'sqlserver' ? `N${base}` : base;
    return `${name}(${length || inlineSize})`;
  }
  if (['DECIMAL', 'NUMERIC'].includes(base) && numericPrecision) return `${base}(${numericPrecision}${numericScale !== null ? `,${numericScale}` : ''})`;
  const aliases: Record<ErdMigrationDialect, Record<string, string>> = {
    postgresql: { INT: 'INTEGER', DATETIME: 'TIMESTAMP', BOOL: 'BOOLEAN', LONGTEXT: 'TEXT', JSON: 'JSONB', FLOAT: 'REAL' },
    mysql: { INTEGER: 'INT', BOOL: 'TINYINT(1)', BOOLEAN: 'TINYINT(1)', JSONB: 'JSON', UUID: 'CHAR(36)', 'DOUBLE PRECISION': 'DOUBLE' },
    sqlserver: { INTEGER: 'INT', BOOL: 'BIT', BOOLEAN: 'BIT', TEXT: 'NVARCHAR(MAX)', LONGTEXT: 'NVARCHAR(MAX)', JSON: 'NVARCHAR(MAX)', JSONB: 'NVARCHAR(MAX)', UUID: 'UNIQUEIDENTIFIER', TIMESTAMP: 'DATETIME2', DATETIME: 'DATETIME2', 'DOUBLE PRECISION': 'FLOAT' },
  };
  return aliases[dialect][base] || raw;
}

function columnDefinition(column: ErdMigrationColumn, dialect: ErdMigrationDialect, includeName = true, includeKeys = true) {
  const pieces = [includeName ? quote(column.name, dialect) : '', typeSql(column, dialect)];
  if (dialect === 'sqlserver' && isPk(column) && ['INT', 'BIGINT'].includes(typeSql(column, dialect))) pieces.push('IDENTITY(1,1)');
  pieces.push(isNullable(column) ? 'NULL' : 'NOT NULL');
  const defaultSql = defaultValue(column);
  if (defaultSql !== null && value(defaultSql).trim()) {
    const rawDefault = value(defaultSql).trim();
    const compatibleDefault = dialect === 'sqlserver'
      ? /^now\(\)$|^current_timestamp$/i.test(rawDefault) ? 'SYSUTCDATETIME()' : /^true$/i.test(rawDefault) ? '1' : /^false$/i.test(rawDefault) ? '0' : rawDefault
      : rawDefault;
    pieces.push(`DEFAULT ${compatibleDefault}`);
  }
  if (includeKeys && isUnique(column) && !isPk(column)) pieces.push('UNIQUE');
  if (includeKeys && isPk(column)) pieces.push('PRIMARY KEY');
  return pieces.filter(Boolean).join(' ');
}

function tableCreate(table: ErdMigrationTable, dialect: ErdMigrationDialect) {
  const columns = (table.columns || []).map(column => `  ${columnDefinition(column, dialect)}`).join(',\n');
  return `CREATE TABLE ${quote(table.name, dialect)} (\n${columns || '  -- Add columns before executing'}\n);`;
}

function tableMap(schema: ErdMigrationSchema) {
  return new Map(schema.tables.map(table => [value(table.id), table]));
}

function columnById(table: ErdMigrationTable | undefined, id: string) {
  return table?.columns?.find(column => value(column.id) === id);
}

function relationEndpoint(item: ErdMigrationRelationship, schema: ErdMigrationSchema) {
  const tables = tableMap(schema);
  const sourceTable = tables.get(sourceTableId(item));
  const targetTable = tables.get(targetTableId(item));
  const sourceColumn = columnById(sourceTable, sourceColumnId(item));
  const targetColumn = columnById(targetTable, targetColumnId(item));
  if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) return null;
  return { sourceTable, targetTable, sourceColumn, targetColumn };
}

function relationSignature(item: ErdMigrationRelationship, schema: ErdMigrationSchema) {
  const endpoint = relationEndpoint(item, schema);
  return endpoint
    ? `${lower(endpoint.sourceTable.name)}.${lower(endpoint.sourceColumn.name)}>${lower(endpoint.targetTable.name)}.${lower(endpoint.targetColumn.name)}`
    : null;
}

function relationSql(item: ErdMigrationRelationship, schema: ErdMigrationSchema, dialect: ErdMigrationDialect) {
  const endpoint = relationEndpoint(item, schema);
  if (!endpoint) return null;
  const name = constraintName(item) || `fk_${endpoint.sourceTable.name}_${endpoint.sourceColumn.name}`.toLowerCase();
  const action = (actionValue: string, keyword: string) => {
    const compatible = dialect === 'sqlserver' && actionValue === 'RESTRICT' ? 'NO ACTION' : actionValue;
    return compatible && compatible !== 'NO ACTION' ? ` ON ${keyword} ${compatible}` : '';
  };
  return {
    name,
    add: `ALTER TABLE ${quote(endpoint.sourceTable.name, dialect)} ADD CONSTRAINT ${quote(name, dialect)} FOREIGN KEY (${quote(endpoint.sourceColumn.name, dialect)}) REFERENCES ${quote(endpoint.targetTable.name, dialect)} (${quote(endpoint.targetColumn.name, dialect)})${action(onDelete(item), 'DELETE')}${action(onUpdate(item), 'UPDATE')};`,
    drop: dialect === 'mysql'
      ? `ALTER TABLE ${quote(endpoint.sourceTable.name, dialect)} DROP FOREIGN KEY ${quote(name, dialect)};`
      : dialect === 'sqlserver'
        ? `ALTER TABLE ${quote(endpoint.sourceTable.name, dialect)} DROP CONSTRAINT ${quote(name, dialect)};`
        : `ALTER TABLE ${quote(endpoint.sourceTable.name, dialect)} DROP CONSTRAINT IF EXISTS ${quote(name, dialect)};`,
    object: `${endpoint.sourceTable.name}.${endpoint.sourceColumn.name} → ${endpoint.targetTable.name}.${endpoint.targetColumn.name}`,
  };
}

function pairByStableIdThenName<T extends { id: string; name: string }>(before: T[], after: T[]) {
  const pairs: Array<{ before: T; after: T }> = [];
  const usedBefore = new Set<T>();
  const usedAfter = new Set<T>();
  const afterById = new Map(after.filter(item => value(item.id)).map(item => [value(item.id), item]));
  for (const oldItem of before) {
    const match = value(oldItem.id) ? afterById.get(value(oldItem.id)) : undefined;
    if (match) { pairs.push({ before: oldItem, after: match }); usedBefore.add(oldItem); usedAfter.add(match); }
  }
  for (const oldItem of before) {
    if (usedBefore.has(oldItem)) continue;
    const match = after.find(item => !usedAfter.has(item) && lower(item.name) === lower(oldItem.name));
    if (match) { pairs.push({ before: oldItem, after: match }); usedBefore.add(oldItem); usedAfter.add(match); }
  }
  return {
    pairs,
    removed: before.filter(item => !usedBefore.has(item)),
    added: after.filter(item => !usedAfter.has(item)),
  };
}

function pairSupporting<T extends { id: string }>(before: T[], after: T[], signature: (item: T) => string) {
  const pairs: Array<{ before: T; after: T }> = [];
  const usedBefore = new Set<T>();
  const usedAfter = new Set<T>();
  for (const oldItem of before) {
    const match = value(oldItem.id) ? after.find(item => value(item.id) === value(oldItem.id)) : undefined;
    if (match) { pairs.push({ before: oldItem, after: match }); usedBefore.add(oldItem); usedAfter.add(match); }
  }
  for (const oldItem of before) {
    if (usedBefore.has(oldItem)) continue;
    const match = after.find(item => !usedAfter.has(item) && signature(item) === signature(oldItem));
    if (match) { pairs.push({ before: oldItem, after: match }); usedBefore.add(oldItem); usedAfter.add(match); }
  }
  return { pairs, removed: before.filter(item => !usedBefore.has(item)), added: after.filter(item => !usedAfter.has(item)) };
}

const phaseOrder: Record<ErdMigrationPhase, number> = {
  'drop-relations': 0, 'drop-supporting': 1, rename: 2, 'create-tables': 3, 'alter-columns': 4, 'add-supporting': 5, 'add-relations': 6, 'drop-objects': 7,
};

function step(input: ErdMigrationStep) {
  return input;
}

function columnChanged(before: ErdMigrationColumn, after: ErdMigrationColumn) {
  return lower(before.type) !== lower(after.type)
    || maxLength(before) !== maxLength(after)
    || precision(before) !== precision(after)
    || scale(before) !== scale(after)
    || isNullable(before) !== isNullable(after)
    || isUnique(before) !== isUnique(after)
    || isPk(before) !== isPk(after)
    || value(defaultValue(before)) !== value(defaultValue(after));
}

function metadataNames(table: ErdMigrationTable, ids: string[]) {
  return ids.map(id => columnById(table, value(id))?.name).filter((name): name is string => Boolean(name));
}

function indexSql(table: ErdMigrationTable, index: ErdMigrationIndex, dialect: ErdMigrationDialect) {
  const columns = metadataNames(table, metadataColumnIds(index));
  if (!columns.length) return null;
  if (columns.length === 1 && indexIsUnique(index)
    && (table.columns || []).some(column => column.name === columns[0] && isUnique(column))
    && String(index.name || '').startsWith('unique:')) return null;
  const name = index.name || `${table.name}_${columns.join('_')}_idx`;
  const unique = indexIsUnique(index) ? 'UNIQUE ' : '';
  return {
    object: `${table.name}.${name}`,
    add: `CREATE ${unique}INDEX ${quote(name, dialect)} ON ${quote(table.name, dialect)} (${columns.map(column => quote(column, dialect)).join(', ')});`,
    drop: dialect === 'mysql' || dialect === 'sqlserver'
      ? `DROP INDEX ${quote(name, dialect)} ON ${quote(table.name, dialect)};`
      : `DROP INDEX IF EXISTS ${quote(name, dialect)};`,
  };
}

function constraintSql(table: ErdMigrationTable, constraint: ErdMigrationConstraint, dialect: ErdMigrationDialect) {
  const columns = metadataNames(table, metadataColumnIds(constraint));
  if (constraint.kind !== 'check' && !columns.length) return null;
  if (columns.length === 1) {
    const column = (table.columns || []).find(item => item.name === columns[0]);
    if ((constraint.kind === 'primary_key' && column && isPk(column)) || (constraint.kind === 'unique' && column && isUnique(column))) return null;
  }
  const name = constraint.name || `${table.name}_${constraint.kind}_${columns.join('_') || 'check'}`;
  const tableName = quote(table.name, dialect);
  const addBody = constraint.kind === 'primary_key'
    ? `PRIMARY KEY (${columns.map(column => quote(column, dialect)).join(', ')})`
    : constraint.kind === 'unique'
      ? `UNIQUE (${columns.map(column => quote(column, dialect)).join(', ')})`
      : `CHECK (${constraint.expression || '/* expression required */'})`;
  const drop = dialect === 'mysql'
    ? constraint.kind === 'primary_key'
      ? `ALTER TABLE ${tableName} DROP PRIMARY KEY;`
      : constraint.kind === 'unique'
        ? `ALTER TABLE ${tableName} DROP INDEX ${quote(name, dialect)};`
        : `ALTER TABLE ${tableName} DROP CHECK ${quote(name, dialect)};`
    : dialect === 'sqlserver'
      ? `ALTER TABLE ${tableName} DROP CONSTRAINT ${quote(name, dialect)};`
      : `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${quote(name, dialect)};`;
  return { object: `${table.name}.${name}`, add: `ALTER TABLE ${tableName} ADD CONSTRAINT ${quote(name, dialect)} ${addBody};`, drop };
}

function supportingKey(item: ErdMigrationIndex | ErdMigrationConstraint, fallback: string) {
  return value(item.id) || lower('name' in item ? item.name : '') || fallback;
}

function supportingChanged(before: ErdMigrationIndex | ErdMigrationConstraint, after: ErdMigrationIndex | ErdMigrationConstraint) {
  return JSON.stringify({
    name: 'name' in before ? before.name || null : null,
    columns: metadataColumnIds(before).map(value),
    unique: 'is_unique' in before || 'isUnique' in before ? indexIsUnique(before as ErdMigrationIndex) : undefined,
    algorithm: 'algorithm' in before ? before.algorithm || null : undefined,
    kind: 'kind' in before ? before.kind : undefined,
    expression: 'expression' in before ? before.expression || null : undefined,
  }) !== JSON.stringify({
    name: 'name' in after ? after.name || null : null,
    columns: metadataColumnIds(after).map(value),
    unique: 'is_unique' in after || 'isUnique' in after ? indexIsUnique(after as ErdMigrationIndex) : undefined,
    algorithm: 'algorithm' in after ? after.algorithm || null : undefined,
    kind: 'kind' in after ? after.kind : undefined,
    expression: 'expression' in after ? after.expression || null : undefined,
  });
}

function columnAlterSql(tableName: string, before: ErdMigrationColumn, after: ErdMigrationColumn, dialect: ErdMigrationDialect) {
  const table = quote(tableName, dialect);
  const oldName = quote(before.name, dialect);
  const newName = quote(after.name, dialect);
  if (dialect === 'mysql') {
    const statements: string[] = [];
    if (isPk(before) && !isPk(after)) statements.push(`ALTER TABLE ${table} DROP PRIMARY KEY;`);
    if (isUnique(before) && !isUnique(after)) statements.push(`ALTER TABLE ${table} DROP INDEX ${oldName};`);
    const keyword = before.name !== after.name
      ? `CHANGE COLUMN ${oldName} ${columnDefinition(after, dialect, true, false)}`
      : `MODIFY COLUMN ${columnDefinition(after, dialect, true, false)}`;
    statements.push(`ALTER TABLE ${table} ${keyword};`);
    if (!isPk(before) && isPk(after)) statements.push(`ALTER TABLE ${table} ADD PRIMARY KEY (${newName});`);
    if (!isUnique(before) && isUnique(after)) statements.push(`ALTER TABLE ${table} ADD CONSTRAINT ${quote(`${tableName}_${after.name}_key`, dialect)} UNIQUE (${newName});`);
    return statements.join('\n');
  }
  if (dialect === 'sqlserver') {
    const statements: string[] = [];
    if (before.name !== after.name) statements.push(`EXEC sp_rename N'${tableName.replace(/'/g, "''")}.${before.name.replace(/'/g, "''")}', N'${after.name.replace(/'/g, "''")}', 'COLUMN';`);
    const definitionChanged = lower(before.type) !== lower(after.type) || maxLength(before) !== maxLength(after)
      || precision(before) !== precision(after) || scale(before) !== scale(after) || isNullable(before) !== isNullable(after);
    if (definitionChanged) statements.push(`ALTER TABLE ${table} ALTER COLUMN ${newName} ${typeSql(after, dialect)} ${isNullable(after) ? 'NULL' : 'NOT NULL'};`);
    if (value(defaultValue(before)) !== value(defaultValue(after))) {
      statements.push(`-- Review/drop the existing SQL Server default constraint for ${newName} before changing its default.`);
      const nextDefault = defaultValue(after);
      if (nextDefault !== null && value(nextDefault).trim()) statements.push(`ALTER TABLE ${table} ADD DEFAULT ${value(nextDefault).trim()} FOR ${newName};`);
    }
    if (isUnique(before) !== isUnique(after)) {
      const name = quote(`${tableName}_${after.name}_key`, dialect);
      statements.push(isUnique(after) ? `ALTER TABLE ${table} ADD CONSTRAINT ${name} UNIQUE (${newName});` : `ALTER TABLE ${table} DROP CONSTRAINT ${name};`);
    }
    if (isPk(before) !== isPk(after)) {
      const name = quote(`${tableName}_pkey`, dialect);
      statements.push(isPk(after) ? `ALTER TABLE ${table} ADD CONSTRAINT ${name} PRIMARY KEY (${newName});` : `ALTER TABLE ${table} DROP CONSTRAINT ${name};`);
    }
    return statements.join('\n');
  }
  const statements: string[] = [];
  if (before.name !== after.name) statements.push(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName};`);
  if (lower(before.type) !== lower(after.type) || maxLength(before) !== maxLength(after) || precision(before) !== precision(after) || scale(before) !== scale(after)) {
    statements.push(`ALTER TABLE ${table} ALTER COLUMN ${newName} TYPE ${typeSql(after, dialect)} USING ${newName}::${typeSql(after, dialect)};`);
  }
  if (isNullable(before) !== isNullable(after)) statements.push(`ALTER TABLE ${table} ALTER COLUMN ${newName} ${isNullable(after) ? 'DROP' : 'SET'} NOT NULL;`);
  if (value(defaultValue(before)) !== value(defaultValue(after))) {
    const nextDefault = defaultValue(after);
    statements.push(`ALTER TABLE ${table} ALTER COLUMN ${newName} ${nextDefault === null || !value(nextDefault).trim() ? 'DROP DEFAULT' : `SET DEFAULT ${value(nextDefault).trim()}`};`);
  }
  if (isUnique(before) !== isUnique(after)) {
    const name = quote(`${tableName}_${after.name}_key`, dialect);
    statements.push(isUnique(after)
      ? `ALTER TABLE ${table} ADD CONSTRAINT ${name} UNIQUE (${newName});`
      : `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name};`);
  }
  if (isPk(before) !== isPk(after)) {
    const name = quote(`${tableName}_pkey`, dialect);
    statements.push(isPk(after)
      ? `ALTER TABLE ${table} ADD CONSTRAINT ${name} PRIMARY KEY (${newName});`
      : `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name};`);
  }
  return statements.join('\n');
}

function migrationSql(steps: ErdMigrationStep[], dialect: ErdMigrationDialect, direction: 'forward' | 'rollback') {
  const ordered = direction === 'forward' ? steps : [...steps].reverse();
  const title = direction === 'forward' ? 'Forward migration' : 'Rollback migration';
  const lines = [`-- ${title} generated by ERD Builder Pro`, '-- Review on a staging database before production.', ''];
  for (const item of ordered) {
    const sql = item[direction][dialect];
    if (!sql.trim()) continue;
    lines.push(`-- [${item.risk.toUpperCase()}] ${item.title}`, ...item.warnings.map(warning => `-- WARNING: ${warning}`), sql, '');
  }
  return lines.join('\n').trim();
}

export function planErdMigration(before: ErdMigrationSchema, after: ErdMigrationSchema): ErdMigrationPlan {
  const steps: ErdMigrationStep[] = [];
  const tablePairs = pairByStableIdThenName(before.tables, after.tables);
  let possibleRename = tablePairs.removed.length > 0 && tablePairs.added.length > 0;
  const pushIndexStep = (table: ErdMigrationTable, index: ErdMigrationIndex, action: 'add' | 'drop', temporary = false) => {
    const pg = indexSql(table, index, 'postgresql');
    const mysql = indexSql(table, index, 'mysql');
    const sqlserver = indexSql(table, index, 'sqlserver');
    if (!pg || !mysql || !sqlserver) return;
    const risk: ErdMigrationRisk = action === 'add'
      ? indexIsUnique(index) ? 'caution' : 'safe'
      : temporary ? 'caution' : indexIsUnique(index) ? 'breaking' : 'caution';
    steps.push(step({
      id: `${action}-index:${table.id}:${supportingKey(index, pg.object)}`,
      phase: action === 'add' ? 'add-supporting' : 'drop-supporting', kind: 'index', risk,
      title: `${action === 'add' ? 'Create' : temporary ? 'Temporarily drop' : 'Drop'} ${indexIsUnique(index) ? 'unique ' : ''}index`,
      object: pg.object, reversible: true, affected_table_ids: [value(table.id)], affected_relationship_ids: [],
      warnings: indexIsUnique(index) && action === 'add' ? ['Existing duplicate values will prevent unique index creation.'] : [],
      forward: { postgresql: action === 'add' ? pg.add : pg.drop, mysql: action === 'add' ? mysql.add : mysql.drop, sqlserver: action === 'add' ? sqlserver.add : sqlserver.drop },
      rollback: { postgresql: action === 'add' ? pg.drop : pg.add, mysql: action === 'add' ? mysql.drop : mysql.add, sqlserver: action === 'add' ? sqlserver.drop : sqlserver.add },
    }));
  };
  const pushConstraintStep = (table: ErdMigrationTable, constraint: ErdMigrationConstraint, action: 'add' | 'drop', temporary = false) => {
    const pg = constraintSql(table, constraint, 'postgresql');
    const mysql = constraintSql(table, constraint, 'mysql');
    const sqlserver = constraintSql(table, constraint, 'sqlserver');
    if (!pg || !mysql || !sqlserver) return;
    const risk: ErdMigrationRisk = action === 'add' ? 'caution' : temporary ? 'caution' : 'breaking';
    steps.push(step({
      id: `${action}-constraint:${table.id}:${supportingKey(constraint, pg.object)}`,
      phase: action === 'add' ? 'add-supporting' : 'drop-supporting', kind: 'constraint', risk,
      title: `${action === 'add' ? 'Add' : temporary ? 'Temporarily drop' : 'Drop'} ${constraint.kind.replace('_', ' ')} constraint`,
      object: pg.object, reversible: true, affected_table_ids: [value(table.id)], affected_relationship_ids: [],
      warnings: action === 'add' ? ['Validate existing rows before adding this constraint.'] : [],
      forward: { postgresql: action === 'add' ? pg.add : pg.drop, mysql: action === 'add' ? mysql.add : mysql.drop, sqlserver: action === 'add' ? sqlserver.add : sqlserver.drop },
      rollback: { postgresql: action === 'add' ? pg.drop : pg.add, mysql: action === 'add' ? mysql.drop : mysql.add, sqlserver: action === 'add' ? sqlserver.drop : sqlserver.add },
    }));
  };
  const disruptiveBeforeColumns = new Set<string>();
  const disruptiveAfterColumns = new Set<string>();
  for (const pair of tablePairs.pairs) {
    const columns = pairByStableIdThenName(pair.before.columns || [], pair.after.columns || []);
    if (columns.removed.length > 0 && columns.added.length > 0) possibleRename = true;
    for (const columnPair of columns.pairs) {
      const disruptsConstraint = lower(columnPair.before.type) !== lower(columnPair.after.type)
        || maxLength(columnPair.before) !== maxLength(columnPair.after)
        || precision(columnPair.before) !== precision(columnPair.after)
        || scale(columnPair.before) !== scale(columnPair.after)
        || isPk(columnPair.before) !== isPk(columnPair.after)
        || isUnique(columnPair.before) !== isUnique(columnPair.after);
      if (disruptsConstraint) {
        disruptiveBeforeColumns.add(`${value(pair.before.id)}:${value(columnPair.before.id)}`);
        disruptiveAfterColumns.add(`${value(pair.after.id)}:${value(columnPair.after.id)}`);
      }
    }
  }

  const beforeRelationsById = new Map(before.relationships.map(item => [value(item.id), item]));
  const matchedBeforeRelations = new Set<ErdMigrationRelationship>();
  const matchedAfterRelations = new Set<ErdMigrationRelationship>();
  const relationPairs: Array<{ before: ErdMigrationRelationship; after: ErdMigrationRelationship }> = [];
  for (const next of after.relationships) {
    const stable = value(next.id) ? beforeRelationsById.get(value(next.id)) : undefined;
    const old = stable || before.relationships.find(item => !matchedBeforeRelations.has(item) && relationSignature(item, before) === relationSignature(next, after));
    if (old) { relationPairs.push({ before: old, after: next }); matchedBeforeRelations.add(old); matchedAfterRelations.add(next); }
  }
  const removedRelations = before.relationships.filter(item => !matchedBeforeRelations.has(item));
  const addedRelations = after.relationships.filter(item => !matchedAfterRelations.has(item));
  const modifiedRelations = relationPairs.filter(pair => constraintName(pair.before) !== constraintName(pair.after)
    || onDelete(pair.before) !== onDelete(pair.after) || onUpdate(pair.before) !== onUpdate(pair.after)
    || sourceCardinality(pair.before) !== sourceCardinality(pair.after) || targetCardinality(pair.before) !== targetCardinality(pair.after)
    || disruptiveBeforeColumns.has(`${sourceTableId(pair.before)}:${sourceColumnId(pair.before)}`)
    || disruptiveBeforeColumns.has(`${targetTableId(pair.before)}:${targetColumnId(pair.before)}`)
    || disruptiveAfterColumns.has(`${sourceTableId(pair.after)}:${sourceColumnId(pair.after)}`)
    || disruptiveAfterColumns.has(`${targetTableId(pair.after)}:${targetColumnId(pair.after)}`));

  for (const entry of [
    ...removedRelations.map(relation => ({ relation, temporary: false })),
    ...modifiedRelations.map(pair => ({ relation: pair.before, temporary: true })),
  ]) {
    const { relation, temporary } = entry;
    const pg = relationSql(relation, before, 'postgresql');
    const mysql = relationSql(relation, before, 'mysql');
    const sqlserver = relationSql(relation, before, 'sqlserver');
    if (!pg || !mysql || !sqlserver) continue;
    steps.push(step({
      id: `drop-relation:${value(relation.id) || relationSignature(relation, before)}`, phase: 'drop-relations', kind: 'relationship', risk: temporary ? 'caution' : 'breaking',
      title: temporary ? 'Temporarily drop foreign key' : 'Drop foreign key', object: pg.object, reversible: true,
      affected_table_ids: [sourceTableId(relation), targetTableId(relation)], affected_relationship_ids: [value(relation.id)],
      warnings: [temporary
        ? 'Keep the constraint-free window inside one controlled migration and recreate the key after alteration.'
        : 'Application writes can violate referential integrity after this constraint is removed.'],
      forward: { postgresql: pg.drop, mysql: mysql.drop, sqlserver: sqlserver.drop }, rollback: { postgresql: pg.add, mysql: mysql.add, sqlserver: sqlserver.add },
    }));
  }

  for (const pair of tablePairs.pairs) {
    if (pair.before.name !== pair.after.name) {
      steps.push(step({
        id: `rename-table:${pair.before.id}`, phase: 'rename', kind: 'table', risk: 'caution', title: 'Rename table', object: `${pair.before.name} → ${pair.after.name}`, reversible: true,
        affected_table_ids: [value(pair.after.id)], affected_relationship_ids: [],
        warnings: ['Coordinate ORM models, raw queries, views, triggers, and external consumers.'],
        forward: {
          postgresql: `ALTER TABLE ${quote(pair.before.name, 'postgresql')} RENAME TO ${quote(pair.after.name, 'postgresql')};`,
          mysql: `RENAME TABLE ${quote(pair.before.name, 'mysql')} TO ${quote(pair.after.name, 'mysql')};`,
          sqlserver: `EXEC sp_rename N'${pair.before.name.replace(/'/g, "''")}', N'${pair.after.name.replace(/'/g, "''")}';`,
        },
        rollback: {
          postgresql: `ALTER TABLE ${quote(pair.after.name, 'postgresql')} RENAME TO ${quote(pair.before.name, 'postgresql')};`,
          mysql: `RENAME TABLE ${quote(pair.after.name, 'mysql')} TO ${quote(pair.before.name, 'mysql')};`,
          sqlserver: `EXEC sp_rename N'${pair.after.name.replace(/'/g, "''")}', N'${pair.before.name.replace(/'/g, "''")}';`,
        },
      }));
    }
  }

  for (const table of tablePairs.added) {
    steps.push(step({
      id: `create-table:${table.id}`, phase: 'create-tables', kind: 'table', risk: 'safe', title: 'Create table', object: table.name, reversible: true,
      affected_table_ids: [value(table.id)], affected_relationship_ids: [],
      warnings: ['Rollback drops the new table and any data inserted after migration.'],
      forward: { postgresql: tableCreate(table, 'postgresql'), mysql: tableCreate(table, 'mysql'), sqlserver: tableCreate(table, 'sqlserver') },
      rollback: { postgresql: `DROP TABLE ${quote(table.name, 'postgresql')};`, mysql: `DROP TABLE ${quote(table.name, 'mysql')};`, sqlserver: `DROP TABLE ${quote(table.name, 'sqlserver')};` },
    }));
    for (const index of table.indexes || []) pushIndexStep(table, index, 'add');
    for (const constraint of table.constraints || []) pushConstraintStep(table, constraint, 'add');
  }

  for (const pair of tablePairs.pairs) {
    const indexes = pairSupporting(pair.before.indexes || [], pair.after.indexes || [], item => lower(item.name));
    for (const index of indexes.removed) pushIndexStep(pair.before, index, 'drop');
    for (const indexPair of indexes.pairs.filter(item => supportingChanged(item.before, item.after))) {
      pushIndexStep(pair.before, indexPair.before, 'drop', true);
      pushIndexStep(pair.after, indexPair.after, 'add');
    }
    for (const index of indexes.added) pushIndexStep(pair.after, index, 'add');

    const constraintSignature = (item: ErdMigrationConstraint) => lower(item.name) || `${item.kind}:${metadataColumnIds(item).map(value).join(',')}`;
    const constraints = pairSupporting(pair.before.constraints || [], pair.after.constraints || [], constraintSignature);
    for (const constraint of constraints.removed) pushConstraintStep(pair.before, constraint, 'drop');
    for (const constraintPair of constraints.pairs.filter(item => supportingChanged(item.before, item.after))) {
      pushConstraintStep(pair.before, constraintPair.before, 'drop', true);
      pushConstraintStep(pair.after, constraintPair.after, 'add');
    }
    for (const constraint of constraints.added) pushConstraintStep(pair.after, constraint, 'add');

    const columns = pairByStableIdThenName(pair.before.columns || [], pair.after.columns || []);
    for (const column of columns.added) {
      const risk: ErdMigrationRisk = !isNullable(column) && (defaultValue(column) === null || !value(defaultValue(column)).trim()) ? 'breaking' : 'safe';
      steps.push(step({
        id: `add-column:${pair.after.id}:${column.id}`, phase: 'alter-columns', kind: 'column', risk, title: 'Add column', object: `${pair.after.name}.${column.name}`, reversible: true,
        affected_table_ids: [value(pair.after.id)], affected_relationship_ids: [],
        warnings: risk === 'breaking' ? ['Existing rows need a backfill or default before adding a required column.'] : [],
        forward: {
          postgresql: `ALTER TABLE ${quote(pair.after.name, 'postgresql')} ADD COLUMN ${columnDefinition(column, 'postgresql')};`,
          mysql: `ALTER TABLE ${quote(pair.after.name, 'mysql')} ADD COLUMN ${columnDefinition(column, 'mysql')};`,
          sqlserver: `ALTER TABLE ${quote(pair.after.name, 'sqlserver')} ADD ${columnDefinition(column, 'sqlserver')};`,
        },
        rollback: {
          postgresql: `ALTER TABLE ${quote(pair.after.name, 'postgresql')} DROP COLUMN ${quote(column.name, 'postgresql')};`,
          mysql: `ALTER TABLE ${quote(pair.after.name, 'mysql')} DROP COLUMN ${quote(column.name, 'mysql')};`,
          sqlserver: `ALTER TABLE ${quote(pair.after.name, 'sqlserver')} DROP COLUMN ${quote(column.name, 'sqlserver')};`,
        },
      }));
    }
    for (const columnPair of columns.pairs.filter(item => item.before.name !== item.after.name || columnChanged(item.before, item.after))) {
      const typeChanged = lower(columnPair.before.type) !== lower(columnPair.after.type) || maxLength(columnPair.before) !== maxLength(columnPair.after)
        || precision(columnPair.before) !== precision(columnPair.after) || scale(columnPair.before) !== scale(columnPair.after);
      const becomesRequired = isNullable(columnPair.before) && !isNullable(columnPair.after);
      const removesKey = (isPk(columnPair.before) && !isPk(columnPair.after)) || (isUnique(columnPair.before) && !isUnique(columnPair.after));
      const risk: ErdMigrationRisk = typeChanged || becomesRequired || removesKey ? 'breaking' : columnPair.before.name !== columnPair.after.name ? 'caution' : 'safe';
      const warnings = [
        ...(typeChanged ? ['Type conversion can fail or truncate data; validate castability first.'] : []),
        ...(becomesRequired ? ['Backfill existing NULL values before SET NOT NULL.'] : []),
        ...(columnPair.before.name !== columnPair.after.name ? ['Deploy application compatibility for both column names when zero downtime is required.'] : []),
      ];
      steps.push(step({
        id: `alter-column:${pair.after.id}:${columnPair.after.id}`, phase: columnPair.before.name !== columnPair.after.name ? 'rename' : 'alter-columns', kind: 'column', risk,
        title: columnPair.before.name !== columnPair.after.name ? 'Rename or alter column' : 'Alter column', object: `${pair.after.name}.${columnPair.before.name}${columnPair.before.name !== columnPair.after.name ? ` → ${columnPair.after.name}` : ''}`,
        reversible: !typeChanged, affected_table_ids: [value(pair.after.id)], affected_relationship_ids: [], warnings,
        forward: {
          postgresql: columnAlterSql(pair.after.name, columnPair.before, columnPair.after, 'postgresql'),
          mysql: columnAlterSql(pair.after.name, columnPair.before, columnPair.after, 'mysql'),
          sqlserver: columnAlterSql(pair.after.name, columnPair.before, columnPair.after, 'sqlserver'),
        },
        rollback: {
          postgresql: columnAlterSql(pair.after.name, columnPair.after, columnPair.before, 'postgresql'),
          mysql: columnAlterSql(pair.after.name, columnPair.after, columnPair.before, 'mysql'),
          sqlserver: columnAlterSql(pair.after.name, columnPair.after, columnPair.before, 'sqlserver'),
        },
      }));
    }
    for (const column of columns.removed) {
      steps.push(step({
        id: `drop-column:${pair.before.id}:${column.id}`, phase: 'drop-objects', kind: 'column', risk: 'breaking', title: 'Drop column', object: `${pair.after.name}.${column.name}`, reversible: false,
        affected_table_ids: [value(pair.after.id)], affected_relationship_ids: [],
        warnings: ['Rollback can recreate the column definition but cannot restore deleted values.'],
        forward: {
          postgresql: `ALTER TABLE ${quote(pair.after.name, 'postgresql')} DROP COLUMN ${quote(column.name, 'postgresql')};`,
          mysql: `ALTER TABLE ${quote(pair.after.name, 'mysql')} DROP COLUMN ${quote(column.name, 'mysql')};`,
          sqlserver: `ALTER TABLE ${quote(pair.after.name, 'sqlserver')} DROP COLUMN ${quote(column.name, 'sqlserver')};`,
        },
        rollback: {
          postgresql: `ALTER TABLE ${quote(pair.after.name, 'postgresql')} ADD COLUMN ${columnDefinition(column, 'postgresql')}; -- Data restore required`,
          mysql: `ALTER TABLE ${quote(pair.after.name, 'mysql')} ADD COLUMN ${columnDefinition(column, 'mysql')}; -- Data restore required`,
          sqlserver: `ALTER TABLE ${quote(pair.after.name, 'sqlserver')} ADD ${columnDefinition(column, 'sqlserver')}; -- Data restore required`,
        },
      }));
    }
  }

  for (const relation of [...modifiedRelations.map(pair => pair.after), ...addedRelations]) {
    const pg = relationSql(relation, after, 'postgresql');
    const mysql = relationSql(relation, after, 'mysql');
    const sqlserver = relationSql(relation, after, 'sqlserver');
    if (!pg || !mysql || !sqlserver) continue;
    steps.push(step({
      id: `add-relation:${value(relation.id) || relationSignature(relation, after)}`, phase: 'add-relations', kind: 'relationship', risk: 'caution', title: 'Add foreign key', object: pg.object, reversible: true,
      affected_table_ids: [sourceTableId(relation), targetTableId(relation)], affected_relationship_ids: [value(relation.id)],
      warnings: ['Validate existing orphan rows before adding the constraint.'],
      forward: { postgresql: pg.add, mysql: mysql.add, sqlserver: sqlserver.add }, rollback: { postgresql: pg.drop, mysql: mysql.drop, sqlserver: sqlserver.drop },
    }));
  }

  for (const table of tablePairs.removed) {
    steps.push(step({
      id: `drop-table:${table.id}`, phase: 'drop-objects', kind: 'table', risk: 'breaking', title: 'Drop table', object: table.name, reversible: false,
      affected_table_ids: [value(table.id)], affected_relationship_ids: [],
      warnings: ['Rollback recreates only the table structure; restore row data from a backup.'],
      forward: { postgresql: `DROP TABLE ${quote(table.name, 'postgresql')};`, mysql: `DROP TABLE ${quote(table.name, 'mysql')};`, sqlserver: `DROP TABLE ${quote(table.name, 'sqlserver')};` },
      rollback: { postgresql: `${tableCreate(table, 'postgresql')}\n-- Data restore required.`, mysql: `${tableCreate(table, 'mysql')}\n-- Data restore required.`, sqlserver: `${tableCreate(table, 'sqlserver')}\n-- Data restore required.` },
    }));
  }

  steps.sort((left, right) => phaseOrder[left.phase] - phaseOrder[right.phase] || left.object.localeCompare(right.object));
  const summary = {
    total: steps.length,
    safe: steps.filter(item => item.risk === 'safe').length,
    caution: steps.filter(item => item.risk === 'caution').length,
    breaking: steps.filter(item => item.risk === 'breaking').length,
    reversible: steps.filter(item => item.reversible).length,
  };
  const warnings = [
    ...(summary.breaking ? [`${summary.breaking} breaking step${summary.breaking === 1 ? '' : 's'} require backup, staging validation, and an explicit maintenance plan.`] : []),
    ...(steps.some(item => !item.reversible) ? ['Rollback SQL cannot recover data removed by DROP operations.'] : []),
    ...(possibleRename ? ['A drop/add pair may represent a rename when the compared schema does not preserve stable IDs. Verify rename intent before executing destructive SQL.'] : []),
    'Generated SQL covers objects modeled in the ERD; review triggers, views, routines, grants, partitioning, and application dependencies separately.',
  ];
  return {
    steps,
    summary,
    sql: {
      postgresql: { forward: migrationSql(steps, 'postgresql', 'forward'), rollback: migrationSql(steps, 'postgresql', 'rollback') },
      mysql: { forward: migrationSql(steps, 'mysql', 'forward'), rollback: migrationSql(steps, 'mysql', 'rollback') },
      sqlserver: { forward: migrationSql(steps, 'sqlserver', 'forward'), rollback: migrationSql(steps, 'sqlserver', 'rollback') },
    },
    warnings,
  };
}
