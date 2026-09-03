import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardHtml = readFileSync(new URL('../src/entrypoints/dashboard/index.html', import.meta.url), 'utf8');
const dashboardCss = readFileSync(new URL('../src/entrypoints/dashboard/style.css', import.meta.url), 'utf8');

describe('dashboard keyboard accessibility', () => {
  it('keeps the import file control in the focus order', () => {
    expect(dashboardHtml).toContain('for="import-trace"');
    expect(dashboardHtml).toContain('id="import-trace" class="visually-hidden-input" type="file"');
    expect(dashboardHtml).not.toMatch(/id="import-trace"[^>]*\shidden(?:\s|>)/);
    expect(dashboardCss).toContain('.visually-hidden-input{position:absolute');
    expect(dashboardCss).toContain('input:focus-visible');
  });
});
