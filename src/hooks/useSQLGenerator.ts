import { Node, Edge } from '@/types';
import { Entity } from '../types';
import { generateAllTablesCode, AllExportFormat } from '../lib/sql-generator-all';
import { toast } from 'sonner';

const EXTENSIONS: Record<string, string> = {
  postgresql: '_schema.sql',
  mysql: '_mysql_schema.sql',
  sqlserver: '_mssql_schema.sql',
  prisma: '_schema.prisma',
  laravel_migration: '_migrations.php',
  laravel_model: '_models.php',
  typescript: '_types.ts',
  zod: '_schemas.ts',
};

export function useSQLGenerator() {
  const handleExportSQL = (
    format: AllExportFormat,
    targetFile: { name: string },
    nodes: Node<Entity>[],
    edges: Edge[]
  ) => {
    try {
      const code = generateAllTablesCode(format, nodes, edges, targetFile.name);
      const ext = EXTENSIONS[format] || '_export.txt';
      const filename = `${targetFile.name.toLowerCase().replace(/\s+/g, '_')}${ext}`;

      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to export schema');
    }
  };

  return { handleExportSQL };
}
