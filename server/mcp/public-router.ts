import express, { type Router } from "express";
import rateLimit from "express-rate-limit";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidation,
  originValidation,
  requireBearerAuth,
} from "@modelcontextprotocol/express";
import { getInstallMode } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { createSupabaseMcpTokenVerifier, getPublicMcpConfig } from "./public-auth.js";
import { activateLocalMcpOAuth, hashOAuthSecret } from "./local-oauth.js";
import { registerPublicMcpTools } from "./public-tools.js";
import { registerWorkspaceMcpTools } from "./workspace-tools.js";

export function createPublicMcpRouter(): Router | null {
  if (["desktop", "cli"].includes(getInstallMode())) {
    if (process.env.MCP_PUBLIC_URL) {
      logger.warn("Ignoring MCP_PUBLIC_URL because this is a local-authenticated deployment");
    }
    return null;
  }
  const config = getPublicMcpConfig();
  if (!config) return null;

  const router = express.Router();
  const endpointPath = config.resourceUrl.pathname || "/";
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(config.resourceUrl);
  const metadataPath = new URL(metadataUrl).pathname;
  const allowedOrigins = new Set([config.resourceUrl.hostname]);
  for (const value of (process.env.CORS_ORIGINS || "").split(",")) {
    try { if (value.trim()) allowedOrigins.add(new URL(value.trim()).hostname); } catch { /* ignored */ }
  }
  const secureHost = hostHeaderValidation([config.resourceUrl.hostname]);
  const secureOrigin = originValidation([...allowedOrigins]);
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "MCP request limit exceeded" },
  });
  const localProvider = config.authProvider === "local" ? activateLocalMcpOAuth(config) : null;
  const verifier = localProvider || createSupabaseMcpTokenVerifier(config);
  const handler = createMcpHandler(({ authInfo }) => {
    const userId = authInfo?.extra?.userId;
    if (typeof userId !== "string" || !userId) throw new Error("Authenticated MCP user is missing");
    const canWrite = authInfo?.scopes?.includes("mcp:write") === true;
    const server = new McpServer({ name: "erdbpro-web", version: process.env.APP_VERSION || "3.3.4" }, {
      instructions: canWrite
        ? "You can read and modify this authenticated user's ERD Builder Pro Web App workspace. Start ERD work with erd_schema_read and erd_dictionary_read. You can manage module filters with erd_subject_area_list/read/propose/apply: determine coherent business areas from the schema, use exact table IDs, show the preview, and apply only after explicit confirmation. You can update business names, definitions, domains, owners, stewards, classification, lifecycle, review status, retention, glossary, and tags with erd_dictionary_propose/apply; this is documentation metadata only. For a colored business-flow view of an existing ERD, use erd_perspective_list/read and erd_perspective_auto_layout; then use erd_perspective_propose and erd_perspective_apply after explicit confirmation. Perspectives are visual-only and never change schema tables, columns, or relationships. For risky ERD changes, call erd_impact_analyze before proposing a patch. For ERD table, column, relationship, or governance edits, prefer erd_schema_read then erd_patch_propose; review the returned migration_plan and breaking warnings, show the exact preview, and call erd_patch_apply only after explicit user confirmation. Use workspace_write_propose/apply for other workspace mutations. Never resend a full ERD when a granular patch is sufficient. Permanent deletion, project cascades, sharing changes, and backups are sensitive. DB Client catalogs, production database diagrams, credentials, arbitrary SQL, and filesystem access are unavailable through this Web MCP."
        : "Read ERD Builder Pro Web App workspace content only. Request an OAuth token with mcp:write for mutation tools. DB Client catalogs, production database diagrams, credentials, SQL execution, filesystem access, and all writes are unavailable without that scope.",
    });
    registerPublicMcpTools(server, userId);
    registerWorkspaceMcpTools(server, userId, canWrite);
    return server;
  }, { legacy: "stateless", responseMode: "json", onerror: error => logger.warn({ err: error }, "Public MCP request failed") });
  const nodeHandler = toNodeHandler(handler, { onerror: error => logger.error({ err: error }, "Public MCP transport failed") });

  if (config.authProvider === "local") {
    router.use([
      "/authorize",
      "/token",
      "/register",
      "/revoke",
      "/.well-known/oauth-authorization-server",
      metadataPath,
    ], secureHost);
    router.use(["/token", "/revoke"], express.urlencoded({ extended: false }), (req, _res, next) => {
      if (typeof req.body?.client_secret === "string") req.body.client_secret = hashOAuthSecret(req.body.client_secret);
      next();
    });
    router.use(mcpAuthRouter({
      provider: localProvider!,
      issuerUrl: config.issuerUrl,
      baseUrl: new URL("/", config.resourceUrl),
      resourceServerUrl: config.resourceUrl,
      scopesSupported: config.scopes,
      resourceName: "ERD Builder Pro Web App",
    }) as express.RequestHandler);
  } else {
    router.get(metadataPath, secureHost, (_req, res) => {
      res.set("Cache-Control", "public, max-age=300");
      res.json({
        resource: config.resourceUrl.href,
        authorization_servers: [config.issuerUrl.href],
        scopes_supported: config.scopes,
        resource_name: "ERD Builder Pro Web App",
      });
    });
  }

  router.post(
    endpointPath,
    secureHost,
    secureOrigin,
    limiter,
    express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }),
    requireBearerAuth({ verifier, requiredScopes: ["mcp:read"], resourceMetadataUrl: metadataUrl }),
    (req, res, next) => { void nodeHandler(req, res, req.body).catch(next); },
  );
  router.all(endpointPath, secureHost, (_req, res) => {
    res.set("Allow", "POST").status(405).json({ error: "Method not allowed" });
  });

  return router;
}
