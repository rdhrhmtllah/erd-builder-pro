// DBML → ERD parsing. This is the only module that loads @dbml/core (~15 MB),
// so boot-path code must reach it through a dynamic import; the string-only
// DBML helpers live in dbml-converter.ts.
import { Parser, ModelExporter } from '@dbml/core';
import type { Node, Edge } from '@xyflow/react';
import type { Entity } from '@/types';
import { COLUMN_TYPES } from '@/lib/utils';
import { normalizeColumnDefault, parseTypeModifiers } from '@/lib/column-metadata';
import { inferRelationshipSemantics, normalizeEndpointCardinality } from '@/lib/relationship-semantics';
import { parseSQLToERD } from '@/lib/sqlParser';
import { normalizeDBMLIndexSyntax, removeEmptyDBMLIndexes } from '@/lib/dbml-converter';
import { normalizeErdGovernance } from '../../shared/erd-governance';
import {
  buildDBMLTableDefinitions,
  findEnumNamingErrors,
  normalizeDBMLTypeName,
  parseDBMLColumn,
  parseDBMLRef,
  parseDBMLTableName,
  readDBMLEnumNames,
  recommendedDBMLEnumName,
} from '@/lib/dbml-utils';

const VALID_TYPES = new Set(COLUMN_TYPES.map(t => t.toUpperCase()));

function parseInlineEnumValues(typeName: string): string[] | null {
  const match = typeName.trim().match(/^enum\s*\(([\s\S]*)\)$/i);
  if (!match) return null;

  const values: string[] = [];
  const valueRegex = /'([^']+)'|"([^"]+)"|([^,\s][^,]*)/g;
  for (const valueMatch of match[1].matchAll(valueRegex)) {
    const value = (valueMatch[1] || valueMatch[2] || valueMatch[3] || '').trim();
    if (value) values.push(value);
  }
  return values.length ? values : null;
}

function normalizeEnumValue(value: string): string {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)
    ? cleaned
    : `"${cleaned.replace(/"/g, '\\"')}"`;
}

function normalizeGeneratedEnumName(tableName: string, columnName: string): string {
  return recommendedDBMLEnumName(tableName, columnName);
}

