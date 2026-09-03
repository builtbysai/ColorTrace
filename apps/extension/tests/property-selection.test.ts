import { describe, expect, it } from 'vitest';
import {
  PICKER_PROPERTY_OPTIONS,
  labelForProperty,
  propertyForShortcut,
} from '../src/picker/property-selection.js';

describe('picker property selection', () => {
  it('exposes distinct foreground, background, border, fill, and stroke choices', () => {
    expect(PICKER_PROPERTY_OPTIONS.map((option) => option.property)).toEqual([
      'color',
      'background-color',
      'border-top-color',
      'fill',
      'stroke',
    ]);
  });

  it('maps shortcuts case-insensitively without guessing unknown keys', () => {
    expect(propertyForShortcut('B')).toBe('background-color');
    expect(propertyForShortcut('f')).toBe('fill');
    expect(propertyForShortcut('x')).toBeNull();
  });

  it('uses stable human labels for the HUD', () => {
    expect(labelForProperty('color')).toBe('text');
    expect(labelForProperty('stroke')).toBe('stroke');
  });
});
