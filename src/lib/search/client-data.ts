import type {
  Category,
  IntegrationSummary,
  Stats,
  WorkflowMeta,
} from "@/types";
import {
  createWorkflowSearchContext,
  type WorkflowSearchContext,
} from "@/lib/search/core";

export interface SearchDataset {
  categories: Category[];
  integrations: IntegrationSummary[];
  stats: Stats;
  workflows: WorkflowMeta[];
  searchContext: WorkflowSearchContext;
}

let datasetPromise: Promise<SearchDataset> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return (await response.json()) as T;
}

export function loadSearchDataset(): Promise<SearchDataset> {
  if (!datasetPromise) {
    datasetPromise = Promise.all([
      fetchJson<WorkflowMeta[]>("/data/index.json"),
      fetchJson<Category[]>("/data/categories.json"),
      fetchJson<IntegrationSummary[]>("/data/integrations.json"),
      fetchJson<Stats>("/data/stats.json"),
    ])
      .then(([workflows, categories, integrations, stats]) => ({
        workflows,
        categories,
        integrations,
        stats,
        searchContext: createWorkflowSearchContext(workflows),
      }))
      .catch((error) => {
        datasetPromise = null;
        throw error;
      });
  }

  return datasetPromise;
}
