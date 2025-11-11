import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export interface PriceHistoryPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  displayTime: string;
  formattedPrice: string;
}

/**
 * Hook to fetch real stock price history from the database
 * @param stockId - The ID of the stock to fetch history for
 * @param limit - Maximum number of price points to fetch (optional - fetches all if not provided)
 * @returns Array of price history points or undefined if loading
 */
export function useStockPriceHistory(
  stockId: Id<"stocks"> | null | undefined,
  limit?: number
) {
  const rawHistory = useQuery(
    api.stocks.getStockPriceHistory,
    stockId ? { stockId, limit } : "skip"
  );

  // Transform raw data to format expected by PriceChart
  // Keep prices in cents - chart will handle conversion
  const history = rawHistory
    ? rawHistory
        .map((point) => ({
          timestamp: point.timestamp,
          open: point.open ?? 0,
          high: point.high ?? 0,
          low: point.low ?? 0,
          close: point.close ?? 0,
          volume: point.volume ?? 0,
          displayTime: new Date(point.timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          formattedPrice: `$${(point.close ? point.close / 100 : 0).toFixed(2)}`,
          // price field will be set by chart component (use close in cents)
          price: point.close ?? 0,
        }))
        .reverse() // Reverse to get oldest to newest
    : undefined;

  return history;
}
