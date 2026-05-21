/** 解析 API 分頁參數（page 從 0 開始） */
export function parseApiPagination(
  searchParams: URLSearchParams,
  defaults?: { pageSize?: number; maxPageSize?: number }
) {
  const defaultPageSize = defaults?.pageSize ?? 24;
  const maxPageSize = defaults?.maxPageSize ?? 100;

  const pageRaw = Number(searchParams.get("page")?.trim() ?? "0");
  const pageSizeRaw = Number(searchParams.get("pageSize")?.trim() ?? String(defaultPageSize));

  const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ?
      Math.min(maxPageSize, Math.floor(pageSizeRaw))
    : defaultPageSize;

  return { page, pageSize, skip: page * pageSize, take: pageSize };
}

export function paginateArray<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const slice = items.slice(page * pageSize, page * pageSize + pageSize);
  return {
    items: slice,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasMore: page + 1 < totalPages,
    },
  };
}
