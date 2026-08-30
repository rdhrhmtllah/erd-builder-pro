import type { Edge } from '@xyflow/react';
import type { RelationshipEndpointCardinality } from '@/types';

export const ENDPOINT_CARDINALITIES: Array<{
  value: RelationshipEndpointCardinality;
  symbol: string;
  label: string;
}> = [
  { value: 'zero-or-one', symbol: '0..1', label: 'Zero or one' },
  { value: 'exactly-one', symbol: '1', label: 'Exactly one' },
  { value: 'zero-or-many', symbol: '0..N', label: 'Zero or many' },
  { value: 'one-or-many', symbol: '1..N', label: 'One or many' },
];

const valid = new Set(ENDPOINT_CARDINALITIES.map(item => item.value));

export function normalizeEndpointCardinality(value: unknown, fallback: RelationshipEndpointCardinality) {
  return valid.has(value as RelationshipEndpointCardinality) ? value as RelationshipEndpointCardinality : fallback;
}

export function endpointCardinalitySymbol(value: RelationshipEndpointCardinality) {
  return ENDPOINT_CARDINALITIES.find(item => item.value === value)?.symbol || '?';
}

export function relationshipTypeFromEndpoints(source: RelationshipEndpointCardinality, target: RelationshipEndpointCardinality) {
  const sourceMany = source.endsWith('many');
  const targetMany = target.endsWith('many');
  if (sourceMany && targetMany) return 'many-to-many';
  if (!sourceMany && !targetMany) return 'one-to-one';
  return 'one-to-many';
}

export function inferRelationshipSemantics(edge: Pick<Edge, 'data' | 'label'> & { type?: string }, sourceNullable = true) {
  const data = (edge.data || {}) as Record<string, unknown>;
  const legacy = String(data.relationship_type || edge.label || edge.type || '').toLowerCase();
  const legacyManyToMany = legacy.includes('n:m') || legacy.includes('many-to-many');
  const legacyOneToOne = legacy.includes('1:1') || legacy.includes('one-to-one');
  const sourceFallback: RelationshipEndpointCardinality = legacyOneToOne ? 'exactly-one' : 'zero-or-many';
  const targetFallback: RelationshipEndpointCardinality = legacyManyToMany
    ? 'zero-or-many'
    : sourceNullable ? 'zero-or-one' : 'exactly-one';
  const source = normalizeEndpointCardinality(data.source_cardinality ?? data.sourceCardinality, sourceFallback);
  const target = normalizeEndpointCardinality(data.target_cardinality ?? data.targetCardinality, targetFallback);
  return {
    source,
    target,
    sourceSymbol: endpointCardinalitySymbol(source),
    targetSymbol: endpointCardinalitySymbol(target),
    type: relationshipTypeFromEndpoints(source, target),
  };
}
