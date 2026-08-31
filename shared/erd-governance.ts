export const ERD_DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const ERD_LIFECYCLE_STATUSES = ['draft', 'active', 'deprecated'] as const;
export const ERD_REVIEW_STATUSES = ['unreviewed', 'in-review', 'approved'] as const;

export type ErdDataClassification = typeof ERD_DATA_CLASSIFICATIONS[number];
export type ErdLifecycleStatus = typeof ERD_LIFECYCLE_STATUSES[number];
export type ErdReviewStatus = typeof ERD_REVIEW_STATUSES[number];

export type ErdGovernanceMetadata = {
  business_name?: string;
  description?: string;
  domain?: string;
  owner?: string;
  steward?: string;
  classification?: ErdDataClassification;
  lifecycle?: ErdLifecycleStatus;
  review_status?: ErdReviewStatus;
  reviewed_at?: string;
  retention?: string;
  glossary_terms?: string[];
  tags?: string[];
};

export type ErdGovernedColumn = {
  id: string;
  name: string;
  type: string;
  is_pk?: boolean;
  is_nullable?: boolean;
  comment?: string | null;
  governance?: ErdGovernanceMetadata;
  governance_data?: string | ErdGovernanceMetadata | null;
  governanceData?: string | ErdGovernanceMetadata | null;
};

export type ErdGovernedTable = {
  id: string;
  name: string;
  comment?: string | null;
  governance?: ErdGovernanceMetadata;
  governance_data?: string | ErdGovernanceMetadata | null;
  governanceData?: string | ErdGovernanceMetadata | null;
  columns: ErdGovernedColumn[];
};

export type ErdGovernanceGap = {
  id: string;
  kind: 'table' | 'column';
  table_id: string;
  column_id?: string;
  label: string;
  missing: string[];
};

export type ErdGovernanceReport = {
  score: number;
  documented: number;
  total: number;
  approved: number;
  sensitive: number;
  classifications: Record<ErdDataClassification | 'unclassified', number>;
  gaps: ErdGovernanceGap[];
};

const MAX_TEXT = 10_000;
const MAX_SHORT_TEXT = 300;
const MAX_LIST_ITEMS = 50;

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Governance metadata must be a JSON object');
      return parsed;
    } catch (error) {
      if (error instanceof Error && error.message === 'Governance metadata must be a JSON object') throw error;
      throw new Error('Governance metadata must contain valid JSON');
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Governance metadata must be an object');
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('Governance text values must be strings');
  if (value.length > max) throw new Error(`Governance text values must be at most ${max} characters`);
  const normalized = value.trim();
  return normalized || undefined;
}

function list(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('Governance list values must be arrays');
  if (value.length > MAX_LIST_ITEMS) throw new Error(`Governance lists must contain at most ${MAX_LIST_ITEMS} items`);
  const normalized = value.map(item => {
    if (typeof item !== 'string') throw new Error('Governance list items must be strings');
    if (item.length > 100) throw new Error('Governance list items must be at most 100 characters');
    return item.trim();
  }).filter(Boolean);
  return [...new Set(normalized)];
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, field: string): T[number] | undefined {
  const normalized = text(value, 50);
  if (!normalized) return undefined;
  if (!values.includes(normalized)) throw new Error(`${field} must be one of: ${values.join(', ')}`);
  return normalized as T[number];
}

export function normalizeErdGovernance(value: unknown): ErdGovernanceMetadata {
  const source = objectValue(value);
  const reviewedAt = text(source.reviewed_at ?? source.reviewedAt, 50);
  if (reviewedAt && Number.isNaN(Date.parse(reviewedAt))) throw new Error('reviewed_at must be an ISO date');
  const normalized: ErdGovernanceMetadata = {
    business_name: text(source.business_name ?? source.businessName, MAX_SHORT_TEXT),
    description: text(source.description, MAX_TEXT),
    domain: text(source.domain, MAX_SHORT_TEXT),
    owner: text(source.owner, MAX_SHORT_TEXT),
    steward: text(source.steward, MAX_SHORT_TEXT),
    classification: enumValue(source.classification, ERD_DATA_CLASSIFICATIONS, 'classification'),
    lifecycle: enumValue(source.lifecycle, ERD_LIFECYCLE_STATUSES, 'lifecycle'),
    review_status: enumValue(source.review_status ?? source.reviewStatus, ERD_REVIEW_STATUSES, 'review_status'),
    reviewed_at: reviewedAt ? new Date(reviewedAt).toISOString() : undefined,
    retention: text(source.retention, MAX_SHORT_TEXT),
    glossary_terms: list(source.glossary_terms ?? source.glossaryTerms),
    tags: list(source.tags),
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0)));
}

export function governanceFrom(value: any): ErdGovernanceMetadata {
  try {
    return normalizeErdGovernance(value?.governance ?? value?.governance_data ?? value?.governanceData);
  } catch {
    return {};
  }
}

export function serializeErdGovernance(value: unknown) {
  const normalized = normalizeErdGovernance(value);
  return Object.keys(normalized).length ? JSON.stringify(normalized) : null;
}

function documented(metadata: ErdGovernanceMetadata, fallbackComment?: string | null) {
  return Boolean(metadata.description || fallbackComment) && Boolean(metadata.owner) && Boolean(metadata.classification);
}

