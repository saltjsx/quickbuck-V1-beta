"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { formatCurrency } from "~/lib/game-utils";
import { useAuth } from "@clerk/react-router";
import type { Id } from "convex/_generated/dataModel";
import { getAuth } from "@clerk/react-router/ssr.server";
import { redirect } from "react-router";
import type { Route } from "./+types/portfolio";
import { NetWorthBreakdownModern } from "~/components/dashboard/modern/net-worth-breakdown-modern";
import { AnimatedNumber } from "~/components/ui/animated-number";
import { motion } from "motion/react";
import {
  ArrowUpDown,
  Banknote,
  Building2,
  Coins,
  PieChart,
  ShoppingBag,
} from "lucide-react";
import { useTheme } from "~/contexts/theme-context";

type SortField = "value" | "amount" | "name";
type SortOrder = "asc" | "desc";

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  if (!userId) throw redirect("/sign-in");
  return {};
}

export default function PortfolioPage() {
  const navigate = useNavigate();
  const { userId: clerkUserId } = useAuth();
  const { preset } = useTheme();

  // Get user and player
  const user = useQuery(
    api.users.findUserByToken,
    clerkUserId ? { tokenIdentifier: clerkUserId } : "skip"
  );
  const player = useQuery(
    api.players.getPlayerByUserId,
    user ? { userId: user._id as Id<"users"> } : "skip"
  );

  // Get player balance and net worth (for KPI cards)
  const balance = useQuery(
    api.players.getPlayerBalance,
    player?._id ? { playerId: player._id } : "skip"
  );

  // Get player's companies to compute equity
  const playerCompanies = useQuery(
    api.companies.getPlayerCompanies,
    player?._id ? { playerId: player._id } : "skip"
  );

  // Get crypto holdings
  const cryptoHoldings = useQuery(
    api.portfolio.getUserCryptoHoldings,
    player?._id ? { userId: player._id } : "skip"
  );

  // Get stock portfolio
  const stockPortfolio = useQuery(api.stocks.getPlayerPortfolio);

  // Get player inventory (marketplace items)
  const playerInventory = useQuery(
    api.products.getPlayerInventory,
    player?._id ? { playerId: player._id } : "skip"
  );

  // Sorting state
  const [cryptoSort, setCryptoSort] = useState<{
    field: SortField;
    order: SortOrder;
  }>({
    field: "value",
    order: "desc",
  });
  const [stockSort, setStockSort] = useState<{
    field: SortField;
    order: SortOrder;
  }>({
    field: "value",
    order: "desc",
  });

  // Build crypto details - already enriched from getUserCryptoHoldings
  const cryptoWithDetails =
    cryptoHoldings?.map((holding) => ({ holding, crypto: holding.crypto })) ??
    [];

  // Build stock details - already enriched from getPlayerPortfolio
  const stockWithDetails =
    stockPortfolio?.map((portfolio) => ({
      portfolio,
      stock: portfolio.stock,
    })) ?? [];

  // Totals
  const totalCryptoValue =
    cryptoWithDetails.reduce((sum, item) => {
      const v = item.crypto
        ? Math.floor(item.holding.balance * item.crypto.currentPrice)
        : 0;
      return sum + v;
    }, 0) || 0;

  const totalStockValue =
    stockWithDetails.reduce(
      (sum, item) => sum + (item.portfolio.currentValue || 0),
      0
    ) || 0;

  const totalBalance = balance ?? 0;
  // Calculate company equity
  // For public companies: use market cap (from stock current price, already calculated in getPlayerCompanies)
  // For private companies: use company balance
  const companyEquity = playerCompanies
    ? playerCompanies.reduce((sum, company) => {
        if (company.isPublic) {
          // For public companies, market cap is already calculated from stock price in getPlayerCompanies
          return sum + (company.marketCap || 0);
        } else {
          // For private companies, use company balance as equity
          return sum + company.balance;
        }
      }, 0)
    : 0;

  // Sorting helpers
  const sortCrypto = (data: typeof cryptoWithDetails) => {
    return [...data].sort((a, b) => {
      let comparison = 0;
      switch (cryptoSort.field) {
        case "value":
          comparison =
            (a.crypto
              ? Math.floor(a.holding.balance * a.crypto.currentPrice)
              : 0) -
            (b.crypto
              ? Math.floor(b.holding.balance * b.crypto.currentPrice)
              : 0);
          break;
        case "amount":
          comparison = a.holding.balance - b.holding.balance;
          break;
        case "name":
          comparison = (a.crypto?.name || "").localeCompare(
            b.crypto?.name || ""
          );
          break;
      }
      return cryptoSort.order === "asc" ? comparison : -comparison;
    });
  };

  const sortStocks = (data: typeof stockWithDetails) => {
    return [...data].sort((a, b) => {
      let comparison = 0;
      switch (stockSort.field) {
        case "value":
          comparison =
            (a.portfolio.currentValue || 0) - (b.portfolio.currentValue || 0);
          break;
        case "amount":
          comparison = a.portfolio.shares - b.portfolio.shares;
          break;
        case "name":
          comparison = (a.stock?.symbol || "").localeCompare(
            b.stock?.symbol || ""
          );
          break;
      }
      return stockSort.order === "asc" ? comparison : -comparison;
    });
  };

  const sortedCrypto = sortCrypto(cryptoWithDetails);
  const sortedStocks = sortStocks(stockWithDetails);

  // Row models
  const cryptoRows = useMemo(() => {
    return sortedCrypto.map((item) => {
      const value = item.crypto
        ? Math.floor(item.holding.balance * item.crypto.currentPrice)
        : 0;
      const cost = Math.floor(
        item.holding.balance * (item.holding.averagePurchasePrice || 0)
      );
      const pnl = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      return { ...item, value, cost, pnl, pnlPct };
    });
  }, [sortedCrypto]);

  const stockRows = useMemo(() => {
    return sortedStocks.map((item) => {
      const currentValue = item.portfolio.currentValue || 0;
      const totalInvested = item.portfolio.totalInvested || 0;
      const gainLoss = currentValue - totalInvested;
      const gainLossPercent =
        totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;
      return {
        ...item,
        currentValue,
        totalInvested,
        gainLoss,
        gainLossPercent,
      };
    });
  }, [sortedStocks]);

  // Motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.12 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: "easeOut" },
    },
  };

  const tabContentVariants = {
    hidden: { opacity: 0, y: 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.25, ease: "easeOut" },
    },
  };

  const netWorth =
    totalBalance + totalStockValue + totalCryptoValue + companyEquity;

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        className="@container/main flex flex-1 flex-col gap-2"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          {/* Header / Summary */}
          <motion.div variants={itemVariants}>
            <Card className={`relative overflow-hidden border-0 text-white shadow-2xl ${
              preset === "default" || preset === "dark-default" 
                ? "bg-gradient-to-br from-[#FF934F] to-[#EF7176]" 
                : "bg-primary"
            }`}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent dark:from-black/20 dark:via-black/10 dark:to-transparent" />
              <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-white/20 blur-3xl dark:bg-black/30" />
              <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-white/20 blur-3xl dark:bg-black/30" />
              <CardHeader className="relative z-10">
                <div className="flex flex-col gap-1">
                  <CardDescription className="text-white/70">Portfolio Value</CardDescription>
                  <CardTitle className="text-4xl font-bold tracking-tight md:text-5xl text-white">
                    <AnimatedNumber
                      value={netWorth}
                      compact={true}
                      isCents={true}
                    />
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <Banknote className="h-4 w-4" />
                      Cash
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      <AnimatedNumber
                        value={totalBalance}
                        compact={false}
                        isCents={true}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <Building2 className="h-4 w-4" />
                      Stocks
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      <AnimatedNumber
                        value={totalStockValue}
                        compact={false}
                        isCents={true}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <Coins className="h-4 w-4" />
                      Crypto
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      <AnimatedNumber
                        value={totalCryptoValue}
                        compact={false}
                        isCents={true}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <PieChart className="h-4 w-4" />
                      Company Equity
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      <AnimatedNumber
                        value={companyEquity}
                        compact={false}
                        isCents={true}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>

              {/* subtle gradient accents */}
              <div className="pointer-events-none absolute inset-0 -z-0">
                <div className="absolute -left-24 -top-24 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-24 -right-24 h-44 w-44 rounded-full bg-secondary/10 blur-3xl" />
              </div>
            </Card>
          </motion.div>

          {/* Tabbed Content */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle>Portfolio</CardTitle>
                  <CardDescription>
                    Clean, organized, and easy to navigate
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="stocks">Stocks</TabsTrigger>
                    <TabsTrigger value="crypto">Crypto</TabsTrigger>
                    <TabsTrigger value="collections">Collections</TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" asChild>
                    <motion.div
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <PieChart className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Net Worth Breakdown</CardTitle>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <NetWorthBreakdownModern
                              cash={totalBalance}
                              stocksValue={totalStockValue}
                              cryptoValue={totalCryptoValue}
                              companyEquity={companyEquity}
                              isLoading={player === undefined}
                            />
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>Highlights</CardTitle>
                            <CardDescription>
                              Your top assets at a glance
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="rounded-lg border p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">
                                  Top Stock
                                </span>
                                <Badge variant="outline" className="font-mono">
                                  {stockRows[0]?.stock?.symbol ?? "—"}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm">
                                Value{" "}
                                <span className="font-medium">
                                  {formatCurrency(
                                    stockRows[0]?.currentValue ?? 0
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="rounded-lg border p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">
                                  Top Crypto
                                </span>
                                <Badge variant="outline" className="font-mono">
                                  {cryptoRows[0]?.crypto?.symbol ?? "—"}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm">
                                Value{" "}
                                <span className="font-medium">
                                  {formatCurrency(cryptoRows[0]?.value ?? 0)}
                                </span>
                              </div>
                            </div>
                            <div className="rounded-lg border p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">
                                  Inventory Items
                                </span>
                                <Badge variant="outline">
                                  {playerInventory?.reduce(
                                    (sum, i) => sum + i.quantity,
                                    0
                                  ) ?? 0}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm">
                                Total{" "}
                                <span className="font-medium">
                                  {formatCurrency(
                                    playerInventory?.reduce(
                                      (s, i) => s + i.totalPrice,
                                      0
                                    ) ?? 0
                                  )}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </motion.div>
                  </TabsContent>

                  {/* Stocks Tab */}
                  <TabsContent value="stocks" asChild>
                    <motion.div
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                              <CardTitle>Stock Holdings</CardTitle>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                Total Value
                              </p>
                              <div className="text-lg font-semibold">
                                <AnimatedNumber
                                  value={totalStockValue}
                                  compact={false}
                                  isCents={true}
                                />
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {!stockWithDetails ||
                          stockWithDetails.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                              No stock holdings yet
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Ticker</TableHead>
                                  <TableHead
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() =>
                                      setStockSort({
                                        field: "amount",
                                        order:
                                          stockSort.field === "amount" &&
                                          stockSort.order === "desc"
                                            ? "asc"
                                            : "desc",
                                      })
                                    }
                                  >
                                    <div className="flex items-center gap-1">
                                      Shares <ArrowUpDown className="h-3 w-3" />
                                    </div>
                                  </TableHead>
                                  <TableHead>Avg Cost</TableHead>
                                  <TableHead
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() =>
                                      setStockSort({
                                        field: "value",
                                        order:
                                          stockSort.field === "value" &&
                                          stockSort.order === "desc"
                                            ? "asc"
                                            : "desc",
                                      })
                                    }
                                  >
                                    <div className="flex items-center gap-1">
                                      Value <ArrowUpDown className="h-3 w-3" />
                                    </div>
                                  </TableHead>
                                  <TableHead className="text-right">
                                    P/L
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {stockRows.map((item) => (
                                  <TableRow
                                    key={item.portfolio._id}
                                    className="cursor-pointer transition-colors hover:bg-muted/50"
                                    onClick={() =>
                                      item.stock &&
                                      navigate(`/stocks/${item.stock.symbol}`)
                                    }
                                  >
                                    <TableCell className="font-medium">
                                      <div className="flex items-center gap-2">
                                        <span>{item.stock?.symbol}</span>
                                        <Badge
                                          variant="outline"
                                          className="font-mono text-xs"
                                        >
                                          {item.stock?.name}
                                        </Badge>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {item.portfolio.shares.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {formatCurrency(
                                        item.portfolio.averageCost
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      {formatCurrency(item.currentValue)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      <span
                                        className={
                                          item.gainLoss >= 0
                                            ? "text-green-600"
                                            : "text-red-500"
                                        }
                                      >
                                        {item.gainLoss >= 0 ? "+" : "-"}
                                        {formatCurrency(
                                          Math.abs(item.gainLoss)
                                        )}
                                      </span>
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        ({item.gainLossPercent.toFixed(1)}%)
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/50 font-bold">
                                  <TableCell colSpan={4}>Total</TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(totalStockValue)}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TabsContent>

                  {/* Crypto Tab */}
                  <TabsContent value="crypto" asChild>
                    <motion.div
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Coins className="h-5 w-5 text-muted-foreground" />
                              <CardTitle>Crypto Holdings</CardTitle>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                Total Value
                              </p>
                              <div className="text-lg font-semibold">
                                <AnimatedNumber
                                  value={totalCryptoValue}
                                  compact={false}
                                  isCents={true}
                                />
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {!cryptoWithDetails ||
                          cryptoWithDetails.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                              No crypto holdings yet
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Asset</TableHead>
                                  <TableHead
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() =>
                                      setCryptoSort({
                                        field: "amount",
                                        order:
                                          cryptoSort.field === "amount" &&
                                          cryptoSort.order === "desc"
                                            ? "asc"
                                            : "desc",
                                      })
                                    }
                                  >
                                    <div className="flex items-center gap-1">
                                      Tokens <ArrowUpDown className="h-3 w-3" />
                                    </div>
                                  </TableHead>
                                  <TableHead>Avg Price</TableHead>
                                  <TableHead
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() =>
                                      setCryptoSort({
                                        field: "value",
                                        order:
                                          cryptoSort.field === "value" &&
                                          cryptoSort.order === "desc"
                                            ? "asc"
                                            : "desc",
                                      })
                                    }
                                  >
                                    <div className="flex items-center gap-1">
                                      Value <ArrowUpDown className="h-3 w-3" />
                                    </div>
                                  </TableHead>
                                  <TableHead className="text-right">
                                    P/L
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {cryptoRows.map((item) => (
                                  <TableRow
                                    key={item.holding._id}
                                    className="cursor-pointer transition-colors hover:bg-muted/50"
                                    onClick={() =>
                                      item.crypto &&
                                      navigate(`/crypto/${item.crypto.symbol}`)
                                    }
                                  >
                                    <TableCell className="font-medium">
                                      <div className="flex items-center gap-2">
                                        <span>{item.crypto?.name}</span>
                                        <Badge
                                          variant="outline"
                                          className="font-mono"
                                        >
                                          {item.crypto?.symbol}
                                        </Badge>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {item.holding.balance.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {formatCurrency(
                                        item.holding.averagePurchasePrice || 0
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      {formatCurrency(item.value)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      <span
                                        className={
                                          item.pnl >= 0
                                            ? "text-green-600"
                                            : "text-red-500"
                                        }
                                      >
                                        {item.pnl >= 0 ? "+" : "-"}
                                        {formatCurrency(Math.abs(item.pnl))}
                                      </span>
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        ({item.pnlPct.toFixed(1)}%)
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/50 font-bold">
                                  <TableCell colSpan={4}>Total</TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(totalCryptoValue)}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TabsContent>

                  {/* Collections Tab */}
                  <TabsContent value="collections" asChild>
                    <motion.div
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                              <CardTitle>Collections</CardTitle>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                Total Value
                              </p>
                              <div className="text-lg font-semibold">
                                <AnimatedNumber
                                  value={
                                    playerInventory?.reduce(
                                      (sum, item) => sum + item.totalPrice,
                                      0
                                    ) || 0
                                  }
                                  compact={false}
                                  isCents={true}
                                />
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {!playerInventory || playerInventory.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                              No marketplace items owned yet
                            </p>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {playerInventory.map((item) => (
                                <div
                                  key={item._id}
                                  className="overflow-hidden rounded-lg border"
                                >
                                  {/* Image */}
                                  <div className="relative h-32 w-full bg-muted">
                                    {item.productImage &&
                                    item.productImage.trim() ? (
                                      <img
                                        src={item.productImage}
                                        alt={item.productName}
                                        className="h-full w-full object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display =
                                            "none";
                                        }}
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center bg-muted">
                                        <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Info */}
                                  <div className="p-3">
                                    <p className="truncate text-sm font-medium">
                                      {item.productName}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {item.companyName}
                                    </p>
                                    <div className="mt-3 flex items-center justify-between">
                                      <div>
                                        <p className="text-xs text-muted-foreground">
                                          Qty
                                        </p>
                                        <p className="text-sm font-semibold">
                                          {item.quantity}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-xs text-muted-foreground">
                                          Total
                                        </p>
                                        <p className="text-sm font-semibold">
                                          {formatCurrency(item.totalPrice)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
