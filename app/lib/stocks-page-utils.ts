/**
 * Shared utilities for filtering, sorting, and deriving insights
 * for the stock market list and related views.
 */

export type StockSortOption =
  | "marketcap-desc"
  | "price-desc"
  | "price-asc"
  | "change-desc"
  | "change-asc";

export interface StockSummary {
  _id: string;
  symbol: string;
  name?: string | null;
  sector?: string | null;
  currentPrice?: number | null;
  marketCap?: number | null;
  lastPriceChange?: number | null; // Represented as a decimal fraction (e.g., 0.012 = 1.2%)
  companyLogo?: string | null;
}

export interface StockFilterOptions {
  searchQuery?: string;
  sector?: string | null;
  sortBy?: StockSortOption;
  /**
   * Sector keyword that should be treated as "all sectors".
   * Defaults to "all" to align with UI controls.
   */
  allSectorsKeyword?: string;
}

export interface MarketOverviewSector {
  sector: string;
  stockCount?: number | null;
  totalMarketCap?: number | null;
  averageChange?: number | null; // Decimal fraction (e.g., 0.015 = 1.5%)
}

export interface MarketOverviewSnapshot {
  sectors?: MarketOverviewSector[] | null;
}

export interface SectorBreakdownItem {
  name: string;
  stockCount: number;
  marketCap: number;
  averageChangePercent: number;
}

export interface TopMoversResult {
  topGainers: StockSummary[];
  topLosers: StockSummary[];
}

const DEFAULT_ALL_SECTORS_KEYWORD = "all";

/**
 * Normalize the sector filter value to determine if it should be applied.
 */
function resolveSectorFilter(
  sector: string | null | undefined,
  allKeyword: string,
): string | null {
  if (!sector) {
    return null;
  }

  const normalized = sector.trim().toLowerCase();
  if (!normalized || normalized === allKeyword.toLowerCase()) {
    return null;
  }

  return sector;
}

/**
 * Standardizes queries for case-insensitive matching.
 */
function normalizeSearchQuery(query: string | undefined): string {
  return (query ?? "").trim().toLowerCase();
}

/**
 * Returns true when the stock matches the search query.
 */
function matchesSearchQuery(stock: StockSummary, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const symbol = (stock.symbol ?? "").toLowerCase();
  const name = (stock.name ?? "").toLowerCase();

  return symbol.includes(normalizedQuery) || name.includes(normalizedQuery);
}

/**
 * Filters a collection of stocks by search query and sector.
 */
export function filterStocks(
  stocks: StockSummary[],
  options: StockFilterOptions = {},
): StockSummary[] {
  const allKeyword = options.allSectorsKeyword ?? DEFAULT_ALL_SECTORS_KEYWORD;
  const sectorFilter = resolveSectorFilter(options.sector, allKeyword);
  const query = normalizeSearchQuery(options.searchQuery);

  if (!query && !sectorFilter) {
    return stocks.slice();
  }

  return stocks.filter((stock) => {
    const matchesQuery = matchesSearchQuery(stock, query);
    if (!matchesQuery) {
      return false;
    }

    if (!sectorFilter) {
      return true;
    }

    return (stock.sector ?? "").toLowerCase() === sectorFilter.toLowerCase();
  });
}

/**
 * Converts fractional price change to percentage points.
 */
export function toPercent(changeFraction: number | null | undefined): number {
  if (typeof changeFraction !== "number" || !Number.isFinite(changeFraction)) {
    return 0;
  }
  return changeFraction * 100;
}

/**
 * Sorts stocks based on the provided sort option.
 */
export function sortStocks(
  stocks: StockSummary[],
  sortBy: StockSortOption = "marketcap-desc",
): StockSummary[] {
  const sorted = stocks.slice();

  sorted.sort((a, b) => {
    const priceA = a.currentPrice ?? 0;
    const priceB = b.currentPrice ?? 0;
    const marketCapA = a.marketCap ?? 0;
    const marketCapB = b.marketCap ?? 0;
    const changeA = toPercent(a.lastPriceChange);
    const changeB = toPercent(b.lastPriceChange);

    switch (sortBy) {
      case "price-asc":
        return priceA - priceB;
      case "price-desc":
        return priceB - priceA;
      case "change-desc":
        return changeB - changeA;
      case "change-asc":
        return changeA - changeB;
      case "marketcap-desc":
      default:
        return marketCapB - marketCapA;
    }
  });

  return sorted;
}

/**
 * Convenience helper to apply both filtering and sorting in a single pass.
 */
export function selectStocks(
  stocks: StockSummary[],
  options: StockFilterOptions = {},
): StockSummary[] {
  const filtered = filterStocks(stocks, options);
  return sortStocks(filtered, options.sortBy ?? "marketcap-desc");
}

/**
 * Extracts a sorted list of unique sectors from the provided stocks.
 */
export function extractUniqueSectors(stocks: StockSummary[]): string[] {
  const sectors = new Set<string>();

  for (const stock of stocks) {
    if (stock.sector) {
      sectors.add(stock.sector);
    }
  }

  return Array.from(sectors).sort((a, b) => a.localeCompare(b));
}

/**
 * Calculates the top gainers and losers based on the most recent price change.
 */
export function getTopMovers(
  stocks: StockSummary[],
  limit = 3,
): TopMoversResult {
  const validLimit = Math.max(0, Math.floor(limit));

  if (validLimit === 0) {
    return { topGainers: [], topLosers: [] };
  }

  const stocksWithChange = stocks.filter((stock) =>
    typeof stock.lastPriceChange === "number" &&
    Number.isFinite(stock.lastPriceChange as number),
  );

  if (stocksWithChange.length === 0) {
    return { topGainers: [], topLosers: [] };
  }

  const sortedByChange = stocksWithChange.slice().sort(
    (a, b) => (b.lastPriceChange ?? 0) - (a.lastPriceChange ?? 0),
  );

  const topGainers = sortedByChange.slice(0, validLimit);
  const topLosers = sortedByChange
    .slice(-validLimit)
    .reverse();

  return { topGainers, topLosers };
}

/**
 * Transforms the market overview sectors into a UI-friendly breakdown.
 */
export function deriveSectorBreakdown(
  overview: MarketOverviewSnapshot | null | undefined,
): SectorBreakdownItem[] {
  const sectors = overview?.sectors;
  if (!sectors || sectors.length === 0) {
    return [];
  }

  return sectors
    .map((sector) => ({
      name: sector.sector ?? "other",
      stockCount: Math.max(0, sector.stockCount ?? 0),
      marketCap: Math.max(0, sector.totalMarketCap ?? 0),
      averageChangePercent: toPercent(sector.averageChange),
    }))
    .sort((a, b) => b.marketCap - a.marketCap);
}