function parseColumnLine(line: string): { prefix: string; columnName: string; typeName: string; suffix: string } | null {
  const match = line.match(/^(\s*(?:"([^"]+)"|(\w+))\s+)(.+)$/);
  if (!match) return null;

  const rest = match[4];
  let depth = 0;
  let quote: string | null = null;
  let suffixStart = -1;

  for (let i = 0; i < rest.length; i += 1) {
    const char = rest[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(char) && rest.slice(i).trimStart().startsWith('[')) {
      suffixStart = i;
      break;
    }
  }

  const rawType = suffixStart === -1 ? rest.trim() : rest.slice(0, suffixStart).trim();
  const suffix = suffixStart === -1 ? '' : rest.slice(suffixStart);
  if (!rawType) return null;

  return {
    prefix: match[1],
    columnName: (match[2] || match[3] || '').trim(),
    typeName: rawType,
    suffix,
  };
}

function normalizeInlineRef(line: string, currentTable: string): string | null {
  const match = line.trim().match(/^Ref:\s*(?:(?:"([^"]+)"|(\w+))\.)?"?([^".\s]+)"?\s*([><-])\s*(?:"([^"]+)"|(\w+))\."?([^".\s]+)"?/i);
  if (!match) return null;
  const leftTable = match[1] || match[2] || currentTable;
  const leftColumn = match[3];
  const operator = match[4];
  const rightTable = match[5] || match[6];
  const rightColumn = match[7];
  if (!leftTable || !leftColumn || !rightTable || !rightColumn) return null;
  return `Ref: ${leftTable}.${leftColumn} ${operator} ${rightTable}.${rightColumn}`;
}

function normalizeDBMLForParser(text: string): string {
  const lines = normalizeDBMLIndexSyntax(removeEmptyDBMLIndexes(text)).split(/\r?\n/);
  const normalizedLines: string[] = [];
  const generatedEnums: { name: string; values: string[] }[] = [];
  const generatedRefs: string[] = [];
  let currentTable = '';
  let inTable = false;
  let checksDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const tableName = parseDBMLTableName(line);
    if (tableName) {
      currentTable = tableName;
      inTable = true;
      checksDepth = 0;
      normalizedLines.push(line);
      continue;
    }

    if (inTable && /^Checks\s*\{/i.test(trimmed)) {
      checksDepth = 1;
      continue;
    }
    if (checksDepth > 0) {
      if (trimmed === '}') checksDepth -= 1;
      continue;
    }

    if (inTable && trimmed.startsWith('Ref:')) {
      const normalizedRef = normalizeInlineRef(line, currentTable);
      if (normalizedRef) generatedRefs.push(normalizedRef);
      continue;
    }

    if (trimmed === '}' || trimmed.startsWith('}')) {
      inTable = false;
      currentTable = '';
      normalizedLines.push(line);
      continue;
    }

    if (inTable && trimmed && !trimmed.startsWith('//')) {
      const column = parseColumnLine(line);
      if (column) {
        const enumValues = parseInlineEnumValues(column.typeName);
        if (enumValues) {
          const enumName = normalizeGeneratedEnumName(currentTable, column.columnName);
          generatedEnums.push({ name: enumName, values: enumValues });
          normalizedLines.push(`${column.prefix}${enumName}${column.suffix}`);
          continue;
        }

        const normalizedType = normalizeDBMLTypeName(column.typeName);
        if (normalizedType !== column.typeName) {
          normalizedLines.push(`${column.prefix}${normalizedType}${column.suffix}`);
          continue;
        }
      }
    }

    normalizedLines.push(line);
  }

  if (generatedEnums.length > 0) {
    normalizedLines.push('');
    for (const generatedEnum of generatedEnums) {
      normalizedLines.push(`Enum ${generatedEnum.name} {`);
      for (const value of generatedEnum.values) {
        normalizedLines.push(`  ${normalizeEnumValue(value)}`);
      }
      normalizedLines.push('}');
      normalizedLines.push('');
    }
  }

  if (generatedRefs.length > 0) {
    normalizedLines.push(...generatedRefs);
  }

  return normalizedLines.join('\n').trim();
}
function readDBMLChecks(text: string) {
  const checks = new Map<string, { name: string | null; expression: string }[]>();
  let currentTable = '';
  let inChecks = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const tableName = parseDBMLTableName(line);
    if (tableName) {
      currentTable = tableName;
      inChecks = false;
      continue;
    }
    if (currentTable && /^Checks\s*\{/i.test(trimmed)) {
      inChecks = true;
      continue;
    }
    if (inChecks) {
      if (trimmed === '}') {
        inChecks = false;
        continue;
      }
      const match = trimmed.match(/^`((?:\\`|[^`])+)`\s*(?:\[(.*)\])?$/);
      if (!match) continue;
      const nameMatch = match[2]?.match(/name\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/i);
      checks.set(currentTable.toLowerCase(), [
        ...(checks.get(currentTable.toLowerCase()) || []),
        {
          expression: match[1].replace(/\\`/g, '`'),
          name: nameMatch ? (nameMatch[1] || nameMatch[2] || '').replace(/\\['"]/g, match[2]?.includes('"') ? '"' : "'") : null,
        },
      ]);
      continue;
    }
    if (trimmed === '}' || trimmed.startsWith('}')) currentTable = '';
  }
  return checks;
}

function readDBMLColumnMetadata(text: string): Map<string, { comment?: string; max_length?: number | null; numeric_precision?: number | null; numeric_scale?: number | null }> {
  const columns = new Map<string, { comment?: string; max_length?: number | null; numeric_precision?: number | null; numeric_scale?: number | null }>();
  const tableBlock = /^\s*Table\s+(?:"([^"]+)"|(\w+))\s*\{([\s\S]*?)^\s*\}/gim;

  for (const match of text.matchAll(tableBlock)) {
    const tableName = (match[1] || match[2]).toLowerCase();
    for (const line of match[3].split('\n')) {
      const column = parseColumnLine(line);
      if (!column) continue;
      const note = column.suffix.match(/note\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/i);
      columns.set(`${tableName}\u0000${column.columnName.toLowerCase()}`, {
        comment: note ? (note[1] || note[2] || '').replace(/\\'/g, "'").replace(/\\"/g, '"') : undefined,
        ...parseTypeModifiers(column.typeName),
      });
    }
  }

  return columns;
}

function dbmlValue(value: any): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    const raw = Object.prototype.hasOwnProperty.call(value, 'value')
      ? value.value
      : value.name ?? value.type ?? JSON.stringify(value);
    if (raw === null) return 'NULL';
    return value.type === 'string' ? `'${String(raw).replace(/'/g, "\\'")}'` : String(raw);
  }
  return String(value);
}

function metadataId(kind: string, table: string, key: string) {
  return `${kind}:${table}:${key}`.replace(/[^A-Za-z0-9:_-]/g, '_');
}

function readDBMLModelMetadata(model: any, sourceText = '') {
  const tables = new Map<string, any>();
  const fields = model?.fields || {};
  const indexes = model?.indexes || {};
  const indexColumns = model?.indexColumns || {};
  const checks = model?.checks || {};
  const rawChecks = readDBMLChecks(sourceText);

  for (const table of Object.values(model?.tables || {}) as any[]) {
    const tableFields = (table.fieldIds || []).map((id: number) => fields[id]).filter(Boolean);
    const columnByFieldId = new Map(tableFields.map((field: any) => [field.id, field.name]));
    const tableIndexes: any[] = [];
    const tableConstraints: any[] = [];
    for (const indexId of table.indexIds || []) {
      const index = indexes[indexId];
      if (!index) continue;
      const columnNames = (index.columnIds || []).map((id: number) => indexColumns[id]?.value).filter(Boolean);
      const key = index.name || `${index.pk ? 'primary_key' : index.unique ? 'unique' : 'index'}:${columnNames.join(',')}`;
      if (index.pk) {
        tableConstraints.push({
          id: metadataId('constraint', table.name, key),
          kind: 'primary_key',
          name: index.name || null,
          column_names: columnNames,
        });
      } else {
        tableIndexes.push({
          id: metadataId('index', table.name, key),
          name: index.name || key,
          column_names: columnNames,
          is_unique: Boolean(index.unique),
          algorithm: index.type || null,
        });
      }
    }
    for (const checkId of table.checkIds || []) {
      const check = checks[checkId];
      if (!check) continue;
      const columnName = check.columnId ? columnByFieldId.get(check.columnId) : undefined;
      tableConstraints.push({
        id: metadataId('constraint', table.name, check.name || check.expression),
        kind: 'check',
        name: check.name || null,
        column_names: columnName ? [columnName] : [],
        expression: check.expression,
      });
    }
    for (const check of rawChecks.get(String(table.name).toLowerCase()) || []) {
      tableConstraints.push({
        id: metadataId('constraint', table.name, check.name || check.expression),
        kind: 'check',
        name: check.name,
        column_names: [],
        expression: check.expression,
      });
    }
    tables.set(String(table.name).toLowerCase(), {
      comment: table.note || null,
      fields: new Map(tableFields.map((field: any) => [String(field.name).toLowerCase(), {
        default_value: dbmlValue(field.dbdefault),
        is_unique: Boolean(field.unique),
      }])),
      constraints: tableConstraints,
      indexes: tableIndexes,
    });
  }

  return tables;
}

function readDBMLRefMetadata(model: any) {
  const fields = model?.fields || {};
  const tables = model?.tables || {};
  return Object.values(model?.refs || {}).map((ref: any) => {
    const endpoints = (ref.endpointIds || []).map((id: number) => model.endpoints?.[id]).filter(Boolean).map((endpoint: any) => ({
      table: tables[fields[endpoint.fieldIds?.[0]]?.tableId]?.name,
      columns: (endpoint.fieldIds || []).map((id: number) => fields[id]?.name).filter(Boolean),
    }));
    return { name: ref.name || null, onDelete: ref.onDelete || null, onUpdate: ref.onUpdate || null, endpoints };
  });
}

function readDBMLCardinalityMetadata(text: string) {
  const result = new Map<string, { source: any; target: any }>();
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/\/\/\s*erd-cardinality:\s*source=(\S+)\s+target=(\S+)/i);
    if (!marker) continue;
    const ref = parseDBMLRef(line, '');
    if (!ref) continue;
    const source = normalizeEndpointCardinality(marker[1], 'zero-or-many');
    const target = normalizeEndpointCardinality(marker[2], 'exactly-one');
    result.set(`${ref.fkTable.toLowerCase()}\u0000${ref.fkCol.toLowerCase()}\u0000${ref.pkTable.toLowerCase()}\u0000${ref.pkCol.toLowerCase()}`, { source, target });
  }
  return result;
}

function readDBMLGovernanceMetadata(text: string) {
  const tables = new Map<string, any>();
  const columns = new Map<string, any>();
  let currentTable = '';
  for (const line of text.split(/\r?\n/)) {
    const tableName = parseDBMLTableName(line);
    if (tableName) currentTable = tableName;
    const tableMarker = line.match(/\/\/\s*erd-governance-table:\s*(\S+)/i);
    if (tableMarker && currentTable) {
      try { tables.set(currentTable.toLowerCase(), normalizeErdGovernance(JSON.parse(decodeURIComponent(tableMarker[1])))); } catch { /* ignore malformed metadata comments */ }
    }
    const columnMarker = line.match(/\/\/\s*erd-governance-column:\s*name=(\S+)\s+data=(\S+)/i);
    if (columnMarker && currentTable) {
      try {
        const columnName = decodeURIComponent(columnMarker[1]).toLowerCase();
        columns.set(`${currentTable.toLowerCase()}\u0000${columnName}`, normalizeErdGovernance(JSON.parse(decodeURIComponent(columnMarker[2]))));
      } catch { /* ignore malformed metadata comments */ }
    }
    if (line.trim() === '}') currentTable = '';
  }
  return { tables, columns };
}

/**
 * Pre-scan DBML text for invalid column types.
 * Regex-based — catches type issues before the parser does.
 */
function findTypeErrors(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split('\n');
  const enumNames = readDBMLEnumNames(lines);
  let currentTable = '';
  let inTable = false;
  let metadataDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    const tableName = parseDBMLTableName(line);
    if (tableName) {
      currentTable = tableName;
      inTable = true;
      metadataDepth = 0;
      continue;
    }

    if (inTable && /^(checks|indexes)\s*\{/i.test(trimmed)) {
      metadataDepth = 1;
      continue;
    }
    if (metadataDepth > 0) {
      if (trimmed === '}') metadataDepth -= 1;
      continue;
    }

    if (trimmed === '}' || trimmed.startsWith('}')) {
      inTable = false;
      currentTable = '';
      continue;
    }

    if (inTable && trimmed && !trimmed.startsWith('//')) {
      // Match quoted or bare column names. Bare names are the usual DBML form;
      // without this branch an incomplete type such as `bi` reached the SQL
      // converter, where unknown types are normalized to VARCHAR.
      const column = parseDBMLColumn(trimmed);
      if (column) {
        const { name: colName, type: typeName } = column;
        const normalizedTypeName = normalizeDBMLTypeName(typeName);
        if (normalizedTypeName && !VALID_TYPES.has(normalizedTypeName.toUpperCase()) && !enumNames.has(normalizedTypeName.toLowerCase())) {
          errors.push(
            `Line ${lineNum}: Invalid type "${typeName}" in table "${currentTable}" column "${colName}"`,
          );
        }
      }
    }
  }

  return errors;
}

/** Read named DBML enums so their values survive the DBML → SQL → ERD bridge. */
function readDBMLEnums(text: string): Map<string, string> {
  const enums = new Map<string, string>();
  const enumBlock = /^\s*Enum\s+(?:"([^"]+)"|(\w+))\s*\{([\s\S]*?)^\s*\}/gim;

  for (const match of text.matchAll(enumBlock)) {
    const name = (match[1] || match[2]).toLowerCase();
    const values = match[3]
      .split('\n')
      .map(line => line.trim().replace(/\/\/.*$/, '').trim())
      .filter(line => line && !line.startsWith('//'))
      .map(line => line.split(/\s+\[/, 1)[0].trim())
      .filter(Boolean);
    if (values.length) enums.set(name, values.join(', '));
  }

  return enums;
}

/** Map each DBML enum-typed column by table and column name. */
function readDBMLEnumColumns(text: string, enums: Map<string, string>): Map<string, { name: string; values: string }> {
  const columns = new Map<string, { name: string; values: string }>();
  const tableBlock = /^\s*Table\s+(?:"([^"]+)"|(\w+))\s*\{([\s\S]*?)^\s*\}/gim;

  for (const match of text.matchAll(tableBlock)) {
    const tableName = (match[1] || match[2]).toLowerCase();
    for (const line of match[3].split('\n')) {
      const column = line.match(/^\s*(?:"([^"]+)"|(\w+))\s+(?:"([^"]+)"|([^\s\[]+))/);
      if (!column) continue;
      const columnName = (column[1] || column[2]).toLowerCase();
      const rawTypeName = column[3] || column[4];
      const typeName = rawTypeName.toLowerCase();
      const values = enums.get(typeName);
      if (values) columns.set(`${tableName}\u0000${columnName}`, { name: rawTypeName, values });
    }
  }

  return columns;
}

/**
 * Pre-scan DBML text for ref type mismatches.
 * Builds table→column→type map, then checks every Ref line.
 */
function findRefTypeErrors(text: string): string[] {
  const errors: string[] = [];
  const lines = text.split('\n');
  const { tableDefs, lineTables } = buildDBMLTableDefinitions(lines);

  // Check Ref lines for type mismatches
  for (let i = 0; i < lines.length; i += 1) {
    const ref = parseDBMLRef(lines[i], lineTables[i]);
    if (ref) {
      const fkType = tableDefs.get(ref.fkTable)?.get(ref.fkCol)?.toUpperCase().replace(/\s+/g, '');
      const pkType = tableDefs.get(ref.pkTable)?.get(ref.pkCol)?.toUpperCase().replace(/\s+/g, '');
      if (fkType && pkType && fkType !== pkType) {
        errors.push(`Type mismatch: "${ref.fkTable}.${ref.fkCol}" is ${tableDefs.get(ref.fkTable)?.get(ref.fkCol)} but "${ref.pkTable}.${ref.pkCol}" is ${tableDefs.get(ref.pkTable)?.get(ref.pkCol)}`);
      }
    }
  }

  return errors;
}

/**
 * Parse DBML text → ERD nodes + edges.
 * Tables become Entity nodes, Refs become relationship edges.
 */
export function dbmlToERD(dbmlText: string): { nodes: Node<Entity>[]; edges: Edge[] } {
  const normalizedDBML = normalizeDBMLForParser(dbmlText);

  // ── Pre-scan: find type errors ──
  const typeErrors = findTypeErrors(normalizedDBML);
  const refTypeErrors = findRefTypeErrors(normalizedDBML);
  const enumNameErrors = findEnumNamingErrors(normalizedDBML).map(error =>
    `Line ${error.line}: Enum type "${error.actual}" in "${error.table}.${error.column}" must be named "${error.expected}"`,
  );

  // ── DBML → SQL via @dbml/core ──
  let parseError: string | null = null;
  let sql: string;
  let normalizedModel: any = null;
  try {
    const db = Parser.parse(normalizedDBML, 'dbml');
    normalizedModel = db.normalize();
    sql = ModelExporter.export(db, 'postgres');
  } catch (e: any) {
    const diags = e?.diags;
    parseError = diags?.length
      ? diags.map((d: any) => `Line ${d.location?.start?.line}: ${d.message}`).join('; ')
      : e?.message || String(e);
  }

  // ── Collect all errors ──
  const allErrors = [...typeErrors, ...refTypeErrors, ...enumNameErrors];
  if (parseError) allErrors.push(parseError);
  if (allErrors.length) {
    throw new Error(allErrors.join('\n'));
  }

  // ── SQL → ERD via existing parser ──
  const result = parseSQLToERD(sql!);

  // PostgreSQL emits named enums as `CREATE TYPE name AS ENUM (...)`, while
  // the SQL parser normalizes unknown named types to VARCHAR. Restore the enum
  // marker and values from the authoritative DBML table definitions.
  const enums = readDBMLEnums(normalizedDBML);
  const enumColumns = readDBMLEnumColumns(normalizedDBML, enums);
  const columnMetadata = readDBMLColumnMetadata(dbmlText);
  const modelMetadata = readDBMLModelMetadata(normalizedModel, dbmlText);
  const governanceMetadata = readDBMLGovernanceMetadata(dbmlText);
  for (const node of result.nodes) {
    const tableMetadata = modelMetadata.get(node.data.name.toLowerCase());
    if (tableMetadata) {
      node.data.comment = tableMetadata.comment;
      node.data.constraints = tableMetadata.constraints.map((constraint: any) => ({
        ...constraint,
        entity_id: node.id,
        column_ids: constraint.column_names.map((name: string) => node.data.columns.find(column => column.name.toLowerCase() === name.toLowerCase())?.id).filter(Boolean),
      }));
      node.data.indexes = tableMetadata.indexes.map((index: any) => ({
        ...index,
        entity_id: node.id,
        column_ids: index.column_names.map((name: string) => node.data.columns.find(column => column.name.toLowerCase() === name.toLowerCase())?.id).filter(Boolean),
      }));
    }
    node.data.governance = governanceMetadata.tables.get(node.data.name.toLowerCase()) || {};
    for (const column of node.data.columns) {
      const metadata = columnMetadata.get(`${node.data.name.toLowerCase()}\u0000${column.name.toLowerCase()}`);
      if (metadata) {
        column.comment = metadata.comment || '';
        column.max_length = metadata.max_length;
        column.numeric_precision = metadata.numeric_precision;
        column.numeric_scale = metadata.numeric_scale;
      }
      const modelColumn = tableMetadata?.fields.get(column.name.toLowerCase());
      if (modelColumn) {
        column.default_value = normalizeColumnDefault(modelColumn.default_value, Boolean(column.is_nullable));
        column.is_unique = modelColumn.is_unique;
      }
      const enumColumn = enumColumns.get(`${node.data.name.toLowerCase()}\u0000${column.name.toLowerCase()}`);
      if (enumColumn) {
        column.type = 'ENUM';
        column.enum_name = enumColumn.name;
        column.enum_values = enumColumn.values;
      }
      column.governance = governanceMetadata.columns.get(`${node.data.name.toLowerCase()}\u0000${column.name.toLowerCase()}`) || {};
    }
  }

  const refMetadata = readDBMLRefMetadata(normalizedModel);
  const cardinalityMetadata = readDBMLCardinalityMetadata(dbmlText);
  for (const edge of result.edges) {
    const source = result.nodes.find(node => node.id === edge.source);
    const target = result.nodes.find(node => node.id === edge.target);
    const sourceColumn = source?.data.columns.find(column => edge.sourceHandle?.includes(column.id));
    const targetColumn = target?.data.columns.find(column => edge.targetHandle?.includes(column.id));
    const ref = refMetadata.find(item => item.endpoints.length === 2 && item.endpoints.some((endpoint: any) => endpoint.table?.toLowerCase() === source?.data.name.toLowerCase() && endpoint.columns.some((column: string) => column.toLowerCase() === sourceColumn?.name.toLowerCase())) && item.endpoints.some((endpoint: any) => endpoint.table?.toLowerCase() === target?.data.name.toLowerCase() && endpoint.columns.some((column: string) => column.toLowerCase() === targetColumn?.name.toLowerCase())));
    if (ref) edge.data = { ...(edge.data || {}), on_delete: ref.onDelete, on_update: ref.onUpdate, constraint_name: ref.name };
    if (source && target && sourceColumn && targetColumn) {
      const directKey = `${source.data.name.toLowerCase()}\u0000${sourceColumn.name.toLowerCase()}\u0000${target.data.name.toLowerCase()}\u0000${targetColumn.name.toLowerCase()}`;
      const reverseKey = `${target.data.name.toLowerCase()}\u0000${targetColumn.name.toLowerCase()}\u0000${source.data.name.toLowerCase()}\u0000${sourceColumn.name.toLowerCase()}`;
      const direct = cardinalityMetadata.get(directKey);
      const reverse = cardinalityMetadata.get(reverseKey);
      const inferred = inferRelationshipSemantics(edge, Boolean(sourceColumn.is_nullable));
      edge.data = {
        ...(edge.data || {}),
        source_cardinality: direct?.source ?? reverse?.target ?? inferred.source,
        target_cardinality: direct?.target ?? reverse?.source ?? inferred.target,
      };
    }
  }

  return result;
}

/** Apply DBML-only metadata to existing canvas nodes without replacing IDs or positions. */
export function applyDBMLMetadata(nodes: Node<Entity>[], dbmlText: string): Node<Entity>[] {
  if (!dbmlText.trim()) return nodes;

  try {
    const parsed = dbmlToERD(dbmlText);
    const parsedByTable = new Map(parsed.nodes.map(node => [node.data.name.toLowerCase(), node]));

    return nodes.map(node => {
      const parsedNode = parsedByTable.get(node.data.name.toLowerCase());
      if (!parsedNode) return node;

      const parsedColumns = new Map(parsedNode.data.columns.map(column => [column.name.toLowerCase(), column]));
      const remapColumnIds = (ids: string[] = []) => ids
        .map(id => parsedNode.data.columns.find(column => column.id === id)?.name.toLowerCase())
        .map(name => node.data.columns.find(column => column.name.toLowerCase() === name)?.id)
        .filter((id): id is string => Boolean(id));
      const constraints = (parsedNode.data.constraints || []).map(constraint => ({
        ...constraint,
        entity_id: node.data.id,
        column_ids: remapColumnIds(constraint.column_ids),
      }));
      const indexes = (parsedNode.data.indexes || []).map(index => ({
        ...index,
        entity_id: node.data.id,
        column_ids: remapColumnIds(index.column_ids),
      }));
      const metadataColumnNames = (ids: string[]) => ids
        .map(id => parsedNode.data.columns.find(column => column.id === id)?.name.toLowerCase())
        .filter(Boolean)
        .sort()
        .join(',');
      const primaryColumns = parsedNode.data.columns.filter(column => column.is_pk);
      if (primaryColumns.length > 0 && !constraints.some(constraint => (
        constraint.kind === 'primary_key' && metadataColumnNames(constraint.column_ids) === primaryColumns.map(column => column.name.toLowerCase()).sort().join(',')
      ))) {
        constraints.push({
          id: metadataId('constraint', parsedNode.data.name, `primary_key:${primaryColumns.map(column => column.name).join(',')}`),
          entity_id: node.data.id,
          kind: 'primary_key',
          name: null,
          column_ids: remapColumnIds(primaryColumns.map(column => column.id)),
        });
      }
      for (const column of parsedNode.data.columns.filter(item => item.is_unique)) {
        const represented = indexes.some(index => index.is_unique && metadataColumnNames(index.column_ids) === column.name.toLowerCase())
          || constraints.some(constraint => constraint.kind === 'unique' && metadataColumnNames(constraint.column_ids) === column.name.toLowerCase());
        if (!represented) {
          indexes.push({
            id: metadataId('index', parsedNode.data.name, `unique:${column.name}`),
            entity_id: node.data.id,
            name: `unique:${column.name}`,
            column_ids: remapColumnIds([column.id]),
            is_unique: true,
            algorithm: null,
          });
        }
      }

      return {
        ...node,
        data: {
          ...node.data,
          comment: parsedNode.data.comment ?? node.data.comment,
          governance: parsedNode.data.governance ?? node.data.governance,
          constraints,
          indexes,
          columns: node.data.columns.map(column => {
            const parsedColumn = parsedColumns.get(column.name.toLowerCase());
            return parsedColumn
              ? { ...column, governance: parsedColumn.governance ?? column.governance, default_value: normalizeColumnDefault(parsedColumn.default_value, Boolean(column.is_nullable)), is_unique: Boolean(parsedColumn.is_unique) }
              : column;
          }),
        },
      };
    });
  } catch {
    return nodes;
  }
}
