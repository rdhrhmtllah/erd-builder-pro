import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readGranularErd: vi.fn(),
  createSubjectArea: vi.fn(),
}));

vi.mock('./erd-granular-service.js', () => ({ readGranularErd: mocks.readGranularErd }));
vi.mock('../routes/diagrams/subject-area-service.js', () => ({ createSubjectArea: mocks.createSubjectArea }));

const service = await import('./erd-organize-service.js');

function snapshot(updatedAt = '2026-01-01T00:00:00.000Z') {
  return {
    uid: 'diagram-1', name: 'Commerce', version: 3, updatedAt,
    entities: [
      { id: 'users', name: 'users', columns: [{ name: 'id' }] },
      { id: 'user_roles', name: 'user_roles', columns: [{ name: 'id' }] },
      { id: 'orders', name: 'orders', columns: [{ name: 'id' }] },
      { id: 'order_items', name: 'order_items', columns: [{ name: 'id' }] },
    ],
    relationships: [
      { source_entity_id: 'order_items', target_entity_id: 'orders' },
      { source_entity_id: 'orders', target_entity_id: 'users' },
    ],
  };
}

const groups = [
  { name: 'Users', node_ids: ['users', 'user_roles'] },
  { name: 'Orders', node_ids: ['orders', 'order_items'] },
];

describe('MCP ERD organizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readGranularErd.mockResolvedValue(snapshot());
    mocks.createSubjectArea.mockImplementation(async (_uid: string, _userId: string, input: any) =>
      ({ id: `area-${input.name}`, name: input.name }));
  });

  it('suggests groups without writing anything', async () => {
    const result: any = await service.analyzeErdOrganization('owner', 'diagram-1');
    expect(result.diagram_name).toBe('Commerce');
    expect(result.table_count).toBe(4);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]).toMatchObject({ node_ids: expect.any(Array), reasons: expect.any(Array) });
    expect(mocks.createSubjectArea).not.toHaveBeenCalled();
  });

  it('previews a proposal without creating areas', async () => {
    const proposal: any = await service.proposeErdOrganization('owner', 'diagram-1', groups);
    expect(proposal).toMatchObject({
      area_count: 2, tables_assigned: 4, tables_left_alone: 0, requires_explicit_confirmation: true,
    });
    expect(proposal.confirmation).toBe(proposal.proposal_id);
    expect(mocks.createSubjectArea).not.toHaveBeenCalled();
  });

  it('assigns a palette colour when none is given, and keeps a valid one', async () => {
    const proposal: any = await service.proposeErdOrganization('owner', 'diagram-1', [
      { name: 'Users', node_ids: ['users'] },
      { name: 'Orders', color: '#ABCDEF', node_ids: ['orders'] },
    ]);
    expect(proposal.groups[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(proposal.groups[1].color).toBe('#abcdef');
  });

  it('rejects a table that is not in the diagram', async () => {
    await expect(service.proposeErdOrganization('owner', 'diagram-1', [{ name: 'Ghost', node_ids: ['nope'] }]))
      .rejects.toThrow(/not in this diagram/);
  });

  it('rejects the same table appearing in two groups', async () => {
    await expect(service.proposeErdOrganization('owner', 'diagram-1', [
      { name: 'A', node_ids: ['users'] },
      { name: 'B', node_ids: ['users'] },
    ])).rejects.toThrow(/belongs to one Subject Area/);
  });

  it('rejects an empty or oversized plan', async () => {
    await expect(service.proposeErdOrganization('owner', 'diagram-1', [])).rejects.toThrow(/between 1 and 40/);
    await expect(service.proposeErdOrganization('owner', 'diagram-1', [{ name: '', node_ids: ['users'] }]))
      .rejects.toThrow(/name is required/);
  });

  it('creates every area only after an exact confirmation', async () => {
    const proposal: any = await service.proposeErdOrganization('owner', 'diagram-1', groups);

    await expect(service.applyErdOrganizationProposal('owner', proposal.proposal_id, '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow(/exactly match/);
    expect(mocks.createSubjectArea).not.toHaveBeenCalled();

    const applied: any = await service.applyErdOrganizationProposal('owner', proposal.proposal_id, proposal.confirmation);
    expect(applied.status).toBe('applied');
    expect(applied.created_areas.map((area: any) => area.name)).toEqual(['Users', 'Orders']);
    expect(mocks.createSubjectArea).toHaveBeenCalledTimes(2);
  });

  it('refuses a proposal belonging to another user', async () => {
    const proposal: any = await service.proposeErdOrganization('owner', 'diagram-1', groups);
    await expect(service.applyErdOrganizationProposal('intruder', proposal.proposal_id, proposal.confirmation))
      .rejects.toThrow(/missing or expired/);
    expect(mocks.createSubjectArea).not.toHaveBeenCalled();
  });

  it('refuses to apply onto a diagram that changed since the preview', async () => {
    const proposal: any = await service.proposeErdOrganization('owner', 'diagram-1', groups);
    mocks.readGranularErd.mockResolvedValue(snapshot('2026-02-02T00:00:00.000Z'));
    await expect(service.applyErdOrganizationProposal('owner', proposal.proposal_id, proposal.confirmation))
      .rejects.toThrow(/diagram changed/);
    expect(mocks.createSubjectArea).not.toHaveBeenCalled();
  });

  it('creates nothing when a table disappeared while the proposal was open', async () => {
    const proposal: any = await service.proposeErdOrganization('owner', 'diagram-1', groups);
    const shrunk = snapshot();
    shrunk.entities = shrunk.entities.filter(entity => entity.id !== 'order_items');
    mocks.readGranularErd.mockResolvedValue(shrunk);

    await expect(service.applyErdOrganizationProposal('owner', proposal.proposal_id, proposal.confirmation))
      .rejects.toThrow(/no longer in this diagram/);
    expect(mocks.createSubjectArea).not.toHaveBeenCalled();
  });

  it('cannot replay a proposal after it has been applied', async () => {
    const proposal: any = await service.proposeErdOrganization('owner', 'diagram-1', groups);
    await service.applyErdOrganizationProposal('owner', proposal.proposal_id, proposal.confirmation);
    await expect(service.applyErdOrganizationProposal('owner', proposal.proposal_id, proposal.confirmation))
      .rejects.toThrow(/missing or expired/);
  });
});
