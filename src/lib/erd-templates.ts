import type { Edge, Node } from '@xyflow/react';
import type { Entity } from '@/types';
import { dbmlToERD } from './dbml-converter';

export type ErdTemplate = {
  id: string;
  name: string;
  description: string;
  dbml: string;
  builtin?: boolean;
};

export const BUILTIN_ERD_TEMPLATES: ErdTemplate[] = [
  {
    id: 'saas-core', name: 'SaaS foundation', builtin: true,
    description: 'Organizations, members, and audit events.',
    dbml: `Table organizations {\n  id uuid [pk]\n  name varchar(160) [not null]\n  created_at timestamp [not null]\n}\nTable members {\n  id uuid [pk]\n  organization_id uuid [not null]\n  email varchar(255) [not null]\n  role varchar(40) [not null]\n}\nTable audit_events {\n  id uuid [pk]\n  organization_id uuid [not null]\n  actor_member_id uuid\n  action varchar(120) [not null]\n  created_at timestamp [not null]\n}\nRef: members.organization_id > organizations.id\nRef: audit_events.organization_id > organizations.id\nRef: audit_events.actor_member_id > members.id`,
  },
  {
    id: 'commerce-core', name: 'Commerce core', builtin: true,
    description: 'Customers, products, orders, and order items.',
    dbml: `Table customers {\n  id uuid [pk]\n  email varchar(255) [not null]\n}\nTable products {\n  id uuid [pk]\n  name varchar(180) [not null]\n  price decimal(12,2) [not null]\n}\nTable orders {\n  id uuid [pk]\n  customer_id uuid [not null]\n  status varchar(40) [not null]\n  created_at timestamp [not null]\n}\nTable order_items {\n  id uuid [pk]\n  order_id uuid [not null]\n  product_id uuid [not null]\n  quantity int [not null]\n  unit_price decimal(12,2) [not null]\n}\nRef: orders.customer_id > customers.id\nRef: order_items.order_id > orders.id\nRef: order_items.product_id > products.id`,
  },
  {
    id: 'content-core', name: 'Content core', builtin: true,
    description: 'Authors, posts, and comments.',
    dbml: `Table authors {\n  id uuid [pk]\n  display_name varchar(160) [not null]\n}\nTable posts {\n  id uuid [pk]\n  author_id uuid [not null]\n  title varchar(240) [not null]\n  body text\n  published_at timestamp\n}\nTable comments {\n  id uuid [pk]\n  post_id uuid [not null]\n  author_id uuid [not null]\n  body text [not null]\n  created_at timestamp [not null]\n}\nRef: posts.author_id > authors.id\nRef: comments.post_id > posts.id\nRef: comments.author_id > authors.id`,
  },
];

export function parseErdTemplate(template: ErdTemplate | string): { nodes: Node<Entity>[]; edges: Edge[] } {
  const dbml = typeof template === 'string' ? template : template.dbml;
  const result = dbmlToERD(dbml);
  if (!result.nodes.length) throw new Error('Template contains no tables');
  return result;
}

export function validateErdTemplate(template: ErdTemplate | string): { valid: boolean; error?: string } {
  try { parseErdTemplate(template); return { valid: true }; }
  catch (error) { return { valid: false, error: error instanceof Error ? error.message : 'Invalid template' }; }
}
