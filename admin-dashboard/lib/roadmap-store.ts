import "server-only";

import { SAMPLE_ROADMAP_ITEMS, type RoadmapItem, type RoadmapStatus } from "@/lib/roadmap";

const roadmapStore = new Map<string, RoadmapItem>(
  SAMPLE_ROADMAP_ITEMS.map((item) => [item.id, item]),
);

export function setStatus(id: string, status: RoadmapStatus): boolean {
  const existing = roadmapStore.get(id);
  if (!existing) {
    return false;
  }

  roadmapStore.set(id, {
    ...existing,
    status,
  });
  return true;
}
