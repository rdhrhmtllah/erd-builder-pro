import { describe, expect, it } from 'vitest';
import type { Entity, Relationship } from '@/types';
import {
  buildColumnList, buildCopyText, buildJoinedSelect, buildMultiCopyText, buildTableQuery,
} from '../erd-query-builder';

let seq = 0;
const col = (name: string, over: Partial<Entity['columns'][number]> = {}) => ({
  id: `c${++seq}`, name, type: 'varchar', is_pk: false, is_nullable: true, ...over,
});

const table = (name: string, columns: any[], id = name): Entity => ({
  id, name, x: 0, y: 0, color: '#fff', columns,
});

const users = () => table('users', [
  col('id', { type: 'bigint', is_pk: true, is_nullable: false }),
  col('email', { is_nullable: false }),
  col('created_at', { type: 'timestamp' }),
]);

const orders = () => table('orders', [
  col('id', { type: 'bigint', is_pk: true, is_nullable: false }),
  col('user_id', { type: 'bigint', is_nullable: false }),
  col('total', { type: 'decimal' }),
]);

const rel = (source: string, sourceCol: string, target: string, targetCol: string): Relationship => ({
  id: `${source}-${target}`, source_entity_id: source, target_entity_id: target,
  source_column_id: sourceCol, target_column_id: targetCol, type: 'many-to-one',
});

/** Relationships store column ids, so tests need the generated id, not the name. */
const colId = (entity: Entity, name: string) => entity.columns.find(c => c.name === name)!.id;

const pg = { dialect: 'postgresql' as const, placeholders: 'named' as const };

describe('buildTableQuery — SELECT', () => {
  it('names every column instead of using a star', () => {
    // A star hides columns added later and makes pasted code quietly wrong.
    expect(buildTableQuery(users(), 'select', pg)).toBe(
      'SELECT "id", "email", "created_at"\nFROM "users";'
    );
  });

  it('quotes the way each dialect does', () => {
    expect(buildTableQuery(users(), 'select', { ...pg, dialect: 'mysql' })).toContain('FROM `users`');
    expect(buildTableQuery(users(), 'select', { ...pg, dialect: 'sqlserver' })).toContain('FROM [users]');
  });

  it('escapes a quote character inside an identifier', () => {
    const odd = table('we"ird', [col('a"b')]);
    expect(buildTableQuery(odd, 'select', pg)).toBe('SELECT "a""b"\nFROM "we""ird";');
  });

  it('breaks a wide table onto one column per line', () => {
    const wide = table('wide', ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(n => col(n)));
    const sql = buildTableQuery(wide, 'select', pg);
    expect(sql.startsWith('SELECT\n  "a",\n  "b",')).toBe(true);
    expect(sql).toContain('"g"\nFROM "wide";');
  });

  it('says so rather than emitting a broken statement for a table with no columns', () => {
    expect(buildTableQuery(table('empty', []), 'select', pg)).toBe('-- "empty" has no columns yet.');
  });
});

describe('buildTableQuery — INSERT', () => {
  it('leaves out an integer primary key the database generates', () => {
    expect(buildTableQuery(users(), 'insert', pg)).toBe(
      'INSERT INTO "users" ("email", "created_at")\nVALUES (:email, :created_at);'
    );
  });

  it('includes a uuid primary key, which the caller has to supply', () => {
    const t = table('sessions', [col('id', { type: 'uuid', is_pk: true }), col('token')]);
    expect(buildTableQuery(t, 'insert', pg)).toContain('("id", "token")');
  });

  it('includes every part of a composite primary key', () => {
    const t = table('role_user', [
      col('role_id', { type: 'bigint', is_pk: true }),
      col('user_id', { type: 'bigint', is_pk: true }),
    ]);
    expect(buildTableQuery(t, 'insert', pg)).toContain('("role_id", "user_id")');
  });

  it('uses @ placeholders on SQL Server, which has no : syntax', () => {
    expect(buildTableQuery(users(), 'insert', { dialect: 'sqlserver', placeholders: 'named' }))
      .toContain('VALUES (@email, @created_at)');
  });

  it('supports positional placeholders', () => {
    expect(buildTableQuery(users(), 'insert', { ...pg, placeholders: 'positional' }))
      .toContain('VALUES (?, ?)');
  });

  it('supports literal sample values so the statement runs as-is', () => {
    const t = table('metrics', [
      col('label', { is_nullable: false }),
      col('score', { type: 'integer' }),
      col('active', { type: 'boolean' }),
      col('seen_at', { type: 'timestamp' }),
    ]);
    expect(buildTableQuery(t, 'insert', { ...pg, placeholders: 'literal' }))
      .toContain("VALUES ('', 0, FALSE, CURRENT_TIMESTAMP)");
  });

  it('falls back to a comment when every column is a generated key', () => {
    const t = table('counters', [col('id', { type: 'bigint', is_pk: true })]);
    expect(buildTableQuery(t, 'insert', pg)).toBe('-- "counters" has no insertable columns.');
  });
});

