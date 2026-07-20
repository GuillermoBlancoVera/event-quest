import { describe, expect, it } from 'vitest';
import { normalizeAnswer } from './utils.js';
describe('normalizeAnswer', () => it('removes incidental casing and whitespace', () => expect(normalizeAnswer('  University ')).toBe('university')));
