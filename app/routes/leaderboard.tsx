"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { useAuth } from "@clerk/react-router";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Skeleton } from "~/components/ui/skeleton";
import { formatCurrency, formatCompactCurrency } from "~/lib/game-utils";
import { UserAvatar } from "~/components/ui/user-avatar";
import { CompanyLogo } from "~/components/ui/company-logo";
import { PlayerNameWithTag } from "~/components/ui/player-name-with-tag";
import { Search, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import { getAuth } from "@clerk/react-router/ssr.server";
import { redirect } from "react-router";
import type { Route } from "./+types/leaderboard";
import { cn } from "~/lib/utils";
import { motion } from "motion/react";
import { AnimatedNumber } from "~/components/ui/animated-number";

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    throw redirect("/sign-in");
  }

  return {};
}

type SortConfig = {
  key: string;
  direction: "asc" | "desc";
};

export default function LeaderboardPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  const cardHoverVariants = {
    hover: {
      scale: 1.02,
      transition: {
        duration: 0.2,
        ease: "easeInOut",
      },
    },
  };
  const { userId: clerkUserId } = useAuth();
  const upsertUser = useMutation(api.users.upsertUser);

  const [searchQuery, setSearchQuery] = useState("");
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [playerSort, setPlayerSort] = useState<SortConfig>({
    key: "netWorth",
    direction: "desc",
  });
  const [companySort, setCompanySort] = useState<SortConfig>({
    key: "balance",
    direction: "desc",
  });
  const [productSort, setProductSort] = useState<SortConfig>({
    key: "totalRevenue",
    direction: "desc",
  });

  // Sync user data (including profile picture) when component mounts
  useEffect(() => {
    if (clerkUserId) {
      upsertUser().catch(console.error);
    }
  }, [clerkUserId, upsertUser]);

  // Fetch top 5 data
  const topPlayersByBalance = useQuery(api.leaderboard.getTopPlayersByBalance, {
    limit: 5,
  });
  const topPlayersByNetWorth = useQuery(
    api.leaderboard.getTopPlayersByNetWorth,
    { limit: 5 }
  );
  const topCompaniesByMarketCap = useQuery(
    api.leaderboard.getTopCompaniesByMarketCap,
    { limit: 5 }
  );
  const topCompaniesByBalance = useQuery(
    api.leaderboard.getTopCompaniesByBalance,
    { limit: 5 }
  );

  // Fetch all data
  const allPlayers = useQuery(api.leaderboard.getAllPlayersSorted, {
    sortBy: "netWorth",
    limit: 10000,
  });
  const allCompanies = useQuery(api.leaderboard.getAllCompaniesSorted, {
    sortBy: "balance",
    limit: 10000,
  });
  const allProducts = useQuery(api.leaderboard.getAllProductsSorted, {
    limit: 10000,
  });

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    if (!allPlayers?.players) return [];
    let filtered = allPlayers.players;
    if (playerSearchQuery) {
      filtered = filtered.filter((p) =>
        p.userName?.toLowerCase().includes(playerSearchQuery.toLowerCase())
      );
    }

    // Sort players
    return filtered.sort((a, b) => {
      let aVal: number | undefined;
      let bVal: number | undefined;

      switch (playerSort.key) {
        case "netWorth":
          aVal = a.netWorth;
          bVal = b.netWorth;
          break;
        case "balance":
          aVal = a.balance;
          bVal = b.balance;
          break;
        default:
          aVal = a.netWorth;
          bVal = b.netWorth;
      }

      if (playerSort.direction === "asc") {
        return (aVal || 0) - (bVal || 0);
      } else {
        return (bVal || 0) - (aVal || 0);
      }
    });
  }, [allPlayers, playerSearchQuery, playerSort]);

  // Filter and sort companies
  const filteredCompanies = useMemo(() => {
    if (!allCompanies?.companies) return [];
    let filtered = allCompanies.companies;
    if (companySearchQuery) {
      filtered = filtered.filter((c) =>
        c.name?.toLowerCase().includes(companySearchQuery.toLowerCase())
      );
    }

    // Sort companies
    return filtered.sort((a, b) => {
      let aVal: number | undefined;
      let bVal: number | undefined;

      switch (companySort.key) {
        case "balance":
          aVal = a.balance;
          bVal = b.balance;
          break;
        case "name":
          return companySort.direction === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        default:
          aVal = a.balance;
          bVal = b.balance;
      }

      if (companySort.direction === "asc") {
        return (aVal || 0) - (bVal || 0);
      } else {
        return (bVal || 0) - (aVal || 0);
      }
    });
  }, [allCompanies, companySearchQuery, companySort]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    if (!allProducts?.products) return [];
    let filtered = allProducts.products;
    if (productSearchQuery) {
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
          p.companyName
            ?.toLowerCase()
            .includes(productSearchQuery.toLowerCase())
      );
    }

    // Sort products
    return filtered.sort((a, b) => {
      let aVal: number | string | undefined;
      let bVal: number | string | undefined;

      switch (productSort.key) {
        case "totalRevenue":
          aVal = a.totalRevenue;
          bVal = b.totalRevenue;
          break;
        case "price":
          aVal = a.price;
          bVal = b.price;
          break;
        case "name":
          return productSort.direction === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        default:
          aVal = a.totalRevenue;
          bVal = b.totalRevenue;
      }

      if (productSort.direction === "asc") {
        return (aVal as number) - (bVal as number);
      } else {
        return (bVal as number) - (aVal as number);
      }
    });
  }, [allProducts, productSearchQuery, productSort]);

  const toggleSort = (key: string, currentSort: SortConfig): SortConfig => {
    if (currentSort.key === key) {
      return {
        key,
        direction: currentSort.direction === "asc" ? "desc" : "asc",
      };
    }
    return { key, direction: "desc" };
  };

  const SortableHeader = ({
    children,
    sortKey,
    currentSort,
    onSort,
  }: {
    children: React.ReactNode;
    sortKey: string;
    currentSort: SortConfig;
    onSort: (newSort: SortConfig) => void;
  }) => {
    const isActive = currentSort.key === sortKey;
    return (
      <TableHead
        onClick={() => onSort(toggleSort(sortKey, currentSort))}
        className="cursor-pointer hover:bg-muted/50 select-none"
      >
        <div className="flex items-center gap-1">
          {children}
          <ArrowUpDown
            className={cn(
              "h-4 w-4",
              isActive
                ? currentSort.direction === "asc"
                  ? "rotate-180"
                  : "rotate-0"
                : "opacity-0"
            )}
          />
        </div>
      </TableHead>
    );
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-[#FF934F] to-[#EF7176] text-white shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent dark:from-black/20 dark:via-black/10 dark:to-transparent" />
              <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-white/20 blur-3xl dark:bg-black/30" />
              <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-white/20 blur-3xl dark:bg-black/30" />
              <CardContent className="relative z-10 p-6 md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">
                      Leaderboard
                    </h1>
                    <p className="text-white/80 text-sm">
                      See how you stack up against other players and companies.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="rounded-lg bg-white/10 p-3 backdrop-blur-sm">
                      <p className="text-xs text-white/80">
                        Top Player Net Worth
                      </p>
                      <div className="text-xl font-bold">
                        <AnimatedNumber
                          value={topPlayersByNetWorth?.[0]?.netWorth ?? 0}
                          compact={true}
                          isCents={true}
                          className="text-white"
                        />
                      </div>
                    </div>
                    <div className="rounded-lg bg-white/10 p-3 backdrop-blur-sm">
                      <p className="text-xs text-white/80">
                        Top Company Balance
                      </p>
                      <div className="text-xl font-bold">
                        <AnimatedNumber
                          value={topCompaniesByMarketCap?.[0]?.balance ?? 0}
                          compact={true}
                          isCents={true}
                          className="text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Top 5 Sections */}
          <Tabs defaultValue="tops" className="w-full">
            <TabsList>
              <TabsTrigger value="tops">Top Players & Companies</TabsTrigger>
              <TabsTrigger value="players">All Players</TabsTrigger>
              <TabsTrigger value="companies">All Companies</TabsTrigger>
              <TabsTrigger value="products">All Products</TabsTrigger>
            </TabsList>

            <TabsContent value="tops" className="space-y-4">
              {/* Top 5 Cards Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Top 5 Players by Balance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Top 5 Players by Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!topPlayersByBalance ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-6 w-6 rounded-full" />
                              <Skeleton className="h-8 w-8 rounded-full" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-4 w-20" />
                          </div>
                        ))}
                      </div>
                    ) : topPlayersByBalance.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No players yet
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {topPlayersByBalance.map((player, index) => (
                          <motion.div
                            key={player._id}
                            className="flex items-center justify-between"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.01 }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {index + 1}
                              </span>
                              <UserAvatar
                                src={player.userImage}
                                alt={player.userName}
                                size="sm"
                              />
                              <PlayerNameWithTag
                                playerId={player._id}
                                playerName={player.userName}
                                className="text-sm"
                              />
                            </div>
                            <span className="text-sm font-semibold text-green-600">
                              <AnimatedNumber
                                value={player.balance}
                                compact={true}
                                isCents={true}
                              />
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Top 5 Players by Net Worth */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Top 5 Players by Net Worth
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!topPlayersByNetWorth ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-6 w-6 rounded-full" />
                              <Skeleton className="h-8 w-8 rounded-full" />
                              <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-4 w-20" />
                          </div>
                        ))}
                      </div>
                    ) : topPlayersByNetWorth.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No players yet
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {topPlayersByNetWorth.map((player, index) => (
                          <motion.div
                            key={player._id}
                            className="flex items-center justify-between"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.01 }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {index + 1}
                              </span>
                              <UserAvatar
                                src={player.userImage}
                                alt={player.userName}
                                size="sm"
                              />
                              <PlayerNameWithTag
                                playerId={player._id}
                                playerName={player.userName}
                                className="text-sm"
                              />
                            </div>
                            <span className="text-sm font-semibold text-blue-600">
                              <AnimatedNumber
                                value={player.netWorth}
                                compact={true}
                                isCents={true}
                              />
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Top 5 Companies by Market Cap */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Top 5 Public Companies by Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!topCompaniesByMarketCap ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-6 w-6 rounded-full" />
                              <Skeleton className="h-8 w-8 rounded-lg" />
                              <div className="space-y-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-16" />
                              </div>
                            </div>
                            <Skeleton className="h-4 w-20" />
                          </div>
                        ))}
                      </div>
                    ) : topCompaniesByMarketCap.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No public companies yet
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {topCompaniesByMarketCap.map((company, index) => (
                          <motion.div
                            key={company._id}
                            className="flex items-center justify-between"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.01 }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {index + 1}
                              </span>
                              <CompanyLogo
                                src={company.logo}
                                alt={company.name}
                                size="sm"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {company.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Owner: {company.ownerName}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-purple-600">
                              <AnimatedNumber
                                value={company.balance}
                                compact={true}
                                isCents={true}
                              />
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Top 5 Companies by Cash */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Top 5 Companies by Cash
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!topCompaniesByBalance ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-6 w-6 rounded-full" />
                              <Skeleton className="h-8 w-8 rounded-lg" />
                              <div className="space-y-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-16" />
                              </div>
                            </div>
                            <Skeleton className="h-4 w-20" />
                          </div>
                        ))}
                      </div>
                    ) : topCompaniesByBalance.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No companies yet
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {topCompaniesByBalance.map((company, index) => (
                          <motion.div
                            key={company._id}
                            className="flex items-center justify-between"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.01 }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {index + 1}
                              </span>
                              <CompanyLogo
                                src={company.logo}
                                alt={company.name}
                                size="sm"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {company.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Owner: {company.ownerName}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-green-600">
                              <AnimatedNumber
                                value={company.balance}
                                compact={true}
                                isCents={true}
                              />
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="players" className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>Player</TableHead>
                      <SortableHeader
                        sortKey="balance"
                        currentSort={playerSort}
                        onSort={setPlayerSort}
                      >
                        Balance
                      </SortableHeader>
                      <SortableHeader
                        sortKey="netWorth"
                        currentSort={playerSort}
                        onSort={setPlayerSort}
                      >
                        Net Worth
                      </SortableHeader>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!allPlayers ? (
                      <>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Skeleton className="h-4 w-8" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <Skeleton className="h-4 w-32" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-24" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-24" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : filteredPlayers.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground"
                        >
                          No players found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPlayers.map((player, index) => (
                        <TableRow
                          key={player._id}
                          className="transition-colors hover:bg-muted/50"
                        >
                          <TableCell className="font-medium">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserAvatar
                                src={player.userImage}
                                alt={player.userName}
                                size="sm"
                              />
                              <PlayerNameWithTag
                                playerId={player._id}
                                playerName={player.userName}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            <AnimatedNumber
                              value={player.balance}
                              compact={false}
                              isCents={true}
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold text-blue-600">
                            <AnimatedNumber
                              value={player.netWorth}
                              compact={false}
                              isCents={true}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="companies" className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search companies..."
                    value={companySearchQuery}
                    onChange={(e) => setCompanySearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Public</TableHead>
                      <SortableHeader
                        sortKey="balance"
                        currentSort={companySort}
                        onSort={setCompanySort}
                      >
                        Balance
                      </SortableHeader>
                      <TableHead>Owner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!allCompanies ? (
                      <>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Skeleton className="h-4 w-8" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-8 w-8 rounded-lg" />
                                <Skeleton className="h-4 w-32" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-16" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-24" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-24" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : filteredCompanies.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          No companies found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCompanies.map((company, index) => (
                        <TableRow
                          key={company._id}
                          className="transition-colors hover:bg-muted/50"
                        >
                          <TableCell className="font-medium">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CompanyLogo
                                src={company.logo}
                                alt={company.name}
                                size="sm"
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {company.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Owner: {company.ownerName}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {company.isPublic ? "Yes" : "No"}
                          </TableCell>
                          <TableCell className="text-right font-medium text-purple-600">
                            <AnimatedNumber
                              value={company.balance}
                              compact={false}
                              isCents={true}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {company.ownerName}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Company</TableHead>
                      <SortableHeader
                        sortKey="totalRevenue"
                        currentSort={productSort}
                        onSort={setProductSort}
                      >
                        Total Revenue
                      </SortableHeader>
                      <TableHead className="text-right">Sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!allProducts ? (
                      <>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Skeleton className="h-4 w-8" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-40" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-6 w-6 rounded-lg" />
                                <Skeleton className="h-4 w-32" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-24" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Skeleton className="h-4 w-16 ml-auto" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          No products found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product, index) => (
                        <TableRow
                          key={product._id}
                          className="transition-colors hover:bg-muted/50"
                        >
                          <TableCell className="font-medium">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {product.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                <AnimatedNumber
                                  value={product.price ?? 0}
                                  compact={false}
                                  isCents={true}
                                />
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CompanyLogo
                                src={product.companyLogo}
                                alt={product.companyName}
                                size="xs"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm">
                                  {product.companyName}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            <AnimatedNumber
                              value={product.totalRevenue}
                              compact={false}
                              isCents={true}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {product.totalSold || 0}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
