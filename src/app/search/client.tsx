"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity } from "lucide-react";
import { SearchBar } from "@/components/workflow/SearchBar";
import { FilterPanel } from "@/components/workflow/FilterPanel";
import { VirtualizedWorkflowGrid } from "@/components/workflow/VirtualizedWorkflowGrid";
import { WorkflowGridSkeleton } from "@/components/workflow/WorkflowGrid";
import {
  DEFAULT_SEARCH_PAGE_SIZE,
  buildURLFromSearchState,
  clampPage,
  clampPageSize,
  parseFiltersFromURL,
  withDefaultFilters,
} from "@/lib/search";
import { loadSearchDataset, type SearchDataset } from "@/lib/search/client-data";
import { executeWorkflowSearchWithContext } from "@/lib/search/core";
import type { FilterState, SearchResponse } from "@/types";

interface SearchClientProps {
  basePath?: "/search" | "/directory";
}

const EMPTY_RESPONSE: SearchResponse = {
  results: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_SEARCH_PAGE_SIZE,
  hasMore: false,
  tookMs: 0,
};

function getRouteState(searchParams: ReturnType<typeof useSearchParams>) {
  const filters = withDefaultFilters(parseFiltersFromURL(searchParams));
  const page = clampPage(parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = clampPageSize(
    parseInt(
      searchParams.get("pageSize") ?? String(DEFAULT_SEARCH_PAGE_SIZE),
      10,
    ),
  );

  return {
    filters,
    page,
    pageSize,
  };
}

export function SearchClient({ basePath = "/search" }: SearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRouteState = getRouteState(searchParams);
  const [dataset, setDataset] = useState<SearchDataset | null>(null);
  const [filters, setFilters] = useState<FilterState>(initialRouteState.filters);
  const [page, setPage] = useState(initialRouteState.page);
  const [pageSize, setPageSize] = useState(initialRouteState.pageSize);
  const [response, setResponse] = useState<SearchResponse>(EMPTY_RESPONSE);
  const [isDatasetLoading, setIsDatasetLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlKeyRef = useRef(
    buildURLFromSearchState(
      initialRouteState.filters,
      initialRouteState.page,
      initialRouteState.pageSize,
      basePath,
    ),
  );
  const deferredFilters = useDeferredValue(filters);
  const deferredPage = useDeferredValue(page);
  const deferredPageSize = useDeferredValue(pageSize);

  useEffect(() => {
    let cancelled = false;

    loadSearchDataset()
      .then((nextDataset) => {
        if (cancelled) {
          return;
        }

        setDataset(nextDataset);
        setIsDatasetLoading(false);
      })
      .catch((datasetError) => {
        if (cancelled) {
          return;
        }

        setError((datasetError as Error).message ?? "Failed to load workflows");
        setIsDatasetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextRouteState = getRouteState(searchParams);
    const parsedKey = buildURLFromSearchState(
      nextRouteState.filters,
      nextRouteState.page,
      nextRouteState.pageSize,
      basePath,
    );

    if (parsedKey !== urlKeyRef.current) {
      urlKeyRef.current = parsedKey;
      startTransition(() => {
        setFilters(nextRouteState.filters);
        setPage(nextRouteState.page);
        setPageSize(nextRouteState.pageSize);
      });
    }
  }, [searchParams, basePath]);

  useEffect(() => {
    if (!dataset) {
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const nextResponse = executeWorkflowSearchWithContext(
        dataset.searchContext,
        deferredFilters,
        1,
        deferredPage * deferredPageSize,
      );

      startTransition(() => {
        setResponse({
          ...nextResponse,
          page: deferredPage,
          pageSize: deferredPageSize,
        });
        setIsCalculating(false);
      });
    } catch (searchError) {
      setError((searchError as Error).message ?? "Search failed");
      setIsCalculating(false);
    }
  }, [dataset, deferredFilters, deferredPage, deferredPageSize]);

  const updateRouteState = (
    nextFilters: FilterState,
    nextPage: number,
    nextPageSize: number,
  ) => {
    const nextUrl = buildURLFromSearchState(
      nextFilters,
      nextPage,
      nextPageSize,
      basePath,
    );

    if (nextUrl === urlKeyRef.current) {
      return;
    }

    urlKeyRef.current = nextUrl;
    router.replace(nextUrl, { scroll: false });
  };

  const handleSearch = (query: string) => {
    const nextFilters = { ...filters, query };

    startTransition(() => {
      setFilters(nextFilters);
      setPage(1);
    });
    updateRouteState(nextFilters, 1, pageSize);
  };

  const handleFiltersChange = (nextFilters: FilterState) => {
    startTransition(() => {
      setFilters(nextFilters);
      setPage(1);
    });
    updateRouteState(nextFilters, 1, pageSize);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;

    startTransition(() => {
      setPage(nextPage);
    });
    updateRouteState(filters, nextPage, pageSize);
  };

  const categories = dataset?.categories ?? [];
  const integrations = dataset?.integrations ?? [];
  const totalWorkflows = dataset?.stats.total ?? dataset?.workflows.length ?? 0;
  const results = response.results;
  const total = response.total;
  const hasMore = response.hasMore;
  const latencyText =
    response.tookMs >= 1 ? `${response.tookMs.toFixed(1)} ms` : "<1 ms";
  const isAppending = page !== deferredPage && page > deferredPage;
  const showFilterSkeleton =
    isDatasetLoading ||
    (isCalculating &&
      (!isAppending ||
        pageSize !== deferredPageSize ||
        filters !== deferredFilters));
  const filterSummary =
    total === totalWorkflows
      ? `${total.toLocaleString()} workflows available`
      : `${total.toLocaleString()} of ${totalWorkflows.toLocaleString()} workflows match`;

  return (
    <div className="space-y-6">
      <SearchBar
        initialQuery={filters.query}
        onSearch={handleSearch}
        redirectOnSearch={false}
        size="lg"
        autoFocus
      />

      <FilterPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        categories={categories}
        integrations={integrations}
        totalCount={totalWorkflows}
        filteredCount={total}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
        <span>{filterSummary}</span>
        <span className="inline-flex items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
          <Activity className="w-3.5 h-3.5 text-brand-500" />
          {showFilterSkeleton
            ? "Updating results…"
            : `${latencyText} local time`}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {showFilterSkeleton ? (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <WorkflowGridSkeleton count={9} columns={3} />
        </div>
      ) : (
        <VirtualizedWorkflowGrid
          workflows={results}
          columns={3}
          emptyMessage={
            filters.query
              ? `No workflows found for "${filters.query}". Try a different search term.`
              : "No workflows match your filters. Try adjusting your criteria."
          }
          className="rounded-xl border border-gray-100 dark:border-gray-800"
        />
      )}

      {hasMore && results.length > 0 && (
        <div className="text-center pt-8">
          <button
            onClick={handleLoadMore}
            disabled={isDatasetLoading || isCalculating}
            className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
          >
            {isAppending
              ? "Loading…"
              : `Load More (${total - results.length} remaining)`}
          </button>
        </div>
      )}

      <div className="text-center text-sm text-gray-500 dark:text-gray-400">
        {results.length > 0
          ? `Loaded ${results.length} of ${total} workflows${showFilterSkeleton ? " · Updating…" : ""}`
          : "No workflows to display"}
      </div>
    </div>
  );
}