export function analyzeErdGovernance(tables: ErdGovernedTable[]): ErdGovernanceReport {
  const gaps: ErdGovernanceGap[] = [];
  const classifications: ErdGovernanceReport['classifications'] = { public: 0, internal: 0, confidential: 0, restricted: 0, unclassified: 0 };
  let documentedCount = 0;
  let approved = 0;
  let sensitive = 0;
  let total = 0;

  for (const table of tables) {
    const tableMetadata = governanceFrom(table);
    const tableMissing = [
      ...(!tableMetadata.description && !table.comment ? ['description'] : []),
      ...(!tableMetadata.owner ? ['owner'] : []),
      ...(!tableMetadata.domain ? ['domain'] : []),
      ...(!tableMetadata.classification ? ['classification'] : []),
    ];
    total += 1;
    if (documented(tableMetadata, table.comment)) documentedCount += 1;
    if (tableMetadata.review_status === 'approved') approved += 1;
    classifications[tableMetadata.classification || 'unclassified'] += 1;
    if (tableMetadata.classification === 'confidential' || tableMetadata.classification === 'restricted') sensitive += 1;
    if (tableMissing.length) gaps.push({ id: `table:${table.id}`, kind: 'table', table_id: table.id, label: table.name, missing: tableMissing });

    for (const column of table.columns || []) {
      const metadata = governanceFrom(column);
      const effectiveOwner = metadata.owner || tableMetadata.owner;
      const effectiveClassification = metadata.classification || tableMetadata.classification;
      const missing = [
        ...(!metadata.description && !column.comment ? ['description'] : []),
        ...(!effectiveOwner ? ['owner'] : []),
        ...(!effectiveClassification ? ['classification'] : []),
      ];
      total += 1;
      if (Boolean(metadata.description || column.comment) && Boolean(effectiveOwner) && Boolean(effectiveClassification)) documentedCount += 1;
      if (metadata.review_status === 'approved') approved += 1;
      classifications[effectiveClassification || 'unclassified'] += 1;
      if (effectiveClassification === 'confidential' || effectiveClassification === 'restricted') sensitive += 1;
      if (missing.length) gaps.push({ id: `column:${table.id}:${column.id}`, kind: 'column', table_id: table.id, column_id: column.id, label: `${table.name}.${column.name}`, missing });
    }
  }

  return {
    score: total ? Math.round((documentedCount / total) * 100) : 100,
    documented: documentedCount, total, approved, sensitive, classifications,
    gaps: gaps.sort((a, b) => b.missing.length - a.missing.length || a.label.localeCompare(b.label)),
  };
}

function csv(value: unknown) {
  const stringValue = String(value ?? '');
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

export function exportErdDictionaryCsv(tables: ErdGovernedTable[]) {
  const rows = [['object_type', 'table', 'column', 'data_type', 'business_name', 'description', 'domain', 'owner', 'steward', 'classification', 'lifecycle', 'review_status', 'reviewed_at', 'retention', 'glossary_terms', 'tags']];
  for (const table of tables) {
    const tableMeta = governanceFrom(table);
    rows.push(['table', table.name, '', '', tableMeta.business_name || '', tableMeta.description || table.comment || '', tableMeta.domain || '', tableMeta.owner || '', tableMeta.steward || '', tableMeta.classification || '', tableMeta.lifecycle || '', tableMeta.review_status || '', tableMeta.reviewed_at || '', tableMeta.retention || '', (tableMeta.glossary_terms || []).join('|'), (tableMeta.tags || []).join('|')]);
    for (const column of table.columns || []) {
      const meta = governanceFrom(column);
      rows.push(['column', table.name, column.name, column.type, meta.business_name || '', meta.description || column.comment || '', meta.domain || tableMeta.domain || '', meta.owner || tableMeta.owner || '', meta.steward || tableMeta.steward || '', meta.classification || tableMeta.classification || '', meta.lifecycle || tableMeta.lifecycle || '', meta.review_status || '', meta.reviewed_at || '', meta.retention || tableMeta.retention || '', (meta.glossary_terms || []).join('|'), (meta.tags || []).join('|')]);
    }
  }
  return rows.map(row => row.map(csv).join(',')).join('\n');
}

export function exportErdDictionaryMarkdown(name: string, tables: ErdGovernedTable[]) {
  const report = analyzeErdGovernance(tables);
  const lines = [`# ${name} — Data Dictionary`, '', `Documentation coverage: **${report.score}%** (${report.documented}/${report.total})`, ''];
  for (const table of tables) {
    const meta = governanceFrom(table);
    lines.push(`## ${table.name}${meta.business_name ? ` — ${meta.business_name}` : ''}`, '', meta.description || table.comment || '_No description._', '', `- Domain: ${meta.domain || '—'}`, `- Owner: ${meta.owner || '—'}`, `- Steward: ${meta.steward || '—'}`, `- Classification: ${meta.classification || 'unclassified'}`, `- Lifecycle: ${meta.lifecycle || '—'}`, `- Review: ${meta.review_status || 'unreviewed'}`, '');
    lines.push('| Column | Type | Business name | Description | Classification | Owner |', '|---|---|---|---|---|---|');
    for (const column of table.columns || []) {
      const columnMeta = governanceFrom(column);
      const safe = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${safe(column.name)} | ${safe(column.type)} | ${safe(columnMeta.business_name || '')} | ${safe(columnMeta.description || column.comment || '')} | ${columnMeta.classification || meta.classification || 'unclassified'} | ${safe(columnMeta.owner || meta.owner || '')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
