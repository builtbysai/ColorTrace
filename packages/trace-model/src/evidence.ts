import {
  evidenceGraphSchema,
  type EvidenceGraph,
  type EvidenceNode,
} from './schema';

export function createEvidenceGraph(input: EvidenceGraph): EvidenceGraph {
  return evidenceGraphSchema.parse(input);
}

export function findEvidenceNode(
  graph: EvidenceGraph,
  id: string,
): EvidenceNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}
