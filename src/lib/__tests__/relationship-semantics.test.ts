import { describe, expect, it } from 'vitest';
import { endpointCardinalitySymbol, inferRelationshipSemantics, relationshipTypeFromEndpoints } from '../relationship-semantics';

describe('relationship semantics', () => {
  it('infers optional target participation from a nullable foreign key', () => {
    expect(inferRelationshipSemantics({ label: '1:N', data: {} }, true)).toMatchObject({
      source: 'zero-or-many', target: 'zero-or-one', sourceSymbol: '0..N', targetSymbol: '0..1', type: 'one-to-many',
    });
    expect(inferRelationshipSemantics({ label: '1:N', data: {} }, false).target).toBe('exactly-one');
  });

  it('preserves explicit endpoint semantics over legacy labels', () => {
    expect(inferRelationshipSemantics({
      label: '1:N', data: { source_cardinality: 'one-or-many', target_cardinality: 'zero-or-one' },
    })).toMatchObject({ source: 'one-or-many', target: 'zero-or-one', type: 'one-to-many' });
  });

  it('derives legacy relationship types and readable endpoint symbols', () => {
    expect(relationshipTypeFromEndpoints('exactly-one', 'zero-or-one')).toBe('one-to-one');
    expect(relationshipTypeFromEndpoints('zero-or-many', 'one-or-many')).toBe('many-to-many');
    expect(endpointCardinalitySymbol('one-or-many')).toBe('1..N');
  });
});
