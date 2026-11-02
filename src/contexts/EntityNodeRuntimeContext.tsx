import React from 'react';

type EntityNodeRuntime = {
  isReadOnly: boolean;
  hideHandles: boolean;
  duplicateEntity: (id: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  openProperties: () => void;
  updateEntityComment?: (entityId: string, comment: string | null) => void;
  updateEntitySampleData?: (entityId: string, sampleData: Record<string, any>[]) => void;
  updateNodeData?: (id: string, patch: Record<string, any>) => void;
  deleteNode?: (id: string) => void;
};

const EntityNodeRuntimeContext = React.createContext<EntityNodeRuntime | null>(null);

export const EntityNodeRuntimeProvider = EntityNodeRuntimeContext.Provider;

export function useEntityNodeRuntime(): EntityNodeRuntime {
  const value = React.useContext(EntityNodeRuntimeContext);
  if (!value) throw new Error('EntityNode must be rendered inside EntityNodeRuntimeProvider');
  return value;
}
