import { describe, expect, it } from 'vitest';
import {
  analyzeErdGovernance,
  exportErdDictionaryCsv,
  exportErdDictionaryMarkdown,
  normalizeErdGovernance,
  serializeErdGovernance,
  governanceFrom,
} from '../../../shared/erd-governance';

const tables: any[] = [{
  id: 'users', name: 'users', comment: '', governance: {
    business_name: 'Users', description: 'Registered users', domain: 'Identity', owner: 'IAM Team',
    classification: 'internal', review_status: 'approved', tags: ['core'],
  },
  columns: [
    { id: 'email', name: 'email', type: 'VARCHAR', comment: '', governance: { description: 'Login email', classification: 'confidential' } },
    { id: 'name', name: 'name', type: 'VARCHAR', comment: '' },
  ],
}];

describe('ERD data dictionary governance', () => {
  it('normalizes camelCase aliases, lists, dates, and empty values', () => {
    expect(normalizeErdGovernance({
      businessName: ' Customer ', reviewStatus: 'approved', reviewedAt: '2025-01-01',
      glossaryTerms: [' customer ', 'customer', ''], tags: ['pii'], description: ' ',
    })).toEqual({
      business_name: 'Customer', review_status: 'approved', reviewed_at: '2025-01-01T00:00:00.000Z',
      glossary_terms: ['customer'], tags: ['pii'],
    });
    expect(serializeErdGovernance({})).toBeNull();
  });

  it('rejects invalid controlled values and malformed lists', () => {
    expect(() => normalizeErdGovernance({ classification: 'secret' })).toThrow(/classification/);
    expect(() => normalizeErdGovernance({ tags: 'pii' })).toThrow(/arrays/);
    expect(() => normalizeErdGovernance({ reviewed_at: 'not-a-date' })).toThrow(/ISO date/);
    expect(() => normalizeErdGovernance('{broken-json')).toThrow(/valid JSON/);
    expect(() => normalizeErdGovernance('[]')).toThrow(/JSON object/);
    expect(() => normalizeErdGovernance({ owner: 'x'.repeat(301) })).toThrow(/at most 300/);
    expect(() => normalizeErdGovernance({ tags: Array.from({ length: 51 }, (_, index) => `tag-${index}`) })).toThrow(/at most 50/);
    expect(governanceFrom({ governance_data: '{broken-json' })).toEqual({});
    expect(governanceFrom({ governance: { classification: 'secret' } })).toEqual({});
  });

  it('calculates inherited owner and classification coverage', () => {
    const report = analyzeErdGovernance(tables);
    expect(report).toMatchObject({ score: 67, documented: 2, total: 3, approved: 1, sensitive: 1 });
    expect(report.classifications).toMatchObject({ internal: 2, confidential: 1, unclassified: 0 });
    expect(report.gaps).toEqual([expect.objectContaining({ label: 'users.name', missing: ['description'] })]);
  });

  it('exports human-readable Markdown and safely escaped CSV', () => {
    const input = structuredClone(tables);
    input[0].columns[0].governance.description = 'Login email, "verified"';
    const csv = exportErdDictionaryCsv(input);
    expect(csv).toContain('"Login email, ""verified"""');
    expect(csv).toContain('column,users,email,VARCHAR');
    const markdown = exportErdDictionaryMarkdown('Identity ERD', input);
    expect(markdown).toContain('# Identity ERD — Data Dictionary');
    expect(markdown).toContain('Documentation coverage: **67%**');
    expect(markdown).toContain('## users — Users');
  });
});
