"use client";

import { useMemo, useState } from "react";
import { Link, redirect, useNavigate, useParams } from "react-router";
import { getAuth } from "@clerk/react-router/ssr.server";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Building2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "convex/_generated/api";
import type { Route } from "./+types/stocks.$symbol";
import { AnimatedNumber } from "~/components/ui/animated-number";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { formatCurrency } from "~/lib/game-utils";
import { calculateTrade } from "~/lib/trade-utils";
import type { PurchaseMode, TradeType } from "~/lib/trade-utils";
import { PriceChart } from "~/components/price-chart";
import { OwnershipDistributionChart } from "~/components/ownership-distribution-chart";

type OwnerType = "player" | "company";

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  if (!userId) {
    throw redirect("/sign-in");
  }
  return {};
}

const SECTOR_STYLES: Record<string, string> = {
  tech: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  energy: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  finance: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  healthcare: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  consumer: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  industrial: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  other: "bg-muted text-foreground border-muted",
};

function getSectorBadgeClass(sector: string | undefined) {
  if (!sector) return SECTOR_STYLES.other;
  return SECTOR_STYLES[sector] ?? SECTOR_STYLES.other;
}

export default function StockDetailPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();

  const allStocks = useQuery(api.stocks.getAllStocks);
  const stock = allStocks?.find((item) => item.symbol === symbol);

  const stockStats = useQuery(
    api.stocks.getStockStats,
    stock?._id ? { stockId: stock._id } : "skip",
  );
  const ownershipData = useQuery(
    api.stocks.getStockOwnership,
    stock?._id ? { stockId: stock._id } : "skip",
  );
  const portfolio = useQuery(api.stocks.getPlayerPortfolio);
  const currentPlayer = useQuery(api.moderation.getCurrentPlayer);
  const myCompanies = useQuery(
    api.companies.getPlayerCompanies,
    currentPlayer?._id ? { playerId: currentPlayer._id } : "skip",
  );

  const buyStock = useMutation(api.stocks.buyStock);
  const sellStock = useMutation(api.stocks.sellStock);
  const buyStockForCompany = useMutation(api.stocks.buyStockForCompany);
  const sellStockForCompany = useMutation(api.stocks.sellStockForCompany);

  const [tradeType, setTradeType] = useState<TradeType>("buy");
  const [ownerType, setOwnerType] = useState<OwnerType>("player");
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>("shares");
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  const playerHolding = useMemo(() => {
    if (!portfolio || !stock?._id) return null;
    return portfolio.find((item) => item.stockId === stock._id) ?? null;
  }, [portfolio, stock?._id]);

  const priceChangePercent = stock ? (stock.lastPriceChange ?? 0) * 100 : 0;
  const priceChangePositive = priceChangePercent >= 0;
  const companyCount = myCompanies?.length ?? 0;
  const isCompanyMode = ownerType === "company";

  const selectedCompanyInfo = useMemo(() => {
    if (!myCompanies || !selectedCompany) return null;
    return (
      myCompanies.find((company) => company._id === selectedCompany) ?? null
    );
  }, [myCompanies, selectedCompany]);

  const tradeCalculation = useMemo(() => {
    if (!stock) {
      return null;
    }

    const pricePerShare = stock.currentPrice ?? 0;
    if (pricePerShare <= 0) {
      return null;
    }

    const availableBalanceCents =
      tradeType === "buy"
        ? isCompanyMode
          ? selectedCompanyInfo?.balance
          : currentPlayer?.balance
        : undefined;

    const availableOwnedShares =
      tradeType === "sell" && !isCompanyMode
        ? (playerHolding?.shares ?? 0)
        : undefined;

    return calculateTrade(tradeAmount, purchaseMode, tradeType, pricePerShare, {
      maxSharesPerOrder: 1_000_000,
      availableBalanceCents:
        typeof availableBalanceCents === "number"
          ? availableBalanceCents
          : undefined,
      availableOwnedShares:
        typeof availableOwnedShares === "number"
          ? availableOwnedShares
          : undefined,
    });
  }, [
    stock,
    tradeAmount,
    purchaseMode,
    tradeType,
    isCompanyMode,
    selectedCompanyInfo?.balance,
    currentPlayer?.balance,
    playerHolding?.shares,
  ]);

  const estimatedShares = tradeCalculation?.estimation.estimatedShares ?? 0;
  const estimatedTotal = tradeCalculation?.estimation.estimatedTotalCents ?? 0;
  const canSubmitTrade = tradeCalculation?.validation.canSubmit ?? false;
  const tradeErrors = tradeCalculation?.validation.errors ?? [];
  const tradeWarnings = tradeCalculation?.validation.warnings ?? [];

  const dailyRange = useMemo(() => {
    if (!stockStats || !stock) return null;
    return {
      dayHigh: stockStats.dayHigh ?? stock.currentPrice ?? 0,
      dayLow: stockStats.dayLow ?? stock.currentPrice ?? 0,
      weekHigh:
        stockStats.weekHigh ?? stockStats.dayHigh ?? stock.currentPrice ?? 0,
      weekLow:
        stockStats.weekLow ?? stockStats.dayLow ?? stock.currentPrice ?? 0,
      volume24h: stockStats.volume24h ?? 0,
      priceChange24h: stockStats.priceChange24h ?? 0,
      priceChangePercent24h: stockStats.priceChangePercent24h ?? 0,
    };
  }, [stockStats, stock]);

  const panelWarnings = (() => {
    const warnings = tradeWarnings.slice();
    if (tradeCalculation?.amount.truncated) {
      warnings.push("Value adjusted to supported precision.");
    }
    return warnings;
  })();

  const availableBalanceCents = isCompanyMode
    ? (selectedCompanyInfo?.balance ?? 0)
    : (currentPlayer?.balance ?? 0);

  const balanceLabel = isCompanyMode
    ? selectedCompanyInfo
      ? `${selectedCompanyInfo.name} balance`
      : "Company balance"
    : "Personal balance";

  const handleTrade = async () => {
    if (!stock) return;

    if (isCompanyMode && companyCount === 0) {
      toast.error("You do not have any companies to trade from.");
      return;
    }

    if (isCompanyMode && !selectedCompany) {
      toast.error("Select a company before continuing.");
      return;
    }

    if (!tradeCalculation) {
      toast.error("Unable to calculate trade details. Please try again.");
      return;
    }

    if (!tradeCalculation.validation.canSubmit) {
      if (tradeErrors.length) {
        tradeErrors.forEach((message) => toast.error(message));
      } else {
        toast.error("Enter a valid amount before submitting the trade.");
      }
      return;
    }

    const shares = tradeCalculation.estimation.estimatedShares;

    if (!Number.isFinite(shares) || shares <= 0) {
      toast.error("Enter a valid quantity.");
      return;
    }

    try {
      if (isCompanyMode) {
        if (tradeType === "buy") {
          await buyStockForCompany({
            companyId: selectedCompany as any,
            stockId: stock._id,
            shares,
          });
          toast.success(
            `Company purchased ${shares.toLocaleString()} shares of ${stock.symbol}.`,
          );
        } else {
          await sellStockForCompany({
            companyId: selectedCompany as any,
            stockId: stock._id,
            shares,
          });
          toast.success(
            `Company sold ${shares.toLocaleString()} shares of ${stock.symbol}.`,
          );
        }
      } else if (tradeType === "buy") {
        await buyStock({ stockId: stock._id, shares });
        toast.success(
          `Bought ${shares.toLocaleString()} shares of ${stock.symbol}.`,
        );
      } else {
        await sellStock({ stockId: stock._id, shares });
        toast.success(
          `Sold ${shares.toLocaleString()} shares of ${stock.symbol}.`,
        );
      }
      setTradeAmount("");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to complete the trade.";
      toast.error(message);
    }
  };

  if (!allStocks) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <Skeleton className="h-12 w-40 rounded-full" />
        <Skeleton className="mt-6 h-64 w-full rounded-3xl" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <h2 className="mt-6 text-2xl font-semibold">Stock not found</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          We couldn't find the ticker{" "}
          {symbol ? `"${symbol}"` : "you were looking for"}. It may have been
          delisted or is not currently available for trading.
        </p>
        <Button className="mt-6" onClick={() => navigate("/stocks")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to market overview
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        className="flex flex-1 flex-col gap-6 p-4 md:p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="relative overflow-hidden border-0 text-white shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FF934F] to-[#EF7176]" />
          <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <CardContent className="relative z-10 flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex items-center gap-3">
                <Button
                  asChild
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <Link to="/stocks">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-white/40 bg-white/10 text-white",
                    getSectorBadgeClass(stock.sector),
                  )}
                >
                  {(stock.sector ?? "other").toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                {stock.companyLogo ? (
                  <img
                    src={stock.companyLogo}
                    alt={stock.symbol}
                    className="h-16 w-16 rounded-lg object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/10 text-lg font-bold text-white shadow-lg">
                    {stock.symbol?.slice(0, 2) ?? "ST"}
                  </div>
                )}
                <div>
                  <h1 className="text-3xl font-bold md:text-4xl">
                    {stock.symbol}
                  </h1>
                  <p className="mt-1 text-sm text-white/80 md:text-base">
                    {stock.name}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">
                    Share price
                  </p>
                  <p className="mt-1 text-4xl font-semibold">
                    {formatCurrency(stock.currentPrice ?? 0)}
                  </p>
                </div>
                <Badge
                  variant={priceChangePositive ? "secondary" : "destructive"}
                  className={cn(
                    "flex items-center gap-1 rounded-full border-0 px-3 py-1 text-xs font-semibold",
                    priceChangePositive
                      ? "bg-emerald-500/20 text-emerald-100"
                      : "bg-rose-500/20 text-rose-100",
                  )}
                >
                  {priceChangePositive ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {priceChangePercent >= 0 ? "+" : ""}
                  {priceChangePercent.toFixed(2)}%
                </Badge>
              </div>
            </div>
            <div className="grid flex-initial gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <HeroMetric label="Player holdings" icon={Wallet}>
                {playerHolding ? playerHolding.shares.toLocaleString() : "0"}
              </HeroMetric>
              <HeroMetric label="Holding value" icon={DollarSign}>
                {playerHolding
                  ? formatCurrency(playerHolding.currentValue)
                  : "$0.00"}
              </HeroMetric>
              <HeroMetric
                label="Unrealized P&L"
                icon={priceChangePositive ? TrendingUp : TrendingDown}
                tone={
                  playerHolding && playerHolding.gainLoss >= 0
                    ? "positive"
                    : playerHolding
                      ? "negative"
                      : "neutral"
                }
              >
                {playerHolding
                  ? `${playerHolding.gainLoss >= 0 ? "+" : ""}${formatCurrency(playerHolding.gainLoss)}`
                  : "$0.00"}
              </HeroMetric>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Price action & Trade</CardTitle>
              <CardDescription>
                Seven-day performance with live trading.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <PriceChart
                  currentPrice={stock.currentPrice ?? 0}
                  symbol={stock.symbol || "STOCK"}
                  height={320}
                  showStats
                  days={7}
                  stockId={stock._id}
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <RangeMetric
                    label="Day high"
                    value={dailyRange?.dayHigh ?? stock.currentPrice ?? 0}
                  />
                  <RangeMetric
                    label="Day low"
                    value={dailyRange?.dayLow ?? stock.currentPrice ?? 0}
                  />
                  <RangeMetric
                    label="Week high"
                    value={dailyRange?.weekHigh ?? stock.currentPrice ?? 0}
                  />
                  <RangeMetric
                    label="Week low"
                    value={dailyRange?.weekLow ?? stock.currentPrice ?? 0}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold">
                    Trade {stock.symbol}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Select your trade parameters and execute instantly.
                  </p>
                </div>
                <Tabs
                  value={tradeType}
                  onValueChange={(value) => setTradeType(value as TradeType)}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="buy">Buy</TabsTrigger>
                    <TabsTrigger value="sell">Sell</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Trade as</Label>
                    <Select
                      value={ownerType}
                      onValueChange={(value) => {
                        setOwnerType(value as OwnerType);
                        if (value === "player") {
                          setSelectedCompany("");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="player">Personal account</SelectItem>
                        <SelectItem
                          value="company"
                          disabled={companyCount === 0}
                        >
                          Company treasury
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {ownerType === "company" && companyCount === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        You do not own any companies yet. Create one to trade as
                        a company.
                      </p>
                    ) : null}
                  </div>

                  {ownerType === "company" && companyCount > 0 ? (
                    <div className="grid gap-2">
                      <Label>Company</Label>
                      <Select
                        value={selectedCompany}
                        onValueChange={setSelectedCompany}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a company" />
                        </SelectTrigger>
                        <SelectContent>
                          {(myCompanies ?? []).map((company) => (
                            <SelectItem key={company._id} value={company._id}>
                              <div className="flex w-full items-center justify-between gap-2">
                                <span className="truncate">{company.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(company.balance)}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <Label>Purchase mode</Label>
                    <Select
                      value={purchaseMode}
                      onValueChange={(value) =>
                        setPurchaseMode(value as PurchaseMode)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shares">Number of shares</SelectItem>
                        <SelectItem value="dollars">Dollar amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>
                      {purchaseMode === "shares" ? "Shares" : "Dollar amount"}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step={purchaseMode === "shares" ? "1" : "0.01"}
                      value={tradeAmount}
                      onChange={(event) => setTradeAmount(event.target.value)}
                      placeholder={
                        purchaseMode === "shares" ? "100" : "1,000.00"
                      }
                    />
                  </div>

                  {tradeErrors.length > 0 ? (
                    <div className="rounded-lg border border-rose-400/60 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                      <ul className="space-y-1">
                        {tradeErrors.map((error, index) => (
                          <li key={`error-${index}`}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {panelWarnings.length > 0 ? (
                    <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                      <ul className="space-y-1">
                        {panelWarnings.map((warning, index) => (
                          <li key={`warning-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="rounded-lg border bg-muted/50 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Estimated shares
                      </span>
                      <span className="font-semibold">
                        {estimatedShares.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Estimated total
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(estimatedTotal)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {balanceLabel}
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(availableBalanceCents)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleTrade}
                  disabled={
                    false ||
                    !canSubmitTrade ||
                    (ownerType === "company" &&
                      (!selectedCompany || companyCount === 0))
                  }
                >
                  {tradeType === "buy" ? "Buy" : "Sell"} {stock.symbol}
                </Button>

                <p className="text-xs text-muted-foreground">
                  Maximum position size is 1,000,000 shares per player across
                  personal and company accounts.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ownership distribution & Market insights</CardTitle>
            <CardDescription>
              Track share concentration and key market metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 grid-cols-2">
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Top holders
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    See how shares are distributed across players.
                  </p>
                </div>
                <OwnershipDistributionChart
                  data={ownershipData}
                  currentPlayerId={currentPlayer?._id}
                  height={280}
                  type="shares"
                />
                <OwnershipTable ownership={ownershipData} />
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-base font-semibold">
                    Market metrics
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Key indicators for liquidity and momentum.
                  </p>
                </div>
                {[
                  {
                    title: "Market capitalization",
                    value: stock.marketCap ?? 0,
                    formatter: (value: number) => (
                      <AnimatedNumber value={value} compact />
                    ),
                  },
                  {
                    title: "Outstanding shares",
                    value: stock.outstandingShares ?? stock.totalShares ?? 0,
                    formatter: (value: number) => value.toLocaleString(),
                  },
                  {
                    title: "24h volume",
                    value: dailyRange?.volume24h ?? 0,
                    formatter: (value: number) => value.toLocaleString(),
                  },
                  {
                    title: "24h price change",
                    value: dailyRange?.priceChange24h ?? 0,
                    formatter: (value: number) => formatCurrency(value),
                    tone:
                      (dailyRange?.priceChange24h ?? 0) >= 0
                        ? "positive"
                        : "negative",
                  },
                  {
                    title: "24h change (%)",
                    value: dailyRange?.priceChangePercent24h ?? 0,
                    formatter: (value: number) =>
                      `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
                    tone:
                      (dailyRange?.priceChangePercent24h ?? 0) >= 0
                        ? "positive"
                        : "negative",
                  },
                ].map((insight) => (
                  <div
                    key={insight.title}
                    className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {insight.title}
                    </span>
                    <span
                      className={cn(
                        "font-semibold",
                        insight.tone === "positive"
                          ? "text-emerald-600"
                          : insight.tone === "negative"
                            ? "text-rose-600"
                            : "text-foreground",
                      )}
                    >
                      {insight.formatter(insight.value)}
                    </span>
                  </div>
                ))}
                <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                  Keep an eye on volume spikes around tick updates. Higher
                  volume often precedes sharp price movements.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function HeroMetric({
  label,
  icon: Icon,
  children,
  tone = "neutral",
}: {
  label: string;
  icon: typeof Wallet;
  children: React.ReactNode;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : "text-white";

  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/70">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn("mt-2 text-xl font-semibold", toneClass)}>
        {children}
      </div>
    </div>
  );
}

function RangeMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{formatCurrency(value)}</p>
    </div>
  );
}

function OwnershipTable({
  ownership,
}: {
  ownership:
    | {
        playerId: string;
        playerName: string;
        shares: number;
      }[]
    | undefined;
}) {
  if (!ownership || ownership.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No share ownership data available yet.
      </div>
    );
  }

  const topHolders = ownership.slice(0, 5);

  return (
    <div className="mt-6 space-y-3">
      {topHolders.map((holder, index) => (
        <div
          key={holder.playerId}
          className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">
              #{index + 1}
            </span>
            <span className="font-medium">{holder.playerName}</span>
          </div>
          <div className="font-semibold">
            {holder.shares.toLocaleString()} shares
          </div>
        </div>
      ))}
    </div>
  );
}
