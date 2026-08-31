import { z } from "zod";
import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from "express";

// --- Schemas ---

export const loginSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(255).optional(),
  password: z.string().min(1).max(128).optional(),
  externalToken: z.string().max(2048).optional(),
});

export const setupAdminSchema = z.object({
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(255),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const aiProxySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(200_000),
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  apiKey: z.string().max(2048).optional(),
  baseUrl: z.string().url().max(512).optional(),
  providerCode: z.string().max(64).optional(),
}).superRefine((value, ctx) => {
  const total = value.messages.reduce((length, message) => length + message.content.length, 0);
  if (total > 2_000_000) {
    ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: 2_000_000, origin: "string", inclusive: true, message: "AI message payload is too large", path: ["messages"] });
  }
});

const projectIdField = z.union([z.number(), z.string()]).nullable().optional();

export const createDiagramSchema = z.object({
  name: z.string().min(1).max(255),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
});

const subjectAreaFields = {
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  node_ids: z.array(z.string().min(1).max(160)).min(1).max(1000),
  viewport_x: z.number().finite().min(-1_000_000).max(1_000_000),
  viewport_y: z.number().finite().min(-1_000_000).max(1_000_000),
  viewport_zoom: z.number().finite().min(0.05).max(4),
};

export const createSubjectAreaSchema = z.object(subjectAreaFields).strict();

export const updateSubjectAreaSchema = z.object({
  name: subjectAreaFields.name.optional(),
  color: subjectAreaFields.color.optional(),
  node_ids: subjectAreaFields.node_ids.optional(),
  viewport_x: subjectAreaFields.viewport_x.optional(),
  viewport_y: subjectAreaFields.viewport_y.optional(),
  viewport_zoom: subjectAreaFields.viewport_zoom.optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: "At least one subject area field must be provided",
});

const perspectivePosition = z.object({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});
const perspectiveSection = z.object({
  id: z.string().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(500).optional(),
  node_ids: z.array(z.string().min(1).max(160)).max(1000).default([]),
  order: z.number().int().min(0).max(999).optional(),
  collapsed: z.boolean().optional(),
}).strict();
const perspectiveFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  direction: z.enum(['left-to-right', 'top-to-bottom']).optional(),
  edge_mode: z.enum(['all', 'internal', 'cross-section']).optional(),
  sections: z.array(perspectiveSection).min(1).max(40).optional(),
  node_positions: z.record(z.string().min(1).max(160), perspectivePosition).refine(value => Object.keys(value).length <= 2000, { message: 'At most 2000 table positions are allowed' }).optional(),
  viewport: z.object({
    x: z.number().finite().min(-1_000_000).max(1_000_000),
    y: z.number().finite().min(-1_000_000).max(1_000_000),
    zoom: z.number().finite().min(0.05).max(4),
  }).optional(),
};
export const createPerspectiveSchema = z.object(perspectiveFields).strict();
export const updatePerspectiveSchema = z.object({
  name: perspectiveFields.name.optional(),
  description: perspectiveFields.description,
  direction: perspectiveFields.direction,
  edge_mode: perspectiveFields.edge_mode,
  sections: perspectiveFields.sections,
  node_positions: perspectiveFields.node_positions,
  viewport: perspectiveFields.viewport,
}).strict().refine(value => Object.keys(value).length > 0, { message: 'At least one perspective field must be provided' });

export const createNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().max(10_000_000).optional(),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
});

export const createDrawingSchema = z.object({
  title: z.string().min(1).max(255),
  data: z.string().max(10_000_000).optional(),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
});

export const createFlowchartSchema = z.object({
  title: z.string().min(1).max(255),
  data: z.string().max(10_000_000).optional(),
  project_id: projectIdField,
  uid: z.string().uuid().optional(),
});

export const uploadSchema = z.object({
  feature: z.string().max(50).optional(),
});

export const deleteUploadSchema = z.object({
  key: z.string().min(1).max(512),
});

export const renameSchema = z.object({
  name: z.string().min(1).max(255),
});

export const projectSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(255).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(6).max(128).optional(),
}).refine(
  (data) => data.name || data.email || data.newPassword,
  { message: "At least one of name, email, or newPassword must be provided" }
);

// --- Middleware helper ---

export function validate(schema: z.ZodSchema) {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map(e => e.message).join(", ");
      return res.status(400).json({ error: `Invalid input: ${message}` });
    }
    req.body = result.data;
    next();
  };
}
