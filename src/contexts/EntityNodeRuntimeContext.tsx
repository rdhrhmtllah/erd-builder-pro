import React from 'react';

type EntityNodeRuntime = {
  isReadOnly: boolean;
  hideHandles: boolean;
  duplicateEntity: (id: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  openProperties: () => void;
};

const EntityNodeRuntimeContext = React.createContext<EntityNodeRuntime | null>(null);

export const EntityNodeRuntimeProvider = EntityNodeRuntimeContext.Provider;

export function useEntityNodeRuntime(): EntityNodeRuntime {
  const value = React.useContext(EntityNodeRuntimeContext);
  if (!value) throw new Error('EntityNode must be rendered inside EntityNodeRuntimeProvider');
  return value;
}
