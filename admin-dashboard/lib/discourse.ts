export interface DiscourseTopic {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
  replyCount: number;
  views: number;
  likeCount: number;
  categoryId: number;
  createdAt: string;
  lastPostedAt: string;
  pinned: boolean;
  excerpt?: string;
  tags: string[];
}

export interface DiscourseSearchResult {
  id: number;
  title: string;
  slug: string;
  postsCount: number;
  categoryId: number;
  createdAt: string;
  blurb: string;
  tags: string[];
}

export interface DiscourseConfig {
  baseUrl: string;
  categoryId: number;
}

export function getDiscourseConfig(): DiscourseConfig {
  return {
    baseUrl: (
      process.env.NEXT_PUBLIC_DISCOURSE_URL ?? "https://community.fluid.dev"
    ).replace(/\/$/, ""),
    categoryId: Number(process.env.NEXT_PUBLIC_DISCOURSE_CATEGORY_ID ?? "1"),
  };
}

export function getTopicUrl(config: DiscourseConfig, topic: { slug: string; id: number }): string {
  return `${config.baseUrl}/t/${topic.slug}/${topic.id}`;
}

export function getDiscourseSearchUrl(config: DiscourseConfig, query: string): string {
  return `${config.baseUrl}/search?q=${encodeURIComponent(query)}`;
}

export function getSsoLoginUrl(config: DiscourseConfig, returnPath = "/forum"): string {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const returnUrl = encodeURIComponent(`${siteUrl}${returnPath}`);
  return `${config.baseUrl}/session/sso?return_path=${returnUrl}`;
}

/** Fetch recent topics from a Discourse category. Returns sample data on failure. */
export async function fetchRecentTopics(
  config: DiscourseConfig,
  limit = 10,
): Promise<DiscourseTopic[]> {
  try {
    const url = `${config.baseUrl}/c/${config.categoryId}.json?per_page=${limit}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 }, // cache 5 min in Next.js
    });

    if (!res.ok) return SAMPLE_TOPICS;

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = data?.topic_list?.topics ?? [];

    return list.slice(0, limit).map((t: any) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      postsCount: t.posts_count ?? 0,
      replyCount: t.reply_count ?? 0,
      views: t.views ?? 0,
      likeCount: t.like_count ?? 0,
      categoryId: t.category_id ?? config.categoryId,
      createdAt: t.created_at ?? new Date().toISOString(),
      lastPostedAt: t.last_posted_at ?? new Date().toISOString(),
      pinned: t.pinned ?? false,
      excerpt: t.excerpt,
      tags: t.tags ?? [],
    }));
  } catch {
    return SAMPLE_TOPICS;
  }
}

/** Search Discourse topics. Returns sample results on failure. */
export async function searchTopics(
  config: DiscourseConfig,
  query: string,
  limit = 8,
): Promise<DiscourseSearchResult[]> {
  if (!query.trim()) return [];

  try {
    const url = `${config.baseUrl}/search.json?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!res.ok) return sampleSearchResults(query);

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topics: any[] = data?.topics ?? [];

    return topics.slice(0, limit).map((t: any) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      postsCount: t.posts_count ?? 0,
      categoryId: t.category_id ?? config.categoryId,
      createdAt: t.created_at ?? new Date().toISOString(),
      blurb: t.blurb ?? "",
      tags: t.tags ?? [],
    }));
  } catch {
    return sampleSearchResults(query);
  }
}

function sampleSearchResults(query: string): DiscourseSearchResult[] {
  return SAMPLE_TOPICS.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()),
  ).map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    postsCount: t.postsCount,
    categoryId: t.categoryId,
    createdAt: t.createdAt,
    blurb: t.excerpt ?? "",
    tags: t.tags,
  }));
}

export function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Sample data (shown when Discourse is unreachable) ─────────────────────

export const SAMPLE_TOPICS: DiscourseTopic[] = [
  {
    id: 1,
    title: "Getting started with Fluid fee sponsorship",
    slug: "getting-started-with-fluid-fee-sponsorship",
    postsCount: 12,
    replyCount: 11,
    views: 430,
    likeCount: 18,
    categoryId: 1,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    lastPostedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    pinned: true,
    excerpt: "Welcome! This thread covers everything you need to get your first fee-bump transaction running.",
    tags: ["getting-started", "typescript"],
  },
  {
    id: 2,
    title: "How to integrate Fluid with a React + Freighter wallet",
    slug: "fluid-react-freighter-integration",
    postsCount: 8,
    replyCount: 7,
    views: 215,
    likeCount: 9,
    categoryId: 1,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    lastPostedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    pinned: false,
    excerpt: "Step-by-step guide to wiring up Freighter signing with Fluid fee bumps using fluid-react hooks.",
    tags: ["react", "freighter"],
  },
  {
    id: 3,
    title: "Soroban contract invocations with Fluid fee bumps",
    slug: "soroban-contract-invocations-fluid",
    postsCount: 5,
    replyCount: 4,
    views: 180,
    likeCount: 6,
    categoryId: 1,
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    lastPostedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    pinned: false,
    excerpt: "Combining Soroban RPC simulation with Fluid's fee-bump endpoint for gasless contract calls.",
    tags: ["soroban", "contracts"],
  },
  {
    id: 4,
    title: "Python SDK — async usage with FastAPI",
    slug: "python-sdk-async-fastapi",
    postsCount: 6,
    replyCount: 5,
    views: 142,
    likeCount: 7,
    categoryId: 1,
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    lastPostedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    pinned: false,
    excerpt: "How to inject fluid-py into FastAPI dependency injection and handle retries gracefully.",
    tags: ["python", "fastapi"],
  },
  {
    id: 5,
    title: "Rate limit errors — what do they mean and how to handle them",
    slug: "rate-limit-errors-handling",
    postsCount: 9,
    replyCount: 8,
    views: 310,
    likeCount: 14,
    categoryId: 1,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    lastPostedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    pinned: false,
    excerpt: "A breakdown of Fluid's rate-limit responses and recommended back-off strategies per SDK.",
    tags: ["rate-limiting", "errors"],
  },
  {
    id: 6,
    title: "Go SDK — context cancellation and timeout patterns",
    slug: "go-sdk-context-timeout",
    postsCount: 4,
    replyCount: 3,
    views: 98,
    likeCount: 5,
    categoryId: 1,
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    lastPostedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    pinned: false,
    excerpt: "Best practices for using context.Context with fluid-go in production Go services.",
    tags: ["go"],
  },
];
