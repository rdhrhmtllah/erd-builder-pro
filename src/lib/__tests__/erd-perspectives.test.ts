import { describe, expect, it } from 'vitest';
import { layoutErdPerspective, normalizePerspectiveData } from '../../../shared/erd-perspectives';

describe('ERD perspectives', () => {
  it('normalizes unsafe or duplicate section membership without losing valid tables', () => {
    const result = normalizePerspectiveData({
      direction: 'top-to-bottom', edge_mode: 'cross-section',
      sections: [
        { id: 'a', name: 'Identity', color: '#0EA5E9', node_ids: ['users', 'roles', 'users'] },
        { id: 'b', name: 'Operations', color: 'invalid', node_ids: ['roles', 'orders', 'missing'] },
      ],
      node_positions: { users: { x: 10, y: 20 }, missing: { x: 9, y: 9 } },
    }, ['users', 'roles', 'orders']);
    expect(result.direction).toBe('top-to-bottom');
    expect(result.edge_mode).toBe('cross-section');
    expect(result.sections[0].node_ids).toEqual(['users', 'roles']);
    expect(result.sections[1].node_ids).toEqual(['orders']);
    expect(result.sections[1].color).toBe('#0ea5e9');
    expect(result.node_positions).toEqual({ users: { x: 10, y: 20 } });
  });

  it('creates non-overlapping colored section frames and positions every table', () => {
    const layout = layoutErdPerspective(
      [
        { id: 'users', columnCount: 4 }, { id: 'roles', columnCount: 2 },
        { id: 'employees', columnCount: 7 }, { id: 'attendance', columnCount: 5 },
      ],
      [
        { id: 'user-role', source: 'users', target: 'roles' },
        { id: 'user-employee', source: 'users', target: 'employees' },
        { id: 'employee-attendance', source: 'employees', target: 'attendance' },
      ],
      { sections: [
        { id: 'identity', name: 'Identity', color: '#6366f1', node_ids: ['users', 'roles'], order: 0 },
        { id: 'workforce', name: 'Workforce', color: '#10b981', node_ids: ['employees', 'attendance'], order: 1 },
      ], direction: 'left-to-right' },
    );
    expect(Object.keys(layout.node_positions)).toHaveLength(4);
    expect(layout.sections).toHaveLength(2);
    expect(layout.sections.every(section => (section.width || 0) >= 360 && (section.height || 0) >= 170)).toBe(true);
    expect(layout.edge_routes['user-employee']).toMatchObject({ axis: 'x', cross_section: true });
    const [first, second] = layout.sections;
    expect((first.x || 0) + (first.width || 0)).toBeLessThanOrEqual(second.x || 0);
  });

  it('adds a safe shared section for tables omitted from a business view', () => {
    const layout = layoutErdPerspective(
      [{ id: 'users' }, { id: 'audit_logs' }], [],
      { sections: [{ id: 'identity', name: 'Identity', color: '#6366f1', node_ids: ['users'], order: 0 }] },
    );
    expect(layout.unassigned_node_ids).toEqual(['audit_logs']);
    expect(layout.sections.find(section => section.id === '__unassigned__')?.node_ids).toEqual(['audit_logs']);
  });
});
