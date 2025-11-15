import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";

// Helper function to calculate net worth (includes company equity)
// Exported so it can be reused in other modules like leaderboard.ts
export async function calculateNetWorth(ctx: any, playerId: Id<"players">) {
  const player = await ctx.db.get(playerId);
  if (!player) return 0;

  let netWorth = player.balance;

  // Add stock holdings value
  const stockHoldings = await ctx.db
    .query("playerStockPortfolios")
    .withIndex("by_playerId", (q: any) => q.eq("playerId", playerId))
    .collect();

  for (const holding of stockHoldings) {
    const stock = await ctx.db.get(holding.stockId);
    if (stock) {
      netWorth += holding.shares * stock.currentPrice;
    }
  }

  // Add cryptocurrency holdings value
  const cryptoHoldings = await ctx.db
    .query("playerCryptoWallets")
    .withIndex("by_playerId", (q: any) => q.eq("playerId", playerId))
    .collect();

  for (const holding of cryptoHoldings) {
    const crypto = await ctx.db.get(holding.cryptoId);
    if (crypto) {
      netWorth += holding.balance * crypto.currentPrice;
    }
  }

  // Add company equity (owned companies)
  const companies = await ctx.db
    .query("companies")
    .withIndex("by_ownerId", (q: any) => q.eq("ownerId", playerId))
    .collect();

  // Fetch all stocks once to avoid multiple queries
  const allStocks = await ctx.db.query("stocks").collect();
  const stocksByCompanyId = new Map<Id<"companies">, Doc<"stocks">>(
    allStocks
      .filter((s: Doc<"stocks">) => s.companyId !== undefined)
      .map((s: Doc<"stocks">) => [s.companyId!, s])
  );

  for (const company of companies) {
    if (company.isPublic) {
      // For public companies, use market cap from stock's current price
      const stock = stocksByCompanyId.get(company._id);
      
      if (stock && stock.currentPrice) {
        // Market cap = current price * outstanding shares
        const marketCap = stock.currentPrice * (stock.outstandingShares ?? 1000000);
        netWorth += marketCap;
      } else if (company.marketCap) {
        // Fallback to stored market cap if stock not found
        netWorth += company.marketCap;
      }
    } else {
      // For private companies, use company balance as equity
      netWorth += company.balance;
    }
  }

  // LOAN IMPACT: Subtract unpaid loans from net worth
  // This reflects the player's true financial position including debt obligations
  const activeLoans = await ctx.db
    .query("loans")
    .withIndex("by_playerId", (q: any) => q.eq("playerId", playerId))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .collect();

  for (const loan of activeLoans) {
    netWorth -= loan.remainingBalance;
  }

  return netWorth;
}

// Mutation: Create a new player
export const createPlayer = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const playerId = await ctx.db.insert("players", {
      userId: args.userId,
      balance: 1000000, // Start with $10,000 (in cents)
      netWorth: 1000000,
      role: "normal", // Default role
      createdAt: now,
      updatedAt: now,
    });

    return playerId;
  },
});

// Mutation: Get or create player (auto-initialize on first access)
export const getOrCreatePlayer = mutation({
  handler: async (ctx) => {
    // Get the authenticated user's identity
    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Find or create the user record
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    let userId: Id<"users">;
    
    if (!user) {
      // DUPLICATE EMAIL FIX: Check if email already exists before creating new user
      if (identity.email) {
        const existingEmailUser = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", identity.email))
          .first();
        
        if (existingEmailUser) {
          // Email exists with different token - prevent duplicate signup
          throw new Error("An account with this email already exists. Please sign in with your existing account.");
        }
      }

      // Create new user if doesn't exist
      userId = await ctx.db.insert("users", {
        name: identity.name ?? "Anonymous",
        email: identity.email ?? "",
        tokenIdentifier: identity.subject,
      });
    } else {
      userId = user._id;
    }

    // Check if player exists for this user
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existingPlayer) {
      return existingPlayer;
    }

    // DUPLICATE EMAIL FIX: Double-check no player exists with this email
    // This prevents edge case where user signs up with same email but different auth method
    if (identity.email) {
      const userWithSameEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email))
        .first();
      
      if (userWithSameEmail && userWithSameEmail._id !== userId) {
        const existingPlayerForEmail = await ctx.db
          .query("players")
          .withIndex("by_userId", (q) => q.eq("userId", userWithSameEmail._id))
          .unique();
        
        if (existingPlayerForEmail) {
          throw new Error("A player account with this email already exists. Please sign in with your existing account.");
        }
      }
    }

    // Create new player with starting balance of $10,000
    const now = Date.now();
    const playerId = await ctx.db.insert("players", {
      userId: userId,
      balance: 1000000, // $10,000 in cents
      netWorth: 1000000,
      role: "normal", // Default role
      createdAt: now,
      updatedAt: now,
    });

    const player = await ctx.db.get(playerId);
    return player;
  },
});

// Mutation: Update player balance
export const updatePlayerBalance = mutation({
  args: {
    playerId: v.id("players"),
    amount: v.number(), // in cents, can be negative
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const newBalance = player.balance + args.amount;
    
    await ctx.db.patch(args.playerId, {
      balance: newBalance,
      updatedAt: Date.now(),
    });

    return newBalance;
  },
});

// Query: Get player
export const getPlayer = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return null;

    // Calculate current net worth on the fly (including company equity)
    const netWorth = await calculateNetWorth(ctx, args.playerId);
    
    // Return player with calculated net worth
    return { ...player, netWorth };
  },
});

// Query: Get player by user ID
export const getPlayerByUserId = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

// Query: Get player balance
export const getPlayerBalance = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    return player?.balance ?? 0;
  },
});

// Query: Get player net worth (calculated from all assets)
export const getPlayerNetWorth = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    return await calculateNetWorth(ctx, args.playerId);
  },
});

// Query: Get all players sorted by field
export const getAllPlayers = query({
  args: {
    sortBy: v.union(v.literal("netWorth"), v.literal("balance")),
  },
  handler: async (ctx, args) => {
    const players = await ctx.db.query("players").collect();
    
    if (args.sortBy === "balance") {
      return players.sort((a, b) => b.balance - a.balance);
    }
    
    // For netWorth, we need to calculate it for each player
    const playersWithNetWorth = await Promise.all(
      players.map(async (player) => {
        const netWorth = await calculateNetWorth(ctx, player._id);
        return { ...player, netWorth };
      })
    );
    
    return playersWithNetWorth.sort((a, b) => b.netWorth - a.netWorth);
  },
});

// Query: Get top players
export const getTopPlayers = query({
  args: {
    limit: v.number(),
    sortBy: v.union(v.literal("netWorth"), v.literal("balance")),
  },
  handler: async (ctx, args) => {
    const players = await ctx.db.query("players").collect();
    
    if (args.sortBy === "balance") {
      const sorted = players.sort((a, b) => b.balance - a.balance);
      return sorted.slice(0, args.limit);
    }
    
    const playersWithNetWorth = await Promise.all(
      players.map(async (player) => {
        const netWorth = await calculateNetWorth(ctx, player._id);
        return { ...player, netWorth };
      })
    );
    
    return playersWithNetWorth.sort((a, b) => b.netWorth - a.netWorth).slice(0, args.limit);
  },
});
