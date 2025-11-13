"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "@clerk/react-router/ssr.server";
import { redirect, Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { motion } from "motion/react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { AnimatedNumber } from "~/components/ui/animated-number";
import { PriceChart } from "~/components/price-chart";
import { formatCurrency } from "~/lib/game-utils";
import { useTheme } from "~/contexts/theme-context";
import { cn } from "~/lib/utils";
import {
  deriveSectorBreakdown,
  extractUniqueSectors,
  getTopMovers,
  selectStocks,
  toPercent,
  type StockSortOption,
} from "~/lib/stocks-page-utils";
import {
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Filter,
  Search,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export async function loader(args: any) {
  const { userId } = await getAuth(args);
  if (!userId) {
    throw redirect("/sign-in");
  }
  return {};
}

function getSectorColor(sector: string): string {
  const colors: Record<string, string> = {
    tech: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    energy: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    finance: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    healthcare: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    consumer: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    industrial: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    other: "bg-muted text-foreground border-muted",
  };
  return colors[sector] || colors.other;
}

const CARD_GRID_CLASSES =
  "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export default function StocksPage() {
  const { preset } = useTheme();
  const allStocks = useQuery(api.stocks.getAllStocks);
  const marketOverview = useQuery(api.stocks.getMarketOverview);

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<StockSortOption>("marketcap-desc");

  useEffect(() => {
    setMounted(true);
  }, []);

  const sectors = useMemo(() => {
    if (!allStocks) return [];
    return extractUniqueSectors(allStocks);
  }, [allStocks]);

  const filteredStocks = useMemo(() => {
    if (!allStocks) return [];
    return selectStocks(allStocks, {
      searchQuery,
      sector: sectorFilter,
      sortBy,
    });
  }, [allStocks, searchQuery, sectorFilter, sortBy]);

  const { topGainers, topLosers } = useMemo(() => {
    if (!allStocks?.length) {
      return { topGainers: [], topLosers: [] };
    }
    return getTopMovers(allStocks, 3);
  }, [allStocks]);

  const sectorBreakdown = useMemo(
    () => deriveSectorBreakdown(marketOverview),
    [marketOverview],
  );

  if (!mounted) {
    return <div className="flex flex-1 flex-col" />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        className="@container/main flex flex-1 flex-col gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          <HeroSection preset={preset} marketOverview={marketOverview} />

          <motion.div
            className="grid gap-4 lg:grid-cols-[1fr_340px]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold">
                    Discover Companies
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Search, filter, and sort to find your next opportunity.
                  </p>
                </div>
                <Filter className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by company or ticker"
                      className="h-11 pl-10"
                    />
                  </div>
                  <Select
                    value={sectorFilter}
                    onValueChange={(value: string) => setSectorFilter(value)}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="All sectors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sectors</SelectItem>
                      {sectors.map((sector) => (
                        <SelectItem key={sector} value={sector}>
                          {sector.charAt(0).toUpperCase() + sector.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as StockSortOption)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Sort stocks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketcap-desc">
                      Market cap (high to low)
                    </SelectItem>
                    <SelectItem value="price-desc">
                      Share price (high to low)
                    </SelectItem>
                    <SelectItem value="price-asc">
                      Share price (low to high)
                    </SelectItem>
                    <SelectItem value="change-desc">Biggest gainers</SelectItem>
                    <SelectItem value="change-asc">Biggest losers</SelectItem>
                  </SelectContent>
                </Select>

                <div className="grid gap-3 md:grid-cols-2">
                  <TopMovers
                    title="Top gainers"
                    icon={TrendingUp}
                    stocks={topGainers}
                  />
                  <TopMovers
                    title="Top decliners"
                    icon={TrendingDown}
                    stocks={topLosers}
                    negative
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  Sector insights
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Track capital concentration and momentum across industries.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!sectorBreakdown.length ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => (
                      <Skeleton key={item} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  sectorBreakdown.map((sector) => (
                    <div
                      key={sector.name}
                      className="rounded-xl border bg-muted/40 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-transparent text-xs font-medium",
                              getSectorColor(sector.name ?? "other"),
                            )}
                          >
                            {(sector.name ?? "other").toUpperCase()}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {sector.stockCount} listed
                          </span>
                        </div>
                        <span
                          className={cn(
                            "flex items-center text-sm font-semibold",
                            sector.averageChangePercent >= 0
                              ? "text-emerald-600"
                              : "text-rose-600",
                          )}
                        >
                          {sector.averageChangePercent >= 0 ? (
                            <ArrowUpRight className="mr-1 h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="mr-1 h-4 w-4" />
                          )}
                          {sector.averageChangePercent >= 0 ? "+" : ""}
                          {sector.averageChangePercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">
                        Market cap share
                      </div>
                      <div className="text-lg font-semibold">
                        <AnimatedNumber value={sector.marketCap} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            className={CARD_GRID_CLASSES}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            {!allStocks ? (
              Array.from({ length: 8 }).map((_, index) => (
                <Card key={`skeleton-${index}`} className="border-dashed">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    </div>
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-6 w-1/4" />
                  </CardContent>
                </Card>
              ))
            ) : filteredStocks.length === 0 ? (
              <Card className="col-span-full border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-6 text-xl font-semibold">
                    No stocks match your filters
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    Try broadening your search terms or selecting a different
                    sector to continue exploring the market.
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredStocks.map((stock) => {
                const price = stock.currentPrice ?? 0;
                const marketCap = stock.marketCap ?? 0;
                const changePercent = toPercent(stock.lastPriceChange);
                const changePositive = changePercent >= 0;

                return (
                  <Link
                    key={stock._id}
                    to={`/stocks/${stock.symbol}`}
                    className="group"
                  >
                    <Card className="h-full border-transparent bg-card/60 shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl">
                      <CardContent className="flex h-full flex-col space-y-4 p-6">
                        <div className="flex items-start gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            {stock.companyLogo ? (
                              <img
                                src={stock.companyLogo}
                                alt={stock.symbol ?? "Company"}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <Building2 className="h-6 w-6 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-lg font-semibold">
                                {stock.symbol}
                              </h3>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  getSectorColor(stock.sector ?? "other"),
                                )}
                              >
                                {(stock.sector ?? "other").toUpperCase()}
                              </Badge>
                            </div>
                            <p className="truncate text-sm text-muted-foreground">
                              {stock.name}
                            </p>
                          </div>
                        </div>

                        <div className="h-24 overflow-hidden rounded-xl border bg-muted/40">
                          <PriceChart
                            currentPrice={price}
                            symbol={stock.symbol || "STOCK"}
                            height={96}
                            days={7}
                            showStats={false}
                            stockId={stock._id}
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            Market cap
                          </span>
                          <div className="text-lg font-semibold">
                            <AnimatedNumber value={marketCap} compact />
                          </div>
                        </div>

                        <div className="flex items-end justify-between">
                          <div>
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                              Share price
                            </span>
                            <div className="text-2xl font-bold">
                              {formatCurrency(price)}
                            </div>
                          </div>
                          <Badge
                            variant={changePositive ? "default" : "destructive"}
                            className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                          >
                            {changePositive ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            {changePercent >= 0 ? "+" : ""}
                            {changePercent.toFixed(2)}%
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function HeroSection({
  preset,
  marketOverview,
}: {
  preset: string;
  marketOverview: any;
}) {
  return (
    <motion.div
      className="relative overflow-hidden rounded-3xl border-0 text-white shadow-2xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div
        className={cn(
          "relative z-10 grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:p-8",
          preset === "default" || preset === "dark-default"
            ? "bg-gradient-to-br from-[#FF934F] to-[#EF7176]"
            : "bg-primary",
        )}
      >
        <div className="space-y-3 lg:space-y-4">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Stock Market
          </h1>
          <p className="max-w-xl text-sm text-white/80 md:text-base">
            Monitor live market momentum, compare sectors, and execute trades
            with a clear view of valuations and volatility. Stay ahead of the
            next swing.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {marketOverview ? (
              <>
                <HeroStat
                  label="Total market cap"
                  value={marketOverview.totalMarketCap}
                />
                <HeroStat
                  label="Average 24h change"
                  value={marketOverview.averageChange24h * 100}
                  isPercent
                />
                <HeroStat
                  label="Active listings"
                  value={marketOverview.stockCount ?? 0}
                  isCount
                />
                <HeroStat
                  label="Tracked sectors"
                  value={marketOverview.sectors?.length ?? 0}
                  isCount
                />
              </>
            ) : (
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`hero-skeleton-${index}`}
                  className="space-y-2 rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm"
                >
                  <Skeleton className="h-4 w-24 bg-white/30" />
                  <Skeleton className="h-7 w-32 bg-white/40" />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.25)_0,rgba(255,255,255,0)_70%)]" />
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Live market pulse
              </h2>
              <Badge
                variant="outline"
                className="border-white/30 bg-white/20 text-xs font-medium text-white"
              >
                Real-time
              </Badge>
            </div>
            <p className="text-sm text-white/80">
              Watch aggregate performance and monitor sector rotations. Changes
              update automatically as ticks process in real-time.
            </p>
            <div className="grid gap-3">
              <InsightRow
                label="Volatility outlook"
                value="Moderate"
                tone="neutral"
              />
              <InsightRow
                label="Momentum bias"
                value={
                  marketOverview?.averageChange24h >= 0 ? "Bullish" : "Bearish"
                }
                tone={
                  marketOverview?.averageChange24h >= 0
                    ? "positive"
                    : "negative"
                }
              />
              <InsightRow
                label="Liquidity depth"
                value={
                  marketOverview?.totalMarketCap
                    ? marketOverview.totalMarketCap > 1_000_000_000
                      ? "High"
                      : "Developing"
                    : "Collecting data"
                }
                tone="neutral"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute -left-28 bottom-0 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12)_0,rgba(255,255,255,0)_70%)]" />
      </div>
    </motion.div>
  );
}

function HeroStat({
  label,
  value,
  isPercent,
  isCount,
}: {
  label: string;
  value: number;
  isPercent?: boolean;
  isCount?: boolean;
}) {
  return (
    <div className="space-y-1 rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/70">
        {label}
      </div>
      <div className="text-xl font-semibold text-white">
        {isPercent ? (
          <>
            {value >= 0 ? "+" : ""}
            {value.toFixed(2)}%
          </>
        ) : isCount ? (
          value.toLocaleString()
        ) : (
          <AnimatedNumber value={value} />
        )}
      </div>
    </div>
  );
}

function InsightRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : "text-white";

  return (
    <div className="flex items-center justify-between rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white">
      <span className="text-white/70">{label}</span>
      <span className={cn("font-semibold", toneClass)}>{value}</span>
    </div>
  );
}

function TopMovers({
  title,
  icon: Icon,
  stocks,
  negative,
}: {
  title: string;
  icon: typeof TrendingUp;
  stocks: any[];
  negative?: boolean;
}) {
  return (
    <Card className="border border-dashed bg-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "h-4 w-4",
              negative ? "text-rose-500" : "text-emerald-500",
            )}
          />
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!stocks.length ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          stocks.map((stock) => {
            const changePercent = toPercent(stock.lastPriceChange);
            return (
              <Link
                key={`mover-${stock._id}`}
                to={`/stocks/${stock.symbol}`}
                className="flex items-center justify-between rounded-lg bg-background px-4 py-3 text-sm shadow-sm transition hover:bg-muted"
              >
                <div className="flex items-center gap-3">
                  {stock.companyLogo ? (
                    <img
                      src={stock.companyLogo}
                      alt={stock.symbol}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {stock.symbol?.slice(0, 2) ?? "ST"}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-foreground">
                      {stock.symbol}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stock.name}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "flex items-center text-sm font-semibold",
                    changePercent >= 0 ? "text-emerald-600" : "text-rose-600",
                  )}
                >
                  {changePercent >= 0 ? "+" : ""}
                  {changePercent.toFixed(2)}%
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
