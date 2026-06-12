import type {
  WorkflowMeta,
  WorkflowDetail,
  Category,
  IntegrationSummary,
  Stats,
  DatasetMeta,
} from "@/types";

// Static imports for build-time data loading (works in Cloudflare Workers)
import categoriesData from "../../public/data/categories.json";
import integrationsData from "../../public/data/integrations.json";
import integrationsTopData from "../../public/data/integrations_top.json";
import statsData from "../../public/data/stats.json";
import metaData from "../../public/data/meta.json";
import indexData from "../../public/data/index.json";

// Type assertions for imported JSON
const categories = categoriesData as Category[];
const integrations = integrationsData as IntegrationSummary[];
const integrationsTop = integrationsTopData as IntegrationSummary[];
const stats = statsData as Stats;
const meta = metaData as DatasetMeta;
const allWorkflowsIndex = indexData as WorkflowMeta[];

// For workflow details, we still need to fetch dynamically since there are thousands
async function fetchWorkflowDetail(
  slug: string,
): Promise<WorkflowDetail | null> {
  try {
    // Use dynamic import for individual workflow files
    const workflow = await import(`../../public/data/workflows/${slug}.json`);
    return workflow.default as WorkflowDetail;
  } catch {
    return null;
  }
}

/**
 * Get all workflows metadata (search index)
 */
export async function getAllWorkflows(): Promise<WorkflowMeta[]> {
  return allWorkflowsIndex;
}

/**
 * Get workflow detail by slug
 */
export async function getWorkflowBySlug(
  slug: string,
): Promise<WorkflowDetail | null> {
  return fetchWorkflowDetail(slug);
}

/**
 * Get all workflow slugs for static generation
 */
export async function getAllWorkflowSlugs(): Promise<string[]> {
  return allWorkflowsIndex.map((w) => w.slug);
}

/**
 * Get all categories
 */
export async function getCategories(): Promise<Category[]> {
  return categories;
}

/**
 * Get category by slug
 */
export async function getCategoryBySlug(
  slug: string,
): Promise<Category | null> {
  return categories.find((c) => c.slug === slug) || null;
}

/**
 * Get all integrations
 */
export async function getIntegrations(): Promise<IntegrationSummary[]> {
  return integrations;
}

/**
 * Get featured/top integrations subset
 */
export async function getTopIntegrations(
  limit?: number,
): Promise<IntegrationSummary[]> {
  if (typeof limit === "number") {
    return integrationsTop.slice(0, limit);
  }
  return integrationsTop;
}

/**
 * Get integration by slug
 */
export async function getIntegrationBySlug(
  slug: string,
): Promise<IntegrationSummary | null> {
  return integrations.find((i) => i.slug === slug) || null;
}

/**
 * Get workflows by category
 */
export async function getWorkflowsByCategory(
  categorySlug: string,
): Promise<WorkflowMeta[]> {
  return allWorkflowsIndex.filter((w) => w.category === categorySlug);
}

/**
 * Get workflows by integration
 */
export async function getWorkflowsByIntegration(
  integrationSlug: string,
): Promise<WorkflowMeta[]> {
  return allWorkflowsIndex.filter((w) =>
    w.integrations.includes(integrationSlug),
  );
}

/**
 * Get featured workflows (high quality, curated)
 */
export async function getFeaturedWorkflows(
  limit: number = 12,
): Promise<WorkflowMeta[]> {
  return allWorkflowsIndex
    .filter((w) => w.quality >= 4)
    .sort((a, b) => {
      // Prioritize awesome source
      if (a.source === "awesome" && b.source !== "awesome") return -1;
      if (a.source !== "awesome" && b.source === "awesome") return 1;
      // Then by quality
      return b.quality - a.quality;
    })
    .slice(0, limit);
}

/**
 * Get stats
 */
export async function getStats(): Promise<Stats | null> {
  return stats;
}

/**
 * Get dataset metadata (hashes, cache stats)
 */
export async function getDatasetMeta(): Promise<DatasetMeta | null> {
  return meta;
}

/**
 * Get related workflows (same category or integration)
 */
export async function getRelatedWorkflows(
  workflow: WorkflowDetail,
  limit: number = 6,
): Promise<WorkflowMeta[]> {
  // Score each workflow by relevance
  const scored = allWorkflowsIndex
    .filter((w) => w.slug !== workflow.slug)
    .map((w) => {
      let score = 0;
      // Same category
      if (w.category === workflow.category) score += 3;
      // Shared integrations
      const sharedIntegrations = w.integrations.filter((i) =>
        workflow.integrations.some((wi) => wi.slug === i),
      ).length;
      score += sharedIntegrations * 2;
      // Same trigger type
      if (w.triggerType === workflow.triggerType) score += 1;
      // Quality bonus
      score += w.quality;
      return { workflow: w, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.workflow);
}

/**
 * Get latest added workflows (sorted by createdAt)
 */
export async function getLatestWorkflows(
  limit: number = 12,
): Promise<WorkflowMeta[]> {
  return [...allWorkflowsIndex]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

/**
 * Search workflows (basic server-side search for initial load)
 */
export async function searchWorkflows(
  query: string,
  limit: number = 50,
): Promise<WorkflowMeta[]> {
  const lowerQuery = query.toLowerCase();

  return allWorkflowsIndex
    .filter(
      (w) =>
        w.name.toLowerCase().includes(lowerQuery) ||
        w.description.toLowerCase().includes(lowerQuery) ||
        w.integrations.some((i) => i.includes(lowerQuery)),
    )
    .slice(0, limit);
}
