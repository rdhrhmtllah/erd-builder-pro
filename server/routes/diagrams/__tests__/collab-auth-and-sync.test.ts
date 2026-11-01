import { describe, expect, it, vi, beforeEach } from 'vitest';
import { evaluatePublicDocAccess } from '../../../lib/public-doc-gate';

describe('Public Document Gate & Permissions', () => {
  const baseDoc = {
    userId: 'user-owner-1',
    isPublic: true,
    shareRole: 'view',
    isDeleted: false,
  };

  it('evaluates shareRole="view" as role="view" for non-owners', () => {
    const res = evaluatePublicDocAccess(baseDoc, { viewerId: 'visitor-anon' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isOwner).toBe(false);
      expect(res.role).toBe('view');
    }
  });

  it('evaluates shareRole="edit" as role="edit" for non-owners', () => {
    const editDoc = { ...baseDoc, shareRole: 'edit' };
    const res = evaluatePublicDocAccess(editDoc, { viewerId: 'visitor-anon' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isOwner).toBe(false);
      expect(res.role).toBe('edit');
    }
  });

  it('owner always has role="edit" even if shareRole is view', () => {
    const res = evaluatePublicDocAccess(baseDoc, { viewerId: 'user-owner-1' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isOwner).toBe(true);
      expect(res.role).toBe('edit');
    }
  });

  it('denies access if expired regardless of role', () => {
    const pastDate = new Date(Date.now() - 3600_000);
    const expiredDoc = { ...baseDoc, shareRole: 'edit', expiryDate: pastDate };
    const res = evaluatePublicDocAccess(expiredDoc, { viewerId: 'visitor-anon' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('expired');
      expect(res.status).toBe(403);
    }
  });

  it('requires correct shareToken before granting role', () => {
    const tokenDoc = { ...baseDoc, shareRole: 'edit', shareToken: 'secret123' };
    const wrongRes = evaluatePublicDocAccess(tokenDoc, { viewerId: 'visitor-anon', providedToken: 'wrong' });
    expect(wrongRes.ok).toBe(false);
    if (!wrongRes.ok) {
      expect(wrongRes.code).toBe('token_required');
      expect(wrongRes.status).toBe(401);
    }

    const rightRes = evaluatePublicDocAccess(tokenDoc, { viewerId: 'visitor-anon', providedToken: 'secret123' });
    expect(rightRes.ok).toBe(true);
    if (rightRes.ok) {
      expect(rightRes.role).toBe('edit');
    }
  });
});
