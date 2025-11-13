import { describe, expect, it } from "vitest";
import {
  deriveSectorBreakdown,
  extractUniqueSectors,
  filterStocks,
  getTopMovers,
  selectStocks,
  sortStocks,
  toPercent,
  type MarketOverviewSnapshot,
  type StockSummary,
} from "./stocks-page-utils";

const sampleStocks: StockSummary[] = [
  {
    _id: "1",
    symbol: "AAA",
    name: "Alpha Analytics",
    sector: "tech",
    currentPrice: 10_500,
    marketCap: 5_000_000,
    lastPriceChange: 0.12,
  },
  {
    _id: "2",
    symbol: "BBB",
    name: "Beta Bio",
    sector: "healthcare",
    currentPrice: 8_000,
    marketCap: 7_000_000,
    lastPriceChange: -0.04,
  },
  {
    _id: "3",
    symbol: "CCC",
    name: "Core Commodities",
    sector: "energy",
    currentPrice: 11_000,
    marketCap: 6_000_000,
    lastPriceChange: 0.03,
  },
  {
    _id: "4",
    symbol: "DDD",
    name: "Delta Devices",
    sector: "tech",
    currentPrice: 12_500,
    marketCap: 4_000_000,
    lastPriceChange: -0.1,
  },
];

describe("filterStocks", () => {
  it("returns all stocks when no filters applied", () => {
    const result = filterStocks(sampleStocks);
    expect(result).toHaveLength(sampleStocks.length);
    expect(result).not.toBe(sampleStocks);
  });

  it("filters by search query matching symbol and name case-insensitively", () => {
    const bySymbol = filterStocks(sampleStocks, { searchQuery: "ccc" });
    const byName = filterStocks(sampleStocks, { searchQuery: "delta" });

    expect(bySymbol.map((s) => s.symbol)).toEqual(["CCC"]);
    expect(byName.map((s) => s.symbol)).toEqual(["DDD"]);
  });

  it("filters by sector while ignoring the default all keyword", () => {
    const result = filterStocks(sampleStocks, { sector: "tech" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.symbol)).toEqual(["AAA", "DDD"]);

    const allResult = filterStocks(sampleStocks, { sector: "all" });
    expect(allResult).toHaveLength(sampleStocks.length);
  });

  it("supports custom all keyword", () => {
    const result = filterStocks(sampleStocks, {
      sector: "everything",
      allSectorsKeyword: "everything",
    });

    expect(result).toHaveLength(sampleStocks.length);
  });
});

describe("sortStocks", () => {
  it("sorts by market cap descending by default", () => {
    const result = sortStocks(sampleStocks);
    expect(result.map((s) => s.symbol)).toEqual(["BBB", "CCC", "AAA", "DDD"]);
  });

  it("sorts by price ascending and descending", () => {
    const asc = sortStocks(sampleStocks, "price-asc");
    const desc = sortStocks(sampleStocks, "price-desc");

    expect(asc.map((s) => s.symbol)).toEqual(["BBB", "AAA", "CCC", "DDD"]);
    expect(desc.map((s) => s.symbol)).toEqual(["DDD", "CCC", "AAA", "BBB"]);
  });

  it("sorts by change ascending and descending using percentage values", () => {
    const asc = sortStocks(sampleStocks, "change-asc");
    const desc = sortStocks(sampleStocks, "change-desc");

    expect(asc.map((s) => s.symbol)).toEqual(["DDD", "BBB", "CCC", "AAA"]);
    expect(desc.map((s) => s.symbol)).toEqual(["AAA", "CCC", "BBB", "DDD"]);
  });
});

describe("selectStocks", () => {
  it("applies filtering and sorting in a single call", () => {
    const result = selectStocks(sampleStocks, {
      searchQuery: "a",
      sortBy: "price-desc",
    });

    expect(result.map((s) => s.symbol)).toEqual(["DDD", "AAA", "BBB"]);
  });

  it("respects sector filtering within combined selection", () => {
    const result = selectStocks(sampleStocks, {
      sector: "tech",
      sortBy: "price-asc",
    });

    expect(result.map((s) => s.symbol)).toEqual(["AAA", "DDD"]);
  });
});

describe("extractUniqueSectors", () => {
  it("returns alphabetically sorted unique sectors", () => {
    const result = extractUniqueSectors(sampleStocks);
    expect(result).toEqual(["energy", "healthcare", "tech"]);
  });

  it("ignores stocks without a sector defined", () => {
    const withNull: StockSummary[] = [
      ...sampleStocks,
      { _id: "5", symbol: "EEE", companyLogo: null },
    ];

    const result = extractUniqueSectors(withNull);
    expect(result).toEqual(["energy", "healthcare", "tech"]);
  });
});

describe("getTopMovers", () => {
  it("returns top gainers and losers limited by the provided count", () => {
    const { topGainers, topLosers } = getTopMovers(sampleStocks, 2);

    expect(topGainers.map((s) => s.symbol)).toEqual(["AAA", "CCC"]);
    expect(topLosers.map((s) => s.symbol)).toEqual(["DDD", "BBB"]);
  });

  it("handles missing or invalid change values", () => {
    const noChange: StockSummary[] = [
      { _id: "1", symbol: "AAA" },
      { _id: "2", symbol: "BBB", lastPriceChange: null },
    ];

    const result = getTopMovers(noChange, 3);
    expect(result.topGainers).toHaveLength(0);
    expect(result.topLosers).toHaveLength(0);
  });

  it("guards against non-positive limits", () => {
    const zeroLimit = getTopMovers(sampleStocks, 0);
    const negativeLimit = getTopMovers(sampleStocks, -5);

    expect(zeroLimit.topGainers).toHaveLength(0);
    expect(negativeLimit.topLosers).toHaveLength(0);
  });
});

describe("deriveSectorBreakdown", () => {
  it("maps and sorts sectors by market cap while converting changes to percent", () => {
    const snapshot: MarketOverviewSnapshot = {
      sectors: [
        {
          sector: "energy",
          stockCount: 2,
          totalMarketCap: 2_500_000,
          averageChange: -0.0125,
        },
        {
          sector: "tech",
          stockCount: 3,
          totalMarketCap: 5_000_000,
          averageChange: 0.045,
        },
      ],
    };

    const result = deriveSectorBreakdown(snapshot);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "tech",
      stockCount: 3,
      marketCap: 5_000_000,
      averageChangePercent: 4.5,
    });
    expect(result[1]).toMatchObject({
      name: "energy",
      stockCount: 2,
      marketCap: 2_500_000,
      averageChangePercent: -1.25,
    });
  });

  it("returns an empty array when sectors data is missing", () => {
    expect(deriveSectorBreakdown(null)).toEqual([]);
    expect(
      deriveSectorBreakdown({ sectors: undefined }),
    ).toEqual([]);
  });
});

describe("toPercent", () => {
  it("converts fractions to percentage points and handles invalid input", () => {
    expect(toPercent(0.1234)).toBeCloseTo(12.34);
    expect(toPercent(null)).toBe(0);
    expect(toPercent(NaN)).toBe(0);
  });
});
