import type { FilterState, SearchResponse } from "@/types";
import { getAllWorkflows, getDatasetMeta } from "@/lib/data";
import {
  createWorkflowSearchContext,
  executeWorkflowSearchWithContext,
  type WorkflowSearchContext,
} from "@/lib/search/core";

let cachedDatasetHash: string | null = null;
let searchContext: WorkflowSearchContext | null = null;

const MAX_SEARCH_CACHE_ENTRIES = 200;
const searchResponseCache = new Map<string, SearchResponse>();

async function ensureSearchContext(datasetHash: string) {
  if (!searchContext || cachedDatasetHash !== datasetHash) {
    const workflows = await getAllWorkflows();
    searchContext = createWorkflowSearchContext(workflows);
    cachedDatasetHash = datasetHash;
    searchResponseCache.clear();
  }

  return searchContext;
}

function buildCacheKey(
  filters: Partial<FilterState>,
  page: number,
  pageSize: number,
  datasetHash: string,
): string {
  return JSON.stringify({
    datasetHash,
    page,
    pageSize,
    filters,
  });
}

function cacheSearchResponse(key: string, response: SearchResponse) {
  if (searchResponseCache.has(key)) {
    searchResponseCache.delete(key);
  }

  searchResponseCache.set(key, response);

  if (searchResponseCache.size > MAX_SEARCH_CACHE_ENTRIES) {
    const oldestKey = searchResponseCache.keys().next().value;
    if (oldestKey) {
      searchResponseCache.delete(oldestKey);
    }
  }
}

export async function executeWorkflowSearch(
  incomingFilters: Partial<FilterState>,
  page: number,
  pageSize: number,
): Promise<SearchResponse> {
  const meta = await getDatasetMeta();
  const workflows = searchContext?.workflows ?? (await getAllWorkflows());
  const datasetHash = meta?.datasetHash ?? `len:${workflows.length}`;
  const context = await ensureSearchContext(datasetHash);
  const clampedPage = Math.max(1, page);
  const cacheKey = buildCacheKey(
    incomingFilters,
    clampedPage,
    pageSize,
    datasetHash,
  );
  const cachedResponse = searchResponseCache.get(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = executeWorkflowSearchWithContext(
    context,
    incomingFilters,
    clampedPage,
    pageSize,
  );

  cacheSearchResponse(cacheKey, response);

  return response;
}
