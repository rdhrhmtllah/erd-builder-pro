import { describe, expect, it } from 'vitest';
import { applyTableSampleDataBulk } from '../erd-meta-service.js';

describe('applyTableSampleDataBulk', () => {
  it('is a registered export function', () => {
    expect(typeof applyTableSampleDataBulk).toBe('function');
  });
});
