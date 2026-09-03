import { describe, expect, it } from 'vitest';
import { BUILTIN_ERD_TEMPLATES, parseErdTemplate, validateErdTemplate } from '../erd-templates';

describe('ERD templates', () => {
  it('keeps every built-in template parseable', () => {
    for (const template of BUILTIN_ERD_TEMPLATES) {
      expect(validateErdTemplate(template), template.name).toEqual({ valid: true });
      expect(parseErdTemplate(template).nodes.length).toBeGreaterThan(1);
    }
  });

  it('reports invalid DBML without throwing from validation', () => {
    expect(validateErdTemplate('Table broken {')).toMatchObject({ valid: false });
  });
});