describe('buildTableQuery — UPDATE and DELETE', () => {
  it('sets the non-key columns and keys the row by its primary key', () => {
    expect(buildTableQuery(users(), 'update', pg)).toBe(
      'UPDATE "users"\nSET "email" = :email,\n    "created_at" = :created_at\nWHERE "id" = :id;'
    );
  });

  it('deletes by primary key', () => {
    expect(buildTableQuery(users(), 'delete', pg)).toBe('DELETE FROM "users"\nWHERE "id" = :id;');
  });

  it('joins every part of a composite key with AND', () => {
    const t = table('role_user', [
      col('role_id', { type: 'bigint', is_pk: true }),
      col('user_id', { type: 'bigint', is_pk: true }),
      col('granted_at', { type: 'timestamp' }),
    ]);
    expect(buildTableQuery(t, 'delete', pg)).toContain('WHERE "role_id" = :role_id AND "user_id" = :user_id');
  });

  it('matches nothing when the table has no primary key', () => {
    // A pasted DELETE without a usable key must not be able to empty a table.
    const t = table('logs', [col('message'), col('level')]);
    const sql = buildTableQuery(t, 'delete', pg);
    expect(sql).toContain('WHERE 1 = 0');
    expect(sql).toMatch(/-- .*no primary key/i);
  });

  it('still refuses to key an UPDATE on nothing', () => {
    const t = table('logs', [col('message'), col('level')]);
    const sql = buildTableQuery(t, 'update', pg);
    expect(sql).toContain('SET "message" = :message');
    expect(sql).toContain('WHERE 1 = 0');
  });

  it('reports a table that is nothing but its primary key', () => {
    const t = table('counters', [col('id', { type: 'bigint', is_pk: true })]);
    expect(buildTableQuery(t, 'update', pg)).toBe('-- "counters" has no columns to update.');
  });
});

describe('buildColumnList', () => {
  it('is just the quoted names, ready to paste into a query', () => {
    expect(buildColumnList(users(), pg)).toBe('"id", "email", "created_at"');
  });

  it('is empty for a table with no columns', () => {
    expect(buildColumnList(table('empty', []), pg)).toBe('');
  });
});

