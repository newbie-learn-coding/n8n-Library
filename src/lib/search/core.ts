import Fuse, { type IFuseOptions } from "fuse.js";
import type {
  FilterState,
  SearchResponse,
  SortOption,
  WorkflowMeta,
} from "@/types";
import { withDefaultFilters } from "@/lib/search";

type CachedSortOption = Exclude<SortOption, "relevance">;

export interface WorkflowSearchContext {
  workflows: WorkflowMeta[];
  fuse: Fuse<WorkflowMeta>;
  sorted: Record<CachedSortOption, WorkflowMeta[]>;
  sortRanks: Record<CachedSortOption, Map<string, number>>;
}

const CACHED_SORT_OPTIONS: CachedSortOption[] = [
  "quality",
  "nodes",
  "newest",
  "name",
];

const workflowFuseOptions: IFuseOptions<WorkflowMeta> = {
  keys: [
    { name: "name", weight: 0.4 },
    { name: "description", weight: 0.3 },
    { name: "integrations", weight: 0.2 },
    { name: "categoryName", weight: 0.1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 2,
};

function getNow(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
}

function getWorkflowKey(workflow: WorkflowMeta): string {
  return workflow.id || workflow.slug;
}

function compareBaseOrder(
  a: WorkflowMeta,
  b: WorkflowMeta,
  baseOrder: Map<string, number>,
): number {
  return (
    (baseOrder.get(getWorkflowKey(a)) ?? Number.MAX_SAFE_INTEGER) -
    (baseOrder.get(getWorkflowKey(b)) ?? Number.MAX_SAFE_INTEGER)
  );
}

function matchesFilters(workflow: WorkflowMeta, filters: FilterState): boolean {
  if (filters.category && workflow.category !== filters.category) {
    return false;
  }

  if (
    filters.integration &&
    !workflow.integrations.includes(filters.integration)
  ) {
    return false;
  }

  if (filters.source !== "all" && workflow.source !== filters.source) {
    return false;
  }

  if (filters.quality && workflow.quality < filters.quality) {
    return false;
  }

  if (filters.triggerType && workflow.triggerType !== filters.triggerType) {
    return false;
  }

  return true;
}

function paginateMatches(
  workflows: WorkflowMeta[],
  filters: FilterState,
  offset: number,
  pageSize: number,
): { results: WorkflowMeta[]; total: number } {
  const results: WorkflowMeta[] = [];
  let total = 0;

  for (const workflow of workflows) {
    if (!matchesFilters(workflow, filters)) {
      continue;
    }

    if (total >= offset && results.length < pageSize) {
      results.push(workflow);
    }

    total += 1;
  }

  return { results, total };
}

export function createWorkflowSearchContext(
  workflows: WorkflowMeta[],
): WorkflowSearchContext {
  const baseOrder = new Map(
    workflows.map((workflow, index) => [getWorkflowKey(workflow), index]),
  );
  const createdAtMs = new Map(
    workflows.map((workflow) => [
      getWorkflowKey(workflow),
      Date.parse(workflow.createdAt) || 0,
    ]),
  );

  const sorted = {
    quality: [...workflows].sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      if (a.source === "awesome" && b.source !== "awesome") return -1;
      if (a.source !== "awesome" && b.source === "awesome") return 1;
      return compareBaseOrder(a, b, baseOrder);
    }),
    nodes: [...workflows].sort((a, b) => {
      if (b.nodeCount !== a.nodeCount) return b.nodeCount - a.nodeCount;
      return compareBaseOrder(a, b, baseOrder);
    }),
    newest: [...workflows].sort((a, b) => {
      const aTime = createdAtMs.get(getWorkflowKey(a)) ?? 0;
      const bTime = createdAtMs.get(getWorkflowKey(b)) ?? 0;
      if (bTime !== aTime) return bTime - aTime;
      return compareBaseOrder(a, b, baseOrder);
    }),
    name: [...workflows].sort((a, b) => a.name.localeCompare(b.name)),
  } satisfies Record<CachedSortOption, WorkflowMeta[]>;

  const sortRanks = Object.fromEntries(
    CACHED_SORT_OPTIONS.map((sortOption) => [
      sortOption,
      new Map(
        sorted[sortOption].map((workflow, index) => [
          getWorkflowKey(workflow),
          index,
        ]),
      ),
    ]),
  ) as Record<CachedSortOption, Map<string, number>>;

  return {
    workflows,
    fuse: new Fuse(workflows, workflowFuseOptions),
    sorted,
    sortRanks,
  };
}

export function executeWorkflowSearchWithContext(
  context: WorkflowSearchContext,
  incomingFilters: Partial<FilterState>,
  page: number,
  pageSize: number,
): SearchResponse {
  const start = getNow();
  const filters = withDefaultFilters(incomingFilters);
  const clampedPage = Math.max(1, page);
  const offset = (clampedPage - 1) * pageSize;

  let total = 0;
  let results: WorkflowMeta[] = [];

  if (!filters.query) {
    const source =
      filters.sortBy === "relevance"
        ? context.workflows
        : context.sorted[filters.sortBy];
    ({ results, total } = paginateMatches(source, filters, offset, pageSize));
  } else {
    const searched = context.fuse.search(filters.query).map((match) => match.item);

    if (filters.sortBy === "relevance") {
      ({ results, total } = paginateMatches(
        searched,
        filters,
        offset,
        pageSize,
      ));
    } else {
      const filtered = searched.filter((workflow) =>
        matchesFilters(workflow, filters),
      );
      const ranks = context.sortRanks[filters.sortBy];
      const sorted = [...filtered].sort(
        (a, b) =>
          (ranks.get(getWorkflowKey(a)) ?? Number.MAX_SAFE_INTEGER) -
          (ranks.get(getWorkflowKey(b)) ?? Number.MAX_SAFE_INTEGER),
      );
      total = sorted.length;
      results = sorted.slice(offset, offset + pageSize);
    }
  }

  return {
    results,
    total,
    page: clampedPage,
    pageSize,
    hasMore: offset + pageSize < total,
    tookMs: Math.round((getNow() - start) * 100) / 100,
  };
}
