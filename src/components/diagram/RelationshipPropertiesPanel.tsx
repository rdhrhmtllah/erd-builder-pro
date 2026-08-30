import React from 'react';
import { Trash2, Link2, ArrowLeftRight } from 'lucide-react';
import { Edge, Node } from '@xyflow/react';
import { RELATIONSHIP_TYPES } from '../../lib/utils';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Entity } from '../../types';
import { ENDPOINT_CARDINALITIES, inferRelationshipSemantics, relationshipTypeFromEndpoints } from '@/lib/relationship-semantics';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FK_ACTIONS = ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT'];
const FK_ACTION_LABELS: Record<string, string> = {
  'NO ACTION': 'No Action',
  CASCADE: 'Cascade',
  'SET NULL': 'Set Null',
  'SET DEFAULT': 'Set Default',
  RESTRICT: 'Restrict',
};

const normalizeFkAction = (value: unknown) => {
  const action = String(value || '').trim().toUpperCase();
  return FK_ACTIONS.includes(action) ? action : 'NO ACTION';
};

interface RelationshipPropertiesPanelProps {
  selectedEdge: Edge | null;
  nodes: Node<Entity>[];
  onUpdateEdge: (edgeId: string, update: string | { label?: string; data?: Record<string, any> }) => void;
  onFlipEdge: (edgeId: string) => void;
  onDeleteEdge: (id: string) => void;
  moveOnly?: boolean;
}

export default function RelationshipPropertiesPanel({ 
  selectedEdge, 
  nodes,
  onUpdateEdge, 
  onFlipEdge,
  onDeleteEdge,
  moveOnly = false,
}: RelationshipPropertiesPanelProps) {
  if (!selectedEdge) return null;
  if (moveOnly) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full h-9 text-xs font-bold gap-2 bg-background border-border"
        onClick={() => onFlipEdge(selectedEdge.id)}
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
        Move Edge Side
      </Button>
    );
  }
  const relationData = (selectedEdge.data || {}) as Record<string, any>;
  const semantics = inferRelationshipSemantics(selectedEdge);

  const updateEndpoint = (endpoint: 'source' | 'target', value: string) => {
    const source = endpoint === 'source' ? value as any : semantics.source;
    const target = endpoint === 'target' ? value as any : semantics.target;
    const relationshipType = relationshipTypeFromEndpoints(source, target);
    const legacy = RELATIONSHIP_TYPES.find(item => item.value === relationshipType);
    onUpdateEdge(selectedEdge.id, {
      label: legacy?.shortLabel || '1:N',
      data: {
        source_cardinality: source,
        target_cardinality: target,
        relationship_type: relationshipType,
      },
    });
  };

  const getDisplayName = (nodeId: string, handleId: string | undefined | null) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return nodeId;
    
    if (!handleId) return node.data.name;
    
    const colId = handleId.replace(/^col-/, '').replace(/-(source|target)(-(l|r))?$/, '');
    const column = node.data.columns.find(c => c.id === colId);
    
    return `${node.data.name}.${column ? column.name : colId}`;
  };

  return (
    <div className="space-y-6 py-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            Relationship Cardinality
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {(['source', 'target'] as const).map(endpoint => (
              <div key={endpoint} className="space-y-1">
                <Label className="text-[10px] capitalize">{endpoint} endpoint</Label>
                <Select value={semantics[endpoint]} onValueChange={value => updateEndpoint(endpoint, value)}>
                  <SelectTrigger className="h-10 bg-background border-border text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {ENDPOINT_CARDINALITIES.map(item => (
                      <SelectItem key={item.value} value={item.value} className="text-xs">
                        <span className="font-mono font-bold">{item.symbol}</span> — {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">Symbols are shown at both ends of the relationship line. Optionality is explicit and independent from one/many cardinality.</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Foreign Key Actions</Label>
        <Input
          value={relationData.constraint_name || ''}
          placeholder="Constraint name"
          onChange={event => onUpdateEdge(selectedEdge.id, { data: { constraint_name: event.target.value } })}
        />
        <div className="grid grid-cols-2 gap-2">
          {(['on_delete', 'on_update'] as const).map(field => {
            const selectedAction = normalizeFkAction(relationData[field]);
            return (
              <div key={field} className="space-y-1">
                <Label className="text-[10px]">{field === 'on_delete' ? 'On delete' : 'On update'}</Label>
                <Select
                  value={selectedAction}
                  onValueChange={value => onUpdateEdge(selectedEdge.id, { data: { [field]: normalizeFkAction(value) } })}
                >
                  <SelectTrigger className="h-9"><SelectValue>{FK_ACTION_LABELS[selectedAction]}</SelectValue></SelectTrigger>
                  <SelectContent>{FK_ACTIONS.map(action => <SelectItem key={action} value={action}>{FK_ACTION_LABELS[action]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="rounded-xl bg-muted/20 p-4 border border-border/40">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source</span>
            <span className="text-[11px] font-mono text-foreground font-bold">{getDisplayName(selectedEdge.source, selectedEdge.sourceHandle)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Target</span>
            <span className="text-[11px] font-mono text-foreground font-bold">{getDisplayName(selectedEdge.target, selectedEdge.targetHandle)}</span>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full h-9 text-xs font-bold gap-2 mb-2 bg-background border-border"
          onClick={() => onFlipEdge(selectedEdge.id)}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Move Edge Side
        </Button>
        <Button 
          variant="destructive" 
          size="sm" 
          className="w-full h-9 text-xs font-bold gap-2"
          onClick={() => onDeleteEdge(selectedEdge.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Relationship
        </Button>
      </div>
    </div>
  );
}
