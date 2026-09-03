import type { TraceableColorProperty } from '../security/evidence-allowlist.js';

export interface PickerPropertyOption {
  readonly property: TraceableColorProperty;
  readonly shortcut: string;
  readonly label: string;
}

export const PICKER_PROPERTY_OPTIONS: readonly PickerPropertyOption[] = [
  { property: 'color', shortcut: 't', label: 'text' },
  { property: 'background-color', shortcut: 'b', label: 'background' },
  { property: 'border-top-color', shortcut: 'r', label: 'border' },
  { property: 'fill', shortcut: 'f', label: 'fill' },
  { property: 'stroke', shortcut: 's', label: 'stroke' },
] as const;

export function propertyForShortcut(key: string): TraceableColorProperty | null {
  const normalized = key.toLowerCase();
  return PICKER_PROPERTY_OPTIONS.find((option) => option.shortcut === normalized)?.property ?? null;
}

export function labelForProperty(property: TraceableColorProperty): string {
  return PICKER_PROPERTY_OPTIONS.find((option) => option.property === property)?.label ?? property;
}
