import { describe, expect, it } from 'vitest';
import { canvasToMigrationSchema, historySnapshotToMigrationSchema } from '../erd-migration-adapter';

describe('ERD migration schema adapters', () => {
  it('converts canvas handles and relationship metadata', () => {
    const nodes: any[] = [
      { id: 'orders', data: { name: 'orders', columns: [{ id: 'user-id', name: 'user_id', type: 'BIGINT' }] } },
      { id: 'users', data: { name: 'users', columns: [{ id: 'id', name: 'id', type: 'BIGINT' }] } },
    ];
    const edges: any[] = [{
      id: 'fk', source: 'orders', target: 'users', sourceHandle: 'col-user-id-source-l', targetHandle: 'col-id-target-r',
      data: { on_delete: 'CASCADE', source_cardinality: 'zero-or-many' },
    }];
    expect(canvasToMigrationSchema(nodes, edges).relationships[0]).toMatchObject({
      source_column_id: 'user-id', target_column_id: 'id', on_delete: 'CASCADE', source_cardinality: 'zero-or-many',
    });
  });

  it('normalizes camel-case history snapshots', () => {
    const schema = historySnapshotToMigrationSchema({
      entities: [{ id: 'users', name: 'users', columns: [] }],
      relationships: [{ id: 'fk', sourceEntityId: 'orders', targetEntityId: 'users', sourceColumnId: 'uid', targetColumnId: 'id' }],
    });
    expect(schema.relationships[0]).toMatchObject({ source_entity_id: 'orders', target_entity_id: 'users' });
  });
});
