export function parsePagination(query: Record<string, string | undefined>, defaultLimit = 50, maxLimit = 200) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit || String(defaultLimit), 10) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip, totalPages: (total: number) => Math.ceil(total / limit) || 1 };
}

export function paginatedResponse<T>(items: T[], total: number, page: number, limit: number) {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
