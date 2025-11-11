import { useEffect, useRef } from "react";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import { formatCurrency } from "~/lib/game-utils";
import {
  generatePriceHistory,
  smoothPriceHistory,
  calculatePriceStats,
} from "~/lib/price-chart-utils";
import { useStockPriceHistory } from "~/hooks/use-stock-price-history";
import type { Id } from "convex/_generated/dataModel";

interface PriceChartProps {
  currentPrice: number;
  symbol: string;
  height?: number;
  showStats?: boolean;
  days?: number;
  stockId?: Id<"stocks"> | null;
}

export function PriceChart({
  currentPrice,
  symbol,
  height = 320,
  showStats = true,
  days = 7,
  stockId,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Fetch real price history from database (fetches all history)
  const realHistory = useStockPriceHistory(stockId);

  // Use real data if available, otherwise fall back to generated data
  let data;
  if (realHistory && realHistory.length > 0) {
    // Real data is already in cents, use as-is
    data = realHistory;
  } else {
    // Fallback: generate mock data while real data loads
    data = smoothPriceHistory(generatePriceHistory(currentPrice, days, symbol));
  }

  const stats = calculatePriceStats(
    data.map((d) => ({
      timestamp: d.timestamp ?? 0,
      price: d.price,
      displayTime: d.displayTime ?? "",
      formattedPrice: d.formattedPrice ?? "",
    }))
  );

  const isPositive = stats.change >= 0;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        attributionLogo: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      grid: {
        vertLines: { color: "#e5e7eb" },
        horzLines: { color: "#e5e7eb" },
      },
      rightPriceScale: {
        borderColor: "#e5e7eb",
      },
      timeScale: {
        borderColor: "#e5e7eb",
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: isPositive ? "#10b981" : "#ef4444",
      lineWidth: 3,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => `$${(price / 100).toFixed(2)}`,
      },
    });

    // Transform data for TradingView (time-based horizontal scale using timestamps)
    const chartData = data.map((d) => ({
      time: Math.floor((d.timestamp ?? Date.now()) / 1000) as any, // Convert to Unix timestamp in seconds
      value: d.price,
    }));

    lineSeries.setData(chartData);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height, isPositive]);

  return (
    <div className="w-full space-y-3">
      {showStats && (
        <div className="grid grid-cols-4 gap-2 text-sm">
          <div>
            <div className="text-muted-foreground">High</div>
            <div className="font-semibold">{formatCurrency(stats.high)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Low</div>
            <div className="font-semibold">{formatCurrency(stats.low)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Avg</div>
            <div className="font-semibold">{formatCurrency(stats.average)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Change</div>
            <div
              className={`font-semibold ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {isPositive ? "+" : ""}
              {stats.changePercent.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      <div ref={chartContainerRef} />
    </div>
  );
}
