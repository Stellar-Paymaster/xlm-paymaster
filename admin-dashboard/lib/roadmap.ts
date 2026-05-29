export type RoadmapStatus = "planned" | "in-progress" | "shipped";

export interface RoadmapItem {
  id: string;
  title: string;
  status: RoadmapStatus;
}

export const SAMPLE_ROADMAP_ITEMS: RoadmapItem[] = [
  {
    id: "adaptive-fee-routing",
    title: "Adaptive fee routing",
    status: "planned",
  },
  {
    id: "tenant-quota-alerts",
    title: "Tenant quota alerts",
    status: "in-progress",
  },
  {
    id: "multi-region-webhooks",
    title: "Multi-region webhooks",
    status: "shipped",
  },
];
