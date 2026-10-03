import { describe, expect, it } from 'vitest';
import { erdToDBML } from '../dbml-converter';
import { dbmlToERD } from '../dbml-parser';
import { resolveDiagramDbmlForSave, schemaFingerprint } from '../diagram-dbml-save';

const SOURCE_DBML = `Table users {
  id uuid [pk]
  email varchar [not null]

  indexes {
    email [unique, name: 'users_email_key']
  }
}

Table posts {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: posts.user_id > users.id`;

// Canvas nodes as they arrive from the editor: parsed once, then stripped of
// the DBML-only metadata that saveDiagram is responsible for restoring.
function canvasFromDbml(dbml: string) {
  const parsed = dbmlToERD(dbml);
  return {
    nodes: parsed.nodes.map(node => ({
      ...node,
      data: { ...node.data, constraints: undefined, indexes: undefined },
    })) as any,
    edges: parsed.edges,
  };
}

describe('resolveDiagramDbmlForSave', () => {
  it('keeps an explicit DBML source and applies its metadata to the saved nodes', async () => {
    const { nodes, edges } = canvasFromDbml(SOURCE_DBML);

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: false,
      dbmlSource: SOURCE_DBML,
      fallbackDbmlSource: '',
      previousSchemaFingerprint: null,
    });

    expect(result.nextDbmlSource).toBe(SOURCE_DBML);
    const users = result.persistedNodes.find(node => node.data.name === 'users');
    expect(users?.data.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'users_email_key', is_unique: true }),
    ]));
    expect(result.persistedSchemaFingerprint).toBe(schemaFingerprint(result.persistedNodes, edges));
    expect(result.nextSchemaFingerprint).toBe(schemaFingerprint(nodes, edges));
  });

  it('keeps the stored DBML when it still matches the canvas and no fingerprint was saved', async () => {
    const { nodes, edges } = dbmlToERD(SOURCE_DBML);

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: false,
      dbmlSource: undefined,
      fallbackDbmlSource: SOURCE_DBML,
      previousSchemaFingerprint: null,
    });

    expect(result.nextDbmlSource).toBe(SOURCE_DBML);
    expect(result.persistedNodes).toBe(nodes);
  });

  it('restores DBML metadata onto nodes that lost their constraint and index arrays', async () => {
    const { nodes, edges } = canvasFromDbml(SOURCE_DBML);

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: false,
      dbmlSource: undefined,
      fallbackDbmlSource: SOURCE_DBML,
      previousSchemaFingerprint: schemaFingerprint(nodes, edges),
    });

    expect(result.nextDbmlSource).toBe(SOURCE_DBML);
    expect(result.persistedNodes.find(node => node.data.name === 'users')?.data.indexes)
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'users_email_key' })]));
  });

  it('regenerates DBML from the canvas when the stored DBML no longer matches it', async () => {
    const { nodes, edges } = canvasFromDbml(SOURCE_DBML);
    const staleDbml = `Table users {
  id uuid [pk]
}`;

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: false,
      dbmlSource: undefined,
      fallbackDbmlSource: staleDbml,
      previousSchemaFingerprint: null,
    });

    expect(result.nextDbmlSource).toBe(erdToDBML(nodes, edges));
    expect(result.nextDbmlSource).toContain('Table posts');
  });

  it('regenerates DBML when the saved schema fingerprint changed', async () => {
    const { nodes, edges } = canvasFromDbml(SOURCE_DBML);

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: false,
      dbmlSource: undefined,
      fallbackDbmlSource: SOURCE_DBML,
      previousSchemaFingerprint: 'an older fingerprint',
    });

    expect(result.nextDbmlSource).toBe(erdToDBML(nodes, edges));
  });

  it('keeps the stored DBML without regenerating when the saved fingerprint is unchanged', async () => {
    const { nodes, edges } = canvasFromDbml(SOURCE_DBML);

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: false,
      dbmlSource: undefined,
      fallbackDbmlSource: SOURCE_DBML,
      previousSchemaFingerprint: schemaFingerprint(nodes, edges),
    });

    expect(result.nextDbmlSource).toBe(SOURCE_DBML);
  });

  it('never rewrites production DB nodes with DBML metadata', async () => {
    const { nodes, edges } = canvasFromDbml(SOURCE_DBML);

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: true,
      dbmlSource: SOURCE_DBML,
      fallbackDbmlSource: '',
      previousSchemaFingerprint: null,
    });

    expect(result.nextDbmlSource).toBe(SOURCE_DBML);
    expect(result.persistedNodes).toBe(nodes);
  });

  it('saves an empty DBML source untouched when the diagram has none', async () => {
    const { nodes, edges } = canvasFromDbml(SOURCE_DBML);

    const result = await resolveDiagramDbmlForSave({
      nodes,
      edges,
      isProductionDb: false,
      dbmlSource: undefined,
      fallbackDbmlSource: '',
      previousSchemaFingerprint: null,
    });

    expect(result.nextDbmlSource).toBe('');
    expect(result.persistedNodes).toBe(nodes);
  });
});
