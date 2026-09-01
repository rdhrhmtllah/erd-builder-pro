import { describe, expect, it } from 'vitest';
import { planErdMigration } from '../../../shared/erd-migration-planner';

const column = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, type: 'BIGINT', is_nullable: true, ...extra });
const before: any = {
  tables: [
    { id: 'users', name: 'users', columns: [column('user-id', 'id', { is_pk: true, is_nullable: false }), column('user-name', 'name')] },
    { id: 'orders', name: 'orders', columns: [column('order-id', 'id', { is_pk: true, is_nullable: false }), column('order-user', 'user_id')] },
  ],
  relationships: [{ id: 'orders-user-fk', source_entity_id: 'orders', source_column_id: 'order-user', target_entity_id: 'users', target_column_id: 'user-id', constraint_name: 'orders_user_fk' }],
};

describe('ERD migration planner', () => {
  it('orders foreign-key removal before destructive column and table changes', () => {
    const after = { tables: [before.tables[1]], relationships: [] };
    const plan = planErdMigration(before, after);
    expect(plan.steps.map(item => item.phase)).toEqual(['drop-relations', 'drop-objects']);
    expect(plan.steps[0]).toMatchObject({ kind: 'relationship', title: 'Drop foreign key' });
    expect(plan.steps[1]).toMatchObject({ kind: 'table', risk: 'breaking', reversible: false });
    expect(plan.sql.postgresql.forward.indexOf('DROP CONSTRAINT')).toBeLessThan(plan.sql.postgresql.forward.indexOf('DROP TABLE'));
    expect(plan.sql.postgresql.rollback).toContain('Data restore required');
  });

  it('detects stable-ID table and column renames and creates reversible SQL', () => {
    const after = structuredClone(before);
    after.tables[0].name = 'accounts';
    after.tables[0].columns[1].name = 'display_name';
    const plan = planErdMigration(before, after);
    expect(plan.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Rename table', object: 'users → accounts', reversible: true }),
      expect.objectContaining({ title: 'Rename or alter column', object: 'accounts.name → display_name', reversible: true }),
    ]));
    expect(plan.sql.postgresql.forward).toContain('RENAME TO "accounts"');
    expect(plan.sql.postgresql.rollback).toContain('RENAME TO "users"');
  });

  it('flags required additions and type changes as breaking', () => {
    const after = structuredClone(before);
    after.tables[1].columns.push(column('order-total', 'total', { type: 'DECIMAL', is_nullable: false }));
    after.tables[1].columns[1].type = 'UUID';
    const plan = planErdMigration(before, after);
    expect(plan.summary.breaking).toBe(2);
    expect(plan.steps.find(item => item.object === 'orders.total')?.warnings.join(' ')).toMatch(/backfill/i);
    expect(plan.steps.find(item => item.object === 'orders.user_id')?.reversible).toBe(false);
    expect(plan.steps.map(item => item.phase)).toEqual(expect.arrayContaining(['drop-relations', 'alter-columns', 'add-relations']));
    expect(plan.steps.find(item => item.title === 'Temporarily drop foreign key')?.risk).toBe('caution');
  });

  it('emits relation action changes as an ordered drop and add pair', () => {
    const after = structuredClone(before);
    after.relationships[0].on_delete = 'CASCADE';
    const plan = planErdMigration(before, after);
    expect(plan.steps.map(item => item.phase)).toEqual(['drop-relations', 'add-relations']);
    expect(plan.sql.mysql.forward).toContain('ON DELETE CASCADE');
  });

  it('generates SQL Server forward and rollback migrations', () => {
    const after = structuredClone(before);
    after.tables[0].name = 'accounts';
    after.tables[1].columns.push(column('order-created', 'created_at', { type: 'TIMESTAMP', is_nullable: false, default_value: 'CURRENT_TIMESTAMP' }));
    after.relationships[0].on_delete = 'CASCADE';
    const plan = planErdMigration(before, after);

    expect(plan.sql.sqlserver.forward).toContain("EXEC sp_rename N'users', N'accounts'");
    expect(plan.sql.sqlserver.forward).toContain('ALTER TABLE [orders] ADD [created_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()');
    expect(plan.sql.sqlserver.forward).toContain('ADD CONSTRAINT [orders_user_fk] FOREIGN KEY');
    expect(plan.sql.sqlserver.forward).toContain('ON DELETE CASCADE');
    expect(plan.sql.sqlserver.rollback).toContain("EXEC sp_rename N'accounts', N'users'");
  });

  it('plans indexes and composite constraints around column alterations', () => {
    const indexedBefore: any = structuredClone(before);
    indexedBefore.tables[1].indexes = [{ id: 'orders-user-idx', name: 'orders_user_idx', column_ids: ['order-user'] }];
    indexedBefore.tables[1].constraints = [{ id: 'orders-pk', kind: 'primary_key', name: 'orders_pk', column_ids: ['order-id', 'order-user'] }];
    const after: any = structuredClone(indexedBefore);
    after.tables[1].indexes[0].is_unique = true;
    after.tables[1].constraints[0].kind = 'unique';
    const plan = planErdMigration(indexedBefore, after);
    expect(plan.steps.map(item => item.kind)).toEqual(expect.arrayContaining(['index', 'constraint']));
    expect(plan.steps.map(item => item.phase)).toEqual([
      'drop-supporting', 'drop-supporting', 'add-supporting', 'add-supporting',
    ]);
    expect(plan.sql.postgresql.forward).toContain('CREATE UNIQUE INDEX');
    expect(plan.sql.postgresql.forward).toContain('ADD CONSTRAINT "orders_pk" UNIQUE');
  });

  it('returns a clean plan for identical schemas', () => {
    const plan = planErdMigration(before, structuredClone(before));
    expect(plan.summary.total).toBe(0);
    expect(plan.steps).toEqual([]);
  });

  it('warns when name-based DBML comparison could hide a rename', () => {
    const after = structuredClone(before);
    after.tables[0].columns = [column('new-random-id', 'display_name')];
    const plan = planErdMigration(before, after);
    expect(plan.warnings.join(' ')).toMatch(/may represent a rename/i);
  });
});
