/**
 * Public-document API endpoint for a share-link type.
 *
 * Share URLs use professional type names (`/view/diagram/:uid`) while the API
 * keeps ERDs under the `diagrams` collection. Keeping the mapping in one place
 * stops a public link from pointing at a collection the server never mounts.
 *
 * Unknown types fall through unchanged so a new share type hits its own route
 * instead of silently landing on another document's endpoint.
 */
const PUBLIC_ENDPOINTS: Record<string, string> = {
  erd: 'diagrams',
  notes: 'notes',
  drawings: 'drawings',
  flowchart: 'flowcharts',
};

export function publicDocumentEndpoint(type: string): string {
  return PUBLIC_ENDPOINTS[type] ?? type;
}
