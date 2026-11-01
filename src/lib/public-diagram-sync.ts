import { Node, Edge, Viewport } from '@xyflow/react';
import { Entity } from '../types';
import { edgeToRelationship } from './diagram-payload';
import { apiFetch } from './api';

export interface PublicSaveResult {
  ok: boolean;
  version?: number;
  conflict?: boolean;
  error?: string;
}

export async function savePublicDiagram(
  uid: string,
  nodes: Node<Entity>[],
  edges: Edge[],
  viewport: Viewport,
  options?: {
    token?: string | null;
    clientId?: string | null;
    editorName?: string | null;
    expectedVersion?: number | null;
    dbmlSource?: string | null;
  }
): Promise<PublicSaveResult> {
  const entities = (nodes || []).map((n) => ({
    ...n.data,
    x: n.position?.x ?? 0,
    y: n.position?.y ?? 0,
  }));
  const relationships = (edges || []).map(edgeToRelationship);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.token) headers['x-share-token'] = options.token;
  if (options?.clientId) headers['x-collab-client-id'] = options.clientId;

  const body = {
    entities,
    relationships,
    viewport,
    dbml_source: options?.dbmlSource ?? '',
    expectedVersion: options?.expectedVersion ?? undefined,
    editorName: options?.editorName ?? 'Guest',
  };

  try {
    const res = await apiFetch(`/api/diagrams/public/${uid}/save`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, conflict: true, version: data.currentVersion, error: 'Conflict: Diagram was modified by another editor.' };
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `Save failed (${res.status})` };
    }

    const data = await res.json();
    return { ok: true, version: data.version };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error while saving' };
  }
}
