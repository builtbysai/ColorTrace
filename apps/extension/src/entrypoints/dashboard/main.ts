import { compareColorTraces, type ColorTrace, type TraceDifference } from '@vcd/trace-model';
import { deserializeColorTrace, downloadColorTrace } from '../../export/colortrace.js';
import { downloadColorTraceRegressionReport } from '../../export/regression-report.js';
import { clearTraceHistory, deleteTrace, listTraceHistory, saveTrace } from '../../persistence/database.js';

const rootNode = document.querySelector<HTMLElement>('#traces');
const statusNode = document.querySelector<HTMLElement>('#status');
const clearNode = document.querySelector<HTMLButtonElement>('#clear');
const importNode = document.querySelector<HTMLInputElement>('#import-trace');
if (!rootNode || !statusNode || !clearNode || !importNode) throw new Error('ColorTrace dashboard markup is incomplete');
const root: HTMLElement = rootNode;
const status: HTMLElement = statusNode;
const clear: HTMLButtonElement = clearNode;
const importInput: HTMLInputElement = importNode;
const comparisonIds = new Set<string>();

function text(tag: string, value: string, className?: string): HTMLElement {
  const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node;
}
/** Render recorded coordinates as a real CSS color. Null channels fall back to a neutral chip. */
function swatchCss(value: { space: string; channels: (number | null)[]; alpha: number }): string {
  const [c1, c2, c3] = value.channels;
  if (c1 === null || c1 === undefined || c2 === null || c2 === undefined || c3 === null || c3 === undefined) return '#8a8a8a';
  const a = value.alpha < 1 ? ` / ${value.alpha}` : '';
  if (value.space === 'srgb' || value.space === 'srgb-linear') {
    const r = Math.round(c1 * 255), g = Math.round(c2 * 255), b = Math.round(c3 * 255);
    return value.alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${value.alpha})` : `rgb(${r}, ${g}, ${b})`;
  }
  if (value.space === 'display-p3' || value.space === 'display-p3-linear') return `color(display-p3 ${c1} ${c2} ${c3}${a})`;
  if (value.space === 'hsl') return `hsl(${c1 * 360} ${c2 * 100}% ${c3 * 100}%${a})`;
  if (value.space === 'oklab') return `oklab(${c1} ${c2} ${c3}${a})`;
  if (value.space === 'oklch') return `oklch(${c1} ${c2} ${c3}${a})`;
  if (value.space === 'lab') return `lab(${c1 * 100}% ${c2} ${c3}${a})`;
  if (value.space === 'lch') return `lch(${c1 * 100}% ${c2} ${c3}${a})`;
  return '#8a8a8a';
}
function channelReadout(value: { space: string; channels: (number | null)[]; alpha: number }): string {
  const ch = value.channels.map((c) => (c === null || c === undefined ? 'null' : c.toFixed(4))).join('  ');
  return `${value.space}  [${ch}]  α ${value.alpha}`;
}
function swatch(value: { space: string; channels: (number | null)[]; alpha: number }, label: string): HTMLElement {
  const node = document.createElement('div'); node.className = 'swatch'; node.style.background = swatchCss(value);
  node.setAttribute('role', 'img'); node.setAttribute('aria-label', `${label}: ${channelReadout(value)}`);
  return node;
}
function interpretationLabel(trace: ColorTrace): string { return trace.appearance.interpretation === 'resolved-style' ? 'Resolved CSS style · not a rendered-pixel sample' : 'Rendered-pixel appearance'; }
function evidenceSection(trace: ColorTrace): HTMLElement | null {
  const sourceNodes = trace.evidence.nodes.filter((node) => node.kind !== 'computed-value'); if (!sourceNodes.length) return null;
  const details = document.createElement('details'); details.className = 'evidence';
  const list = document.createElement('ul'); for (const node of sourceNodes) list.append(text('li', `${node.label} · confidence: ${node.confidence}${node.value ? ` · ${node.value}` : ''}`));
  details.append(text('summary', `Source evidence (${sourceNodes.length})`), text('p', 'Observed source evidence is not automatically proof that a declaration won the cascade.', 'evidence-note'), list); return details;
}
function tokenSection(trace: ColorTrace): HTMLElement | null {
  if (!trace.tokenEvidence.candidates.length) return null; const details = document.createElement('details'); details.className = 'evidence'; const list = document.createElement('ul');
  for (const candidate of trace.tokenEvidence.candidates) list.append(text('li', `${candidate.displayName} · ${candidate.status} · ${candidate.reasons.join(', ')}`));
  details.append(text('summary', `Token candidates (${trace.tokenEvidence.candidates.length})`), text('p', 'Candidates are clues only. ColorTrace has not proven semantic token identity.', 'evidence-note'), list); return details;
}
function differences(title: string, entries: TraceDifference[]): HTMLElement | null {
  if (!entries.length) return null; const section = document.createElement('section'); section.append(text('h3', title)); const list = document.createElement('ul');
  for (const entry of entries) list.append(text('li', `${entry.field}: ${entry.before} → ${entry.after}`)); section.append(list); return section;
}
function reproductionConditions(entries: TraceDifference[]): HTMLElement {
  const section = document.createElement('section'); section.append(text('h3', 'Reproduce baseline conditions'));
  if (!entries.length) { section.append(text('p', 'Recorded state and environment conditions already match.')); return section; }
  const list = document.createElement('ul');
  for (const entry of entries) list.append(text('li', `${entry.field}: match baseline ${entry.before} (candidate recorded ${entry.after})`));
  section.append(list, text('p', 'These are recorded conditions to reproduce, not proof that any one condition caused the visual difference.', 'evidence-note')); return section;
}
function comparisonCard(baseline: ColorTrace, candidate: ColorTrace): HTMLElement {
  const comparison = compareColorTraces(baseline, candidate); const article = document.createElement('article'); article.className = 'comparison-card'; article.setAttribute('aria-live', 'polite');
  article.append(text('h2', 'Baseline against candidate'));
  const swatches = document.createElement('div'); swatches.className = 'compare-swatches';
  const side = (label: string, trace: ColorTrace) => { const wrap = document.createElement('figure'); wrap.append(swatch(trace.appearance.value, `${label} recorded color`)); const cap = document.createElement('figcaption'); cap.append(text('strong', label), text('span', channelReadout(trace.appearance.value), 'channels')); wrap.append(cap); return wrap; };
  swatches.append(side('Baseline', baseline), side('Candidate', candidate));
  article.append(swatches);
  const appearance = comparison.appearance.maxChannelDelta === null ? 'Color coordinates changed or are not directly comparable across recorded spaces.' : `Maximum recorded channel delta: ${comparison.appearance.maxChannelDelta.toFixed(4)}; alpha delta: ${comparison.appearance.alphaDelta.toFixed(4)}.`;
  const verdict = document.createElement('p'); verdict.className = comparison.appearance.changed ? 'verdict changed' : 'verdict unchanged';
  verdict.textContent = comparison.appearance.changed ? `Changed · ${appearance}` : `No appearance change · ${appearance}`;
  article.append(verdict, reproductionConditions([...comparison.state, ...comparison.environment]));
  const state = differences('State differences', comparison.state); if (state) article.append(state); const environment = differences('Environment differences', comparison.environment); if (environment) article.append(environment);
  const provenance = document.createElement('section'); provenance.append(text('h3', 'Evidence changes')); const evidenceList = document.createElement('ul');
  evidenceList.append(text('li', `Authored-expression evidence changed: ${comparison.provenance.authoredExpressionChanged ? 'yes' : 'no'}`), text('li', `Source evidence changed: ${comparison.provenance.sourceEvidenceChanged ? 'yes' : 'no'}`), text('li', `Evidence confidence changed: ${comparison.provenance.confidenceChanged ? 'yes' : 'no'}`), text('li', `Token candidates added: ${comparison.provenance.tokenCandidatesAdded.join(', ') || 'none'}`), text('li', `Token candidates removed: ${comparison.provenance.tokenCandidatesRemoved.join(', ') || 'none'}`)); provenance.append(evidenceList); article.append(provenance);
  if (comparison.reproductionNotes.length) { const section = document.createElement('section'); section.append(text('h3', 'Interpretation notes')); const list = document.createElement('ul'); for (const note of comparison.reproductionNotes) list.append(text('li', note)); section.append(list); article.append(section); }
  const reportButton = document.createElement('button'); reportButton.type = 'button'; reportButton.textContent = 'Export regression report'; reportButton.addEventListener('click', () => downloadColorTraceRegressionReport(baseline, candidate));
  article.append(reportButton, text('p', 'The report contains comparison context derived only from the two saved traces; it does not embed screenshots, page source, or a causal attribution.', 'evidence-note'), text('p', 'Differences describe recorded evidence only; they do not prove which source caused a visual change.', 'evidence-note')); return article;
}
function comparisonRole(traceId: string): 'Baseline' | 'Candidate' | 'Compare' {
  const selectedIds = [...comparisonIds]; const index = selectedIds.indexOf(traceId); return index === 0 ? 'Baseline' : index === 1 ? 'Candidate' : 'Compare';
}
function card(trace: ColorTrace): HTMLElement {
  const article = document.createElement('article'); article.className = 'trace-card';
  article.append(swatch(trace.appearance.value, `Recorded ${trace.appearance.value.space} color`));
  const body = document.createElement('div'); body.className = 'trace-body';
  const head = document.createElement('div'); head.className = 'trace-head';
  head.append(text('h2', trace.appearance.value.space.toUpperCase()));
  head.append(text('p', channelReadout(trace.appearance.value), 'channels'));
  body.append(head);
  body.append(text('p', interpretationLabel(trace), 'interpretation'));
  const meta = document.createElement('dl'); meta.className = 'trace-meta';
  const addMeta = (term: string, def: string) => { const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.textContent = def; meta.append(dt, dd); };
  addMeta('Property', trace.intent.property);
  addMeta('Origin', trace.environment.pageOrigin);
  addMeta('Captured', new Date(trace.capturedAt).toLocaleString());
  if (trace.intent.authoredExpression) addMeta('Authored', trace.intent.authoredExpression);
  body.append(meta);
  const sourceEvidence = evidenceSection(trace); if (sourceEvidence) body.append(sourceEvidence); const tokenEvidence = tokenSection(trace); if (tokenEvidence) body.append(tokenEvidence);
  if (trace.annotations.length) {
    const notes = document.createElement('div'); notes.className = 'annotations';
    for (const a of trace.annotations) {
      const note = document.createElement('p'); note.className = 'annotation';
      const label = document.createElement('strong'); label.textContent = a.label;
      note.append(label, document.createTextNode(` ${a.note}`));
      notes.append(note);
    }
    body.append(notes);
  }
  const actions = document.createElement('div'); actions.className = 'actions'; const compareLabel = document.createElement('label'); compareLabel.className = 'compare-toggle'; const compare = document.createElement('input'); compare.type = 'checkbox'; compare.checked = comparisonIds.has(trace.traceId); const role = comparisonRole(trace.traceId); compare.setAttribute('aria-label', role === 'Compare' ? `Add trace ${trace.traceId} to comparison` : `${role} trace ${trace.traceId}`);
  compare.addEventListener('change', async () => { if (compare.checked) { if (comparisonIds.size >= 2) { compare.checked = false; status.textContent = 'Choose at most two traces to compare.'; return; } comparisonIds.add(trace.traceId); } else comparisonIds.delete(trace.traceId); await render(); }); compareLabel.append(compare, document.createTextNode(` ${role}`));
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = 'Export .colortrace'; exportButton.addEventListener('click', () => downloadColorTrace(trace)); const deleteButton = document.createElement('button'); deleteButton.type = 'button'; deleteButton.textContent = 'Delete'; deleteButton.addEventListener('click', async () => { comparisonIds.delete(trace.traceId); await deleteTrace(trace.traceId); await render(); }); actions.append(compareLabel, exportButton, deleteButton); body.append(actions);
  article.append(body); return article;
}
async function render(message?: string): Promise<void> {
  try {
    const { traces, invalidCount } = await listTraceHistory(); const byId = new Map(traces.map((trace) => [trace.traceId, trace]));
    for (const traceId of comparisonIds) if (!byId.has(traceId)) comparisonIds.delete(traceId);
    const selected = [...comparisonIds].map((traceId) => byId.get(traceId)).filter((trace): trace is ColorTrace => trace !== undefined);
    const nodes: HTMLElement[] = [];
    const baseline = selected[0]; const candidate = selected[1];
    if (baseline && candidate) nodes.push(comparisonCard(baseline, candidate));
    nodes.push(...traces.map(card));
    root.replaceChildren(...nodes);
    const normalStatus = selected.length === 1 ? 'Baseline selected. Choose a candidate trace to compare.' : traces.length ? `${traces.length} local trace${traces.length === 1 ? '' : 's'}` : 'No saved traces yet. Activate ColorTrace on a page to capture one.';
    const recoveryStatus = invalidCount ? `${invalidCount} unreadable local record${invalidCount === 1 ? ' was' : 's were'} ignored. Valid traces remain available. Use Clear local history to remove unreadable records.` : null;
    status.textContent = [message ?? normalStatus, recoveryStatus].filter(Boolean).join(' ');
  } catch { status.textContent = 'Local trace history could not be opened.'; }
}
importInput.addEventListener('change', async () => { const file = importInput.files?.[0]; importInput.value = ''; if (!file) return; try { const trace = deserializeColorTrace(await file.text()); await saveTrace(trace); await render(`Imported ${trace.traceId}. Existing traces with the same ID are replaced, not duplicated.`); } catch { status.textContent = 'Import rejected. The selected file is not a valid ColorTrace trace.'; } });
clear.addEventListener('click', async () => { try { await clearTraceHistory(); comparisonIds.clear(); await render(); } catch { status.textContent = 'Local trace history could not be cleared.'; } });
void render();
