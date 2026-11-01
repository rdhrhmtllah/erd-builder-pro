import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyColumnColorMarking, applyTableDocumentationBulk } from '../erd-meta-service';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    diagram: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    entity: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    column: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../lib/collab/server.js', () => ({
  broadcastCollabEvent: vi.fn(),
}));

import { prisma } from '../../lib/prisma.js';
import { broadcastCollabEvent } from '../../lib/collab/server.js';

describe('MCP Meta Service: Color Marking & Documentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies column color marking to matched columns and broadcasts change', async () => {
    (prisma.diagram.findFirst as any).mockResolvedValueOnce({
      id: 1,
      uid: 'test-diagram-uid',
      version: 4,
    });
    (prisma.entity.findFirst as any).mockResolvedValueOnce({
      id: 'entity-users-id',
    });
    (prisma.column.updateMany as any).mockResolvedValueOnce({ count: 2 });
    (prisma.diagram.update as any).mockResolvedValueOnce({ version: 5 });

    const res = await applyColumnColorMarking('user-1', 'test-diagram-uid', [
      { tableName: 'users', columnNames: ['email', 'password'], color: '#ef4444' },
    ]);

    expect(res.status).toBe('applied');
    expect(res.version).toBe(5);
    expect(res.columns_updated).toBe(2);

    expect(prisma.column.updateMany).toHaveBeenCalledWith({
      where: {
        entityId: 'entity-users-id',
        name: { in: ['email', 'password'] },
      },
      data: {
        color: '#ef4444',
      },
    });

    expect(broadcastCollabEvent).toHaveBeenCalledWith(
      'test-diagram-uid',
      expect.objectContaining({
        t: 'content-change',
        version: 5,
      })
    );
  });

  it('applies bulk table documentation and broadcasts change', async () => {
    (prisma.diagram.findFirst as any).mockResolvedValueOnce({
      id: 1,
      uid: 'test-diagram-uid',
      version: 5,
    });
    (prisma.entity.updateMany as any).mockResolvedValueOnce({ count: 1 });
    (prisma.diagram.update as any).mockResolvedValueOnce({ version: 6 });

    const res = await applyTableDocumentationBulk('user-1', 'test-diagram-uid', [
      { tableName: 'orders', description: 'Table for storing customer purchase orders and statuses' },
    ]);

    expect(res.status).toBe('applied');
    expect(res.version).toBe(6);
    expect(res.tables_documented).toBe(1);

    expect(prisma.entity.updateMany).toHaveBeenCalledWith({
      where: {
        diagramId: 1,
        name: 'orders',
      },
      data: {
        comment: 'Table for storing customer purchase orders and statuses',
      },
    });

    expect(broadcastCollabEvent).toHaveBeenCalledWith(
      'test-diagram-uid',
      expect.objectContaining({
        t: 'content-change',
        version: 6,
      })
    );
  });
});
