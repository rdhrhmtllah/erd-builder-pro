import { describe, expect, it, vi, beforeEach } from 'vitest';
import { savePublicDiagram } from '../public-diagram-sync';

// Mock apiFetch
vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../api';

describe('savePublicDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes entities, relationships, and headers correctly', async () => {
    (apiFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, version: 5 }),
    });

    const nodes: any[] = [
      { id: '1', position: { x: 100, y: 200 }, data: { id: '1', name: 'users' } },
    ];
    const edges: any[] = [];
    const viewport = { x: 0, y: 0, zoom: 1 };

    const result = await savePublicDiagram('test-uid', nodes, edges, viewport, {
      token: 'secret-token',
      clientId: 'client-123',
      editorName: 'Alice',
      expectedVersion: 4,
    });

    expect(result.ok).toBe(true);
    expect(result.version).toBe(5);

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/diagrams/public/test-uid/save',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-share-token': 'secret-token',
          'x-collab-client-id': 'client-123',
        },
      })
    );
  });

  it('handles 409 conflict gracefully', async () => {
    (apiFetch as any).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ conflict: true, currentVersion: 7 }),
    });

    const result = await savePublicDiagram('test-uid', [], [], { x: 0, y: 0, zoom: 1 });
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.version).toBe(7);
  });
});
