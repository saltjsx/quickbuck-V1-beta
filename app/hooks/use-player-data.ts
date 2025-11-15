"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useEffect } from "react";

export function usePlayerData(clerkUserId: string | null) {
  // Mutations for user and player creation
  const upsertUser = useMutation(api.users.upsertUser);
  const getOrCreatePlayer = useMutation(api.players.getOrCreatePlayer);

  // First, get the Convex user ID by looking up the token identifier
  const user = useQuery(
    api.users.findUserByToken,
    clerkUserId ? { tokenIdentifier: clerkUserId } : "skip"
  );

  // Get player by Convex user ID
  const player = useQuery(
    api.players.getPlayerByUserId,
    user ? { userId: user._id as Id<"users"> } : "skip"
  );

  // Ensure user exists, then ensure player exists
  useEffect(() => {
    if (clerkUserId) {
      // First, ensure the user exists in the database
      upsertUser()
        .then(() => {
          // After user is upserted, ensure player exists
          return getOrCreatePlayer();
        })
        .catch((err) => {
          console.error("Failed to initialize user/player:", err);
        });
    }
  }, [clerkUserId, upsertUser, getOrCreatePlayer]);

  // Get player balance
  const balance = useQuery(
    api.players.getPlayerBalance,
    player ? { playerId: player._id } : "skip"
  );

  // Get player net worth
  const netWorth = useQuery(
    api.players.getPlayerNetWorth,
    player ? { playerId: player._id } : "skip"
  );

  // Get crypto holdings for net worth breakdown
  const cryptoHoldings = useQuery(
    api.portfolio.getUserCryptoHoldings,
    player ? { userId: player._id } : "skip"
  );

  // Get stock holdings for net worth breakdown
  const stockHoldings = useQuery(
    api.portfolio.getUserStockHoldings,
    player ? { userId: player._id } : "skip"
  );

  // Get player's companies for net worth breakdown
  const playerCompanies = useQuery(
    api.companies.getPlayerCompanies,
    player ? { playerId: player._id } : "skip"
  );

  // Get all cryptos to calculate values
  const allCryptos = useQuery(api.crypto.getAllCryptos, {});

  // Get recent transactions
  const transactions = useQuery(
    api.transactions.getPlayerTransactionHistory,
    player ? { playerId: player._id } : "skip"
  );

  // Calculate crypto value
  const cryptoValue =
    cryptoHoldings && allCryptos
      ? cryptoHoldings.reduce((sum: number, holding: any) => {
          const crypto = allCryptos.find(
            (c: any) => c._id === holding.cryptoId
          );
          return (
            sum +
            (crypto ? Math.floor(holding.balance * crypto.currentPrice) : 0)
          );
        }, 0)
      : 0;

  // Calculate stock value
  const stocksValue = stockHoldings
    ? stockHoldings.reduce((sum: number, holding: any) => {
        return sum + (holding.currentValue || 0);
      }, 0)
    : 0;

  // Calculate company equity
  // For public companies: use market cap (from stock current price)
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

  return {
    player,
    balance: balance ?? 0,
    netWorth: netWorth ?? 0,
    stocksValue,
    cryptoValue,
    companyEquity,
    transactions: transactions ?? [],
    isLoading: player === undefined,
  };
}
