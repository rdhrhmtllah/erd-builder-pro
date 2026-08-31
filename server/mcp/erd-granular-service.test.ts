import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDiagram: vi.fn(), saveDiagram: vi.fn() }));
vi.mock('../routes/diagrams/save-service.js', () => ({
  getDiagramWithData: mocks.getDiagram,
  saveDiagram: mocks.saveDiagram,
}));

const service = await import('./erd-granular-service.js');

function snapshot() {
  return {
    uid: 'diagram-1', name: 'Commerce', version: 3, updatedAt: '2026-01-01T00:00:00.000Z',
    viewport: { x: 10, y: 20, zoom: 0.8 },
    entities: [
      { id: 'users', name: 'users', x: 0, y: 0, color: '#6366f1', columns: [{ id: 'users-id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false }], constraints: [], indexes: [] },
      { id: 'orders', name: 'orders', x: 300, y: 0, color: '#6366f1', columns: [
        { id: 'orders-id', name: 'id', type: 'BIGINT', is_pk: true, is_nullable: false },
        { id: 'orders-user', name: 'user_id', type: 'BIGINT', is_pk: false, is_nullable: false },
      ], constraints: [], indexes: [] },
    ],
    relationships: [{
      id: 'orders-user-fk', source_entity_id: 'orders', target_entity_id: 'users',
      source_column_id: 'orders-user', target_column_id: 'users-id', type: 'one-to-many',
    }],
  } as any;
}

function databaseDiagram(updatedAt = new Date('2026-01-01T00:00:00.000Z'), version = 3) {
  return {
    id: 1, uid: 'diagram-1', name: 'Commerce', sourceType: 'blank', data: null, isDeleted: false,
    version, updatedAt, viewportX: 10, viewportY: 20, viewportZoom: 0.8,
    entities: snapshot().entities.map((entity: any) => ({ ...entity, columns: entity.columns.map((column: any) => ({
      ...column, isPk: column.is_pk, isNullable: column.is_nullable,
    })) })),
    relationships: [{
      id: 'orders-user-fk', sourceEntityId: 'orders', targetEntityId: 'users',
      sourceColumnId: 'orders-user', targetColumnId: 'users-id', type: 'one-to-many',
    }],
  };
}

describe('granular ERD MCP operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDiagram.mockResolvedValue(databaseDiagram());
    mocks.saveDiagram.mockResolvedValue({ success: true, version: 4 });
  });

  it('applies granular updates without replacing unrelated schema objects', () => {
    const result = service.applyErdPatch(snapshot(), [
      { op: 'table_update', table_id: 'users', changes: { comment: 'Identity records' } },
      { op: 'column_add', table_id: 'users', column: { id: 'users-email', name: 'email', type: 'VARCHAR', is_nullable: false, is_unique: true } },
    ]);
    expect(result.entities.find((item: any) => item.id === 'users')).toMatchObject({
      comment: 'Identity records', columns: expect.arrayContaining([expect.objectContaining({ id: 'users-email', name: 'email' })]),
    });
    expect(result.entities.find((item: any) => item.id === 'orders')?.columns).toHaveLength(2);
    expect(result.relationships).toHaveLength(1);
    expect(result.destructive).toBe(false);
  });

  it('previews cascading relationship removal when a table or column is deleted', () => {
    const current = snapshot();
    current.entities[1].indexes = [{ id: 'orders-user-index', entity_id: 'orders', name: 'orders_user_idx', column_ids: ['orders-user'] }];
    current.entities[1].constraints = [{ id: 'orders-user-unique', entity_id: 'orders', kind: 'unique', column_ids: ['orders-user'] }];
    const result = service.applyErdPatch(current, [{ op: 'column_delete', table_id: 'orders', column_id: 'orders-user' }]);
    expect(result.relationships).toEqual([]);
    expect(result.destructive).toBe(true);
    expect(result.changes[0]).toMatchObject({ relationships_deleted: 1, indexes_deleted: 1, constraints_deleted: 1 });
  });

  it('adds validated indexes and constraints with server-generated IDs', async () => {
    const proposal: any = await service.proposeErdPatch('owner', 'diagram-1', [
      { op: 'index_add', table_id: 'orders', index: { name: 'orders_user_idx', column_ids: ['orders-user'] } },
      { op: 'constraint_add', table_id: 'orders', constraint: { kind: 'unique', name: 'orders_user_unique', column_ids: ['orders-user'] } },
    ]);
    expect(proposal.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'index_add', index_id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
      expect.objectContaining({ op: 'constraint_add', constraint_id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    ]));
    expect(proposal.migration_plan).toMatchObject({
      summary: expect.objectContaining({ total: 2 }),
      sql: { postgresql: expect.objectContaining({ forward: expect.stringContaining('CREATE') }), mysql: expect.any(Object) },
    });
  });

  it('rejects duplicate names and relationships to missing columns', () => {
    expect(() => service.applyErdPatch(snapshot(), [{
      op: 'table_add', table: { id: 'new-id', name: 'Users', columns: [] },
    }])).toThrow(/Duplicate table name/);
    expect(() => service.applyErdPatch(snapshot(), [{
      op: 'relationship_add', relationship: {
        id: 'broken', source_entity_id: 'orders', source_column_id: 'missing',
        target_entity_id: 'users', target_column_id: 'users-id',
      },
    }])).toThrow(/missing column/);
  });

  it('validates and updates explicit relationship endpoint semantics', () => {
    const result = service.applyErdPatch(snapshot(), [{
      op: 'relationship_update', relationship_id: 'orders-user-fk',
      changes: { source_cardinality: 'one-or-many', target_cardinality: 'zero-or-one' },
    }]);
    expect(result.relationships[0]).toMatchObject({
      source_cardinality: 'one-or-many', target_cardinality: 'zero-or-one', type: 'one-to-many',
    });
    expect(() => service.applyErdPatch(snapshot(), [{
      op: 'relationship_update', relationship_id: 'orders-user-fk', changes: { target_cardinality: 'sometimes' },
    }])).toThrow(/cardinality/);

    const legacy = service.applyErdPatch(snapshot(), [{
      op: 'relationship_update', relationship_id: 'orders-user-fk', changes: { type: 'many-to-many' },
    }]);
    expect(legacy.relationships[0]).toMatchObject({
      source_cardinality: 'zero-or-many', target_cardinality: 'zero-or-many', type: 'many-to-many',
    });
  });

  it('analyzes an owned diagram impact without writing data', async () => {
    const report: any = await service.analyzeGranularErdImpact('owner', 'diagram-1', 'table-delete', 'users');
    expect(report).toMatchObject({
      root: { table_id: 'users', table_name: 'users' },
      risk: 'critical',
      direct_tables: [expect.objectContaining({ id: 'orders', direction: 'dependent' })],
    });
    expect(mocks.saveDiagram).not.toHaveBeenCalled();
  });

  it('normalizes governance metadata in safe table and column patch previews', async () => {
    const proposal: any = await service.proposeErdPatch('owner', 'diagram-1', [
      { op: 'table_update', table_id: 'users', changes: { governance: {
        businessName: 'User Accounts', description: 'Identity records', domain: 'IAM', owner: 'Platform',
        classification: 'internal', reviewStatus: 'approved', tags: ['core', 'core'],
      } } },
      { op: 'column_update', table_id: 'users', column_id: 'users-id', changes: { governance: {
        description: 'Stable identifier', classification: 'restricted',
      } } },
    ]);
    expect(proposal.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ after: expect.objectContaining({ governance: expect.objectContaining({
        business_name: 'User Accounts', review_status: 'approved', tags: ['core'],
      }) }) }),
      expect.objectContaining({ after: expect.objectContaining({ governance: expect.objectContaining({ classification: 'restricted' }) }) }),
    ]));
    expect(proposal.migration_plan.summary.total).toBe(0);
    expect(mocks.saveDiagram).not.toHaveBeenCalled();
    expect(() => service.applyErdPatch(snapshot(), [{
      op: 'table_update', table_id: 'users', changes: { governance: { classification: 'secret' } },
    }])).toThrow(/classification/);
  });

  it('reads governance coverage and export content without writing', async () => {
    const database = databaseDiagram();
    database.entities[0].governanceData = JSON.stringify({
      description: 'Identity records', domain: 'IAM', owner: 'Platform', classification: 'internal',
    });
    database.entities[0].columns[0].governanceData = JSON.stringify({ description: 'Identifier' });
    mocks.getDiagram.mockResolvedValue(database);
    const dictionary: any = await service.readGranularErdDictionary('owner', 'diagram-1', 'markdown');
    expect(dictionary.report).toMatchObject({ total: 5, documented: 2 });
    expect(dictionary.content).toContain('# Commerce — Data Dictionary');
    expect(dictionary.content).toContain('Domain: IAM');
    expect(mocks.saveDiagram).not.toHaveBeenCalled();
  });

  it('offers focused Data Dictionary proposals through the same safe patch confirmation flow', async () => {
    const proposal: any = await service.proposeErdDictionaryUpdate('owner', 'diagram-1', [
      { table_id: 'users', governance: { business_name: 'Accounts', owner: 'IAM', classification: 'internal' } },
      { table_id: 'orders', column_id: 'orders-user', governance: { description: 'Account reference', classification: 'restricted' } },
    ]);
    expect(proposal.operation).toBe('erd_dictionary_update');
    expect(proposal.updates).toEqual([
      { table_id: 'users', column_id: null },
      { table_id: 'orders', column_id: 'orders-user' },
    ]);
    expect(proposal.changes).toHaveLength(2);
    await expect(service.applyErdPatchProposal('owner', proposal.proposal_id, proposal.confirmation)).resolves.toMatchObject({ status: 'applied' });
  });

  it('generates IDs in preview and requires exact confirmation before saving', async () => {
    const proposal: any = await service.proposeErdPatch('owner', 'diagram-1', [{
      op: 'column_add', table_id: 'users', column: { name: 'email', type: 'VARCHAR', is_nullable: false },
    }]);
    expect(proposal.changes[0].column_id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(service.applyErdPatchProposal('owner', proposal.proposal_id, 'wrong-confirmation')).rejects.toThrow(/exactly match/);
    expect(mocks.saveDiagram).not.toHaveBeenCalled();

    const result: any = await service.applyErdPatchProposal('owner', proposal.proposal_id, proposal.confirmation);
    expect(result.status).toBe('applied');
    expect(mocks.saveDiagram).toHaveBeenCalledWith('diagram-1', 'owner', expect.objectContaining({
      expectedVersion: 3,
      entities: expect.arrayContaining([expect.objectContaining({ id: 'orders' })]),
    }));
  });

  it('rejects foreign-user and stale proposals without mutating the diagram', async () => {
    const foreign: any = await service.proposeErdPatch('owner', 'diagram-1', [{ op: 'table_update', table_id: 'users', changes: { name: 'accounts' } }]);
    await expect(service.applyErdPatchProposal('intruder', foreign.proposal_id, foreign.confirmation)).rejects.toThrow(/missing or expired/);
    expect(mocks.saveDiagram).not.toHaveBeenCalled();

    const stale: any = await service.proposeErdPatch('owner', 'diagram-1', [{ op: 'table_update', table_id: 'users', changes: { name: 'accounts' } }]);
    mocks.getDiagram.mockResolvedValue(databaseDiagram(new Date('2026-01-02T00:00:00.000Z'), 4));
    await expect(service.applyErdPatchProposal('owner', stale.proposal_id, stale.confirmation)).rejects.toThrow(/diagram changed/);
    expect(mocks.saveDiagram).not.toHaveBeenCalled();
  });
});
