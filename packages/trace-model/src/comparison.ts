import type { ColorTrace, EvidenceNode } from './schema';

export type TraceDifference = {
  field: string;
  before: string;
  after: string;
};

export type TraceComparison = {
  sameProperty: boolean;
  appearance: {
    changed: boolean;
    comparableCoordinates: boolean;
    maxChannelDelta: number | null;
    alphaDelta: number;
    interpretationChanged: boolean;
  };
  state: TraceDifference[];
  environment: TraceDifference[];
  provenance: {
    authoredExpressionChanged: boolean;
    sourceEvidenceChanged: boolean;
    confidenceChanged: boolean;
    tokenCandidatesAdded: string[];
    tokenCandidatesRemoved: string[];
  };
  reproductionNotes: string[];
};

function value(value: unknown): string {
  return Array.isArray(value) ? [...value].sort().join(', ') : String(value);
}

function difference(field: string, before: unknown, after: unknown): TraceDifference | null {
  const left = value(before);
  const right = value(after);
  return left === right ? null : { field, before: left, after: right };
}

function sourceSignature(node: EvidenceNode): string {
  return JSON.stringify({
    kind: node.kind,
    label: node.label,
    value: node.value,
    confidence: node.confidence,
    source: node.source,
  });
}

export function compareColorTraces(before: ColorTrace, after: ColorTrace): TraceComparison {
  const beforeColor = before.appearance.value;
  const afterColor = after.appearance.value;
  const comparableCoordinates = beforeColor.space === afterColor.space
    && beforeColor.channels.length === afterColor.channels.length
    && beforeColor.channels.every((channel) => channel !== null)
    && afterColor.channels.every((channel) => channel !== null);
  const maxChannelDelta = comparableCoordinates
    ? Math.max(...beforeColor.channels.map((channel, index) => Math.abs((channel ?? 0) - (afterColor.channels[index] ?? 0))))
    : null;
  const colorChanged = JSON.stringify(beforeColor) !== JSON.stringify(afterColor);

  const state = [
    difference('pseudo-classes', before.state.pseudoClasses, after.state.pseudoClasses),
    difference('pseudo-element', before.state.pseudoElement, after.state.pseudoElement),
    difference('color-scheme', before.state.colorScheme, after.state.colorScheme),
    difference('forced-colors', before.state.forcedColors, after.state.forcedColors),
    difference('reduced-motion', before.state.reducedMotion, after.state.reducedMotion),
    difference('reduced-transparency', before.state.reducedTransparency, after.state.reducedTransparency),
    difference('contrast-preference', before.state.contrastPreference, after.state.contrastPreference),
  ].filter((entry): entry is TraceDifference => entry !== null);

  const environment = [
    difference('page-origin', before.environment.pageOrigin, after.environment.pageOrigin),
    difference('document-url-hash', before.environment.documentUrlHash, after.environment.documentUrlHash),
    difference('browser-family', before.environment.browser.family, after.environment.browser.family),
    difference('browser-version', before.environment.browser.version, after.environment.browser.version),
    difference('viewport-width', before.environment.viewport.widthCssPx, after.environment.viewport.widthCssPx),
    difference('viewport-height', before.environment.viewport.heightCssPx, after.environment.viewport.heightCssPx),
    difference('device-pixel-ratio', before.environment.viewport.devicePixelRatio, after.environment.viewport.devicePixelRatio),
  ].filter((entry): entry is TraceDifference => entry !== null);

  const beforeSources = before.evidence.nodes.filter((node) => node.kind !== 'computed-value').map(sourceSignature).sort();
  const afterSources = after.evidence.nodes.filter((node) => node.kind !== 'computed-value').map(sourceSignature).sort();
  const beforeTokens = new Set(before.tokenEvidence.candidates.map((candidate) => candidate.tokenId));
  const afterTokens = new Set(after.tokenEvidence.candidates.map((candidate) => candidate.tokenId));
  const tokenCandidatesAdded = [...afterTokens].filter((id) => !beforeTokens.has(id)).sort();
  const tokenCandidatesRemoved = [...beforeTokens].filter((id) => !afterTokens.has(id)).sort();

  const reproductionNotes: string[] = [];
  if (before.intent.property !== after.intent.property) reproductionNotes.push('Different CSS properties are being compared; do not attribute the color change to one declaration.');
  if (before.appearance.interpretation !== after.appearance.interpretation) reproductionNotes.push('Appearance evidence uses different interpretation classes; resolved style and rendered pixels are not interchangeable.');
  if (state.length) reproductionNotes.push('Rendering state differs; reproduce the recorded state before comparing visual output.');
  if (environment.length) reproductionNotes.push('Environment differs; reproduce relevant browser, viewport, DPR, origin, and preference conditions before attributing a regression.');
  if (!comparableCoordinates) reproductionNotes.push('Color coordinates use different spaces or channel shapes; no numeric channel delta is reported.');

  return {
    sameProperty: before.intent.property === after.intent.property,
    appearance: {
      changed: colorChanged,
      comparableCoordinates,
      maxChannelDelta,
      alphaDelta: Math.abs(beforeColor.alpha - afterColor.alpha),
      interpretationChanged: before.appearance.interpretation !== after.appearance.interpretation,
    },
    state,
    environment,
    provenance: {
      authoredExpressionChanged: before.intent.authoredExpression !== after.intent.authoredExpression,
      sourceEvidenceChanged: JSON.stringify(beforeSources) !== JSON.stringify(afterSources),
      confidenceChanged: before.intent.confidence !== after.intent.confidence
        || before.appearance.confidence !== after.appearance.confidence
        || before.authority.confidence !== after.authority.confidence,
      tokenCandidatesAdded,
      tokenCandidatesRemoved,
    },
    reproductionNotes,
  };
}
