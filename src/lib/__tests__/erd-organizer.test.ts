import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { suggestErdOrganizations } from '../erd-organizer';

const node = (id: string, name: string, domain?: string): Node<Entity> => ({
  id, type: 'entity', position: { x: 0, y: 0 }, data: { id, name, columns: [], ...(domain ? { governance: { domain } } : {}) } as Entity,
});

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

describe('suggestErdOrganizations', () => {
  it('groups explicit domains before naming prefixes', () => {
    const result = suggestErdOrganizations([
      node('u', 'users', 'Identity'), node('ur', 'user_roles', 'Identity'), node('o', 'orders'),
    ], [edge('e', 'o', 'u')]);
    expect(result[0]).toMatchObject({ name: 'Identity', node_ids: ['u', 'ur'], confidence: 'high' });
  });

  it('is deterministic and reports relation boundaries', () => {
    const nodes = [node('a', 'sales_orders'), node('b', 'sales_items'), node('c', 'products')];
    const result = suggestErdOrganizations(nodes, [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]);
    expect(result).toEqual(suggestErdOrganizations(nodes, [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]));
    expect(result.find(item => item.name === 'Sales')).toMatchObject({ internal_relations: 1, external_relations: 1 });
  });

  it('keeps isolated tables visible as unassigned', () => {
    const result = suggestErdOrganizations([node('x', 'misc_record')], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Shared / Unassigned', confidence: 'low' });
  });
});
