import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubjectAreaSchema, updateSubjectAreaSchema } from '../../lib/validation.js';

const mocks = vi.hoisted(() => ({
  diagramFindFirst: vi.fn(),
  entityCount: vi.fn(),
  areaCreate: vi.fn(),
  areaFindMany: vi.fn(),
  areaFindFirst: vi.fn(),
  areaUpdate: vi.fn(),
  areaDeleteMany: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    diagram: { findFirst: mocks.diagramFindFirst },
    entity: { count: mocks.entityCount },
    diagramSubjectArea: {
      create: mocks.areaCreate,
      findMany: mocks.areaFindMany,
      findFirst: mocks.areaFindFirst,
      update: mocks.areaUpdate,
      deleteMany: mocks.areaDeleteMany,
    },
  },
}));

vi.mock('./service.js', () => ({
  uidWhereClause: (uid: string, userId: string) => ({ uid, userId }),
}));

const service = await import('./subject-area-service.js');

describe('diagram subject areas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates bounded names, colors, node lists, and viewport values', () => {
    expect(createSubjectAreaSchema.safeParse({
      name: 'Payroll', color: '#6366f1', node_ids: ['employees'],
      viewport_x: 1, viewport_y: 2, viewport_zoom: 1,
    }).success).toBe(true);
    expect(createSubjectAreaSchema.safeParse({
      name: '', color: 'red', node_ids: [], viewport_x: 0, viewport_y: 0, viewport_zoom: 10,
    }).success).toBe(false);
    expect(updateSubjectAreaSchema.safeParse({}).success).toBe(false);
  });

  it('does not expose or create areas when the diagram is not owned by the user', async () => {
    mocks.diagramFindFirst.mockResolvedValue(null);

    await expect(service.listSubjectAreas('private-diagram', 'other-user')).resolves.toBeNull();
    await expect(service.createSubjectArea('private-diagram', 'other-user', {
      name: 'Private', color: '#6366f1', node_ids: ['users'],
      viewport_x: 0, viewport_y: 0, viewport_zoom: 1,
    })).resolves.toBeNull();
    expect(mocks.areaFindMany).not.toHaveBeenCalled();
    expect(mocks.areaCreate).not.toHaveBeenCalled();
  });

  it('rejects table ids outside the owned diagram', async () => {
    mocks.diagramFindFirst.mockResolvedValue({ id: 7 });
    mocks.entityCount.mockResolvedValue(1);

    await expect(service.createSubjectArea('diagram', 'owner', {
      name: 'Mixed', color: '#6366f1', node_ids: ['users', 'foreign-table'],
      viewport_x: 0, viewport_y: 0, viewport_zoom: 1,
    })).rejects.toBeInstanceOf(service.InvalidSubjectAreaNodesError);
    expect(mocks.areaCreate).not.toHaveBeenCalled();
  });

  it('normalizes table ids and serializes the API response', async () => {
    mocks.diagramFindFirst.mockResolvedValue({ id: 7 });
    mocks.entityCount.mockResolvedValue(2);
    mocks.areaCreate.mockImplementation(async ({ data }) => ({
      id: 'area-1', ...data, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    }));

    const result = await service.createSubjectArea('diagram', 'owner', {
      name: ' Core ', color: '#A855F7', node_ids: [' users ', 'orders', 'users'],
      viewport_x: 10, viewport_y: 20, viewport_zoom: 0.8,
    });

    expect(mocks.areaCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      name: 'Core', color: '#a855f7', nodeIds: '["users","orders"]', diagramId: 7,
    }) });
    expect(result).toMatchObject({ id: 'area-1', name: 'Core', node_ids: ['users', 'orders'], viewport_zoom: 0.8 });
  });

  it('returns a parent Area with its descendants in the effective table set', async () => {
    mocks.diagramFindFirst.mockResolvedValue({ id: 7 });
    mocks.areaFindMany.mockResolvedValue([
      { id: 'root', name: 'HCIS', color: '#6366f1', nodeIds: '["employees"]', parentId: null, viewportX: 0, viewportY: 0, viewportZoom: 1 },
      { id: 'child', name: 'Payroll', color: '#10b981', nodeIds: '["payslips"]', parentId: 'root', viewportX: 0, viewportY: 0, viewportZoom: 1 },
    ]);

    const areas: any[] = await service.listSubjectAreas('diagram', 'owner') as any[];
    expect(areas.find(area => area.id === 'root')).toMatchObject({ depth: 0, effective_node_ids: ['employees', 'payslips'] });
    expect(areas.find(area => area.id === 'child')).toMatchObject({ depth: 1, effective_node_ids: ['payslips'] });
  });

  it('previews and applies an owned Subject Area only with an exact confirmation', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    mocks.diagramFindFirst.mockResolvedValue({ id: 7, uid: 'diagram', name: 'Commerce', updatedAt: now });
    mocks.entityCount.mockResolvedValue(2);
    mocks.areaCreate.mockImplementation(async ({ data }) => ({ id: 'area-1', ...data, createdAt: now, updatedAt: now }));

    const proposal: any = await service.proposeSubjectAreaChange('owner', 'diagram', {
      op: 'create', area: { name: 'Orders', color: '#10b981', node_ids: ['users', 'orders'] },
    });
    expect(proposal).toMatchObject({ action: 'create', table_count: 2, requires_explicit_confirmation: true });
    await expect(service.applySubjectAreaProposal('owner', proposal.proposal_id, 'wrong')).rejects.toThrow(/exactly match/);
    const applied: any = await service.applySubjectAreaProposal('owner', proposal.proposal_id, proposal.confirmation);
    expect(applied.result).toMatchObject({ name: 'Orders', node_ids: ['users', 'orders'] });
  });
});