describe('buildJoinedSelect', () => {
  it('joins two related tables on their foreign key', () => {
    const u = users(); const o = orders();
    const sql = buildJoinedSelect([u, o], [u, o], [rel('orders', colId(o, 'user_id'), 'users', colId(u, 'id'))], pg);

    expect(sql).toContain('FROM "users" u');
    expect(sql).toContain('JOIN "orders" o ON o."user_id" = u."id"');
    expect(sql).toContain('u."email"');
    expect(sql).toContain('o."total"');
  });

  it('reaches an indirectly related table through a bridge it does not select from', () => {
    const u = users(); const o = orders();
    const items = table('order_items', [
      col('id', { type: 'bigint', is_pk: true }),
      col('order_id', { type: 'bigint' }),
      col('qty', { type: 'integer' }),
    ]);
    const rels = [
      rel('orders', colId(o, 'user_id'), 'users', colId(u, 'id')),
      rel('order_items', colId(items, 'order_id'), 'orders', colId(o, 'id')),
    ];

    const sql = buildJoinedSelect([u, items], [u, o, items], rels, pg);

    expect(sql).toContain('JOIN "orders" o');
    expect(sql).toMatch(/JOIN "orders" o .*-- bridge/);
    expect(sql).toContain('JOIN "order_items" oi');
    // The bridge is only there to connect the two; its columns are not wanted.
    expect(sql).not.toContain('o."total"');
    expect(sql).toContain('oi."qty"');
  });

  it('gives a table with no path to the others its own statement instead of dropping it', () => {
    const u = users(); const o = orders();
    const settings = table('settings', [col('id', { type: 'bigint', is_pk: true }), col('value')]);
    const sql = buildJoinedSelect([u, o, settings], [u, o, settings], [rel('orders', colId(o, 'user_id'), 'users', colId(u, 'id'))], pg);

    expect(sql).toContain('JOIN "orders" o');
    expect(sql).toContain('SELECT "id", "value"\nFROM "settings";');
    expect(sql).toMatch(/-- .*not related/i);
  });

  it('aliases only the column names two selected tables share', () => {
    const u = users(); const o = orders();
    const sql = buildJoinedSelect([u, o], [u, o], [rel('orders', colId(o, 'user_id'), 'users', colId(u, 'id'))], pg);

    // Both tables have "id"; without an alias the result set shows it twice.
    expect(sql).toContain('u."id" AS "u_id"');
    expect(sql).toContain('o."id" AS "o_id"');
    // "email" is unique to users, so it stays plain.
    expect(sql).toContain('u."email"');
    expect(sql).not.toContain('u."email" AS');
  });

  it('keeps aliases distinct when two tables shorten to the same letters', () => {
    const a = table('order_items', [col('id'), col('invoice_id')], 'a');
    const b = table('outgoing_invoices', [col('id')], 'b');
    const sql = buildJoinedSelect([a, b], [a, b], [rel('a', colId(a, 'invoice_id'), 'b', colId(b, 'id'))], pg);

    expect(sql).toContain('"order_items" oi');
    expect(sql).toContain('"outgoing_invoices" oi2');
  });

  it('falls back to the single-table query when only one table is selected', () => {
    const u = users();
    expect(buildJoinedSelect([u], [u], [], pg)).toBe(buildTableQuery(u, 'select', pg));
  });

  it('returns a comment when nothing is selected', () => {
    expect(buildJoinedSelect([], [], [], pg)).toBe('-- No tables selected.');
  });

  it('ignores a relationship whose columns no longer exist', () => {
    const u = users(); const o = orders();
    const broken = rel('orders', 'gone', 'users', colId(u, 'id'));
    const sql = buildJoinedSelect([u, o], [u, o], [broken], pg);

    expect(sql).not.toContain('JOIN "orders"');
    expect(sql).toMatch(/-- .*not related/i);
  });
});

describe('buildCopyText', () => {
  it('hands a verb straight to the statement builder', () => {
    expect(buildCopyText('delete', users(), pg)).toBe(buildTableQuery(users(), 'delete', pg));
  });

  it('returns the column list for the list kind', () => {
    expect(buildCopyText('columns', users(), pg)).toBe('"id", "email", "created_at"');
  });

  it('returns DDL in the chosen dialect', () => {
    expect(buildCopyText('ddl', users(), { ...pg, dialect: 'mysql' })).toContain('CREATE TABLE `users`');
    expect(buildCopyText('ddl', users(), pg)).toContain('CREATE TABLE "users"');
  });
});

describe('buildMultiCopyText', () => {
  const u = users();
  const o = orders();
  const rels = [rel('orders', colId(o, 'user_id'), 'users', colId(u, 'id'))];

  it('joins for SELECT', () => {
    expect(buildMultiCopyText('select', [u, o], [u, o], rels, pg))
      .toBe(buildJoinedSelect([u, o], [u, o], rels, pg));
  });

  it('emits one statement per table for the other verbs, in the order selected', () => {
    const sql = buildMultiCopyText('delete', [o, u], [u, o], rels, pg);
    expect(sql).toBe(`${buildTableQuery(o, 'delete', pg)}\n\n${buildTableQuery(u, 'delete', pg)}`);
  });

  it('labels each column list so the tables can be told apart', () => {
    const text = buildMultiCopyText('columns', [u, o], [u, o], rels, pg);
    expect(text).toContain('-- "users"\n"id", "email", "created_at"');
    expect(text).toContain('-- "orders"\n"id", "user_id", "total"');
  });

  it('concatenates DDL for every selected table', () => {
    const ddl = buildMultiCopyText('ddl', [u, o], [u, o], rels, pg);
    expect(ddl).toContain('CREATE TABLE "users"');
    expect(ddl).toContain('CREATE TABLE "orders"');
  });

  it('says nothing is selected rather than returning an empty string', () => {
    expect(buildMultiCopyText('insert', [], [], [], pg)).toBe('-- No tables selected.');
  });
});
