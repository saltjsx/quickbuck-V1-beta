import { query } from "./_generated/server";
import { v } from "convex/values";
import { calculateNetWorth } from "./players";

/**
 * Leaderboard query functions for top players and companies
 *
 * Net worth calculation includes:
 * - Player cash balance
 * - Stock holdings value
 * - Crypto holdings value
 * - Company equity (balance + market cap for public companies)
 */

// Top 5 players by balance
export const getTopPlayersByBalance = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { limit = 5 } = args;
    const players = await ctx.db.query("players").collect();

    // Sort by balance descending and take top N
    const sorted = players
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    // Enrich with user info
    const enriched = await Promise.all(
      sorted.map(async (player) => {
        const user = await ctx.db.get(player.userId);
        return {
          ...player,
          userName: user?.name || "Anonymous",
          userEmail: user?.email,
          userImage: user?.image,
        };
      })
    );

    return enriched;
  },
});

// Top 5 players by net worth
export const getTopPlayersByNetWorth = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { limit = 5 } = args;
    const players = await ctx.db.query("players").collect();

    // Calculate net worth for all players (including company equity)
    const playersWithNetWorth = await Promise.all(
      players.map(async (player) => {
        const netWorth = await calculateNetWorth(ctx, player._id);
        return { ...player, netWorth };
      })
    );

    // Sort by net worth descending and take top N
    const sorted = playersWithNetWorth
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, limit);

    // Enrich with user info
    const enriched = await Promise.all(
      sorted.map(async (player) => {
        const user = await ctx.db.get(player.userId);
        return {
          ...player,
          userName: user?.name || "Anonymous",
          userEmail: user?.email,
          userImage: user?.image,
        };
      })
    );

    return enriched;
  },
});

// Top 5 companies by market cap (public companies only)
export const getTopCompaniesByMarketCap = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { limit = 5 } = args;
    const companies = await ctx.db.query("companies").collect();

    // Filter public companies, sort by balance descending and take top N
    // Note: Market cap system removed - companies now ranked by balance
    const sorted = companies
      .filter((c) => c.isPublic)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    // Enrich with owner info
    const enriched = await Promise.all(
      sorted.map(async (company) => {
        const owner = await ctx.db.get(company.ownerId);
        const ownerUser = owner ? await ctx.db.get(owner.userId) : null;
        return {
          ...company,
          ownerName: ownerUser?.name || "Anonymous",
          ownerImage: ownerUser?.image,
        };
      })
    );

    return enriched;
  },
});

// Top 5 companies by cash balance
export const getTopCompaniesByBalance = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { limit = 5 } = args;
    const companies = await ctx.db.query("companies").collect();

    // Sort by balance descending and take top N
    const sorted = companies
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    // Enrich with owner info
    const enriched = await Promise.all(
      sorted.map(async (company) => {
        const owner = await ctx.db.get(company.ownerId);
        const ownerUser = owner ? await ctx.db.get(owner.userId) : null;
        return {
          ...company,
          ownerName: ownerUser?.name || "Anonymous",
          ownerImage: ownerUser?.image,
        };
      })
    );

    return enriched;
  },
});

// All players sorted by net worth (with pagination)
export const getAllPlayersSorted = query({
  args: {
    sortBy: v.optional(v.union(v.literal("netWorth"), v.literal("balance"))),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sortBy = "netWorth", limit = 100000, offset = 0 } = args;
    // No hard cap - allow unlimited listings
    const safeLimit = limit;

    let players;

    if (sortBy === "balance") {
      // Use index for efficient sorting by balance
      players = await ctx.db
        .query("players")
        .withIndex("by_balance")
        .order("desc")
        .take(offset + safeLimit);
    } else {
      // Use index for efficient sorting by netWorth
      players = await ctx.db
        .query("players")
        .withIndex("by_netWorth")
        .order("desc")
        .take(offset + safeLimit);
    }

    // Apply pagination after fetch
    const paginated = players.slice(offset, offset + safeLimit);

    // Enrich with user info - only return needed fields
    const enriched = await Promise.all(
      paginated.map(async (player, index) => {
        const user = await ctx.db.get(player.userId);
        return {
          _id: player._id,
          balance: player.balance,
          netWorth: player.netWorth,
          userName: user?.name || "Anonymous",
          userImage: user?.image,
          rank: offset + index + 1,
        };
      })
    );

    return {
      players: enriched,
      total: players.length,
      offset,
      limit: safeLimit,
    };
  },
});

// All companies sorted by market cap (with pagination)
export const getAllCompaniesSorted = query({
  args: {
    sortBy: v.optional(v.union(v.literal("marketCap"), v.literal("balance"))),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { sortBy = "marketCap", limit = 100000, offset = 0 } = args;
    const safeLimit = limit; // No hard cap - allow unlimited listings

    // Use index for efficient sorting
    let companies;
    if (sortBy === "balance") {
      companies = await ctx.db.query("companies").take(offset + safeLimit);
      companies.sort((a, b) => b.balance - a.balance);
    } else {
      // Use marketCap index
      companies = await ctx.db
        .query("companies")
        .withIndex("by_marketCap")
        .order("desc")
        .take(offset + safeLimit);
    }

    // Apply pagination
    const paginated = companies.slice(offset, offset + safeLimit);

    // Enrich with owner info - only return needed fields
    const enriched = await Promise.all(
      paginated.map(async (company, index) => {
        const owner = await ctx.db.get(company.ownerId);
        const ownerUser = owner ? await ctx.db.get(owner.userId) : null;
        return {
          _id: company._id,
          name: company.name,
          logo: company.logo,
          balance: company.balance,
          isPublic: company.isPublic,
          ownerName: ownerUser?.name || "Anonymous",
          ownerImage: ownerUser?.image,
          rank: offset + index + 1,
        };
      })
    );

    return {
      companies: enriched,
      total: companies.length,
      offset,
      limit: safeLimit,
    };
  },
});

// All products sorted by revenue (with pagination)
export const getAllProductsSorted = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 100000, offset = 0 } = args;

    // Use index for efficient sorting by totalRevenue
    const products = await ctx.db
      .query("products")
      .withIndex("by_totalRevenue")
      .order("desc")
      .collect();

    // Apply pagination after fetch
    const paginated = products.slice(offset, offset + limit);

    // Enrich with company info - only return needed fields
    const enriched = await Promise.all(
      paginated.map(async (product, index) => {
        const company = await ctx.db.get(product.companyId);
        return {
          _id: product._id,
          name: product.name,
          image: product.image,
          price: product.price,
          totalRevenue: product.totalRevenue,
          totalSold: product.totalSold,
          companyName: company?.name || "Unknown",
          companyLogo: company?.logo,
          rank: offset + index + 1,
        };
      })
    );

    return {
      products: enriched,
      total: products.length,
      offset,
      limit,
    };
  },
});

// Search players by name
export const searchPlayers = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { query: searchQuery, limit = 20 } = args;
    const users = await ctx.db.query("users").collect();
    const matchingUsers = users.filter((u) =>
      (u.name || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Get players for matching users
    const results = await Promise.all(
      matchingUsers.slice(0, limit).map(async (user) => {
        const players = await ctx.db.query("players").collect();
        const player = players.find((p) => p.userId === user._id);

        if (!player) return null;

        // Calculate net worth including company equity
        const netWorth = await calculateNetWorth(ctx, player._id);

        return {
          ...player,
          netWorth,
          userName: user.name || "Anonymous",
        };
      })
    );

    return results.filter(Boolean);
  },
});

// Search companies by name or ticker
export const searchCompanies = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { query: searchQuery, limit = 20 } = args;
    const companies = await ctx.db.query("companies").collect();

    const matchingCompanies = companies
      .filter((c) => {
        const nameMatch = c.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const tickerMatch = false; // Ticker system removed
        return nameMatch || tickerMatch;
      })
      .slice(0, limit);

    // Enrich with owner info
    const enriched = await Promise.all(
      matchingCompanies.map(async (company) => {
        const owner = await ctx.db.get(company.ownerId);
        const ownerUser = owner ? await ctx.db.get(owner.userId) : null;
        return {
          ...company,
          ownerName: ownerUser?.name || "Anonymous",
          ownerImage: ownerUser?.image,
        };
      })
    );

    return enriched;
  },
});

// Search products by name
export const searchProducts = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { query: searchQuery, limit = 20 } = args;
    const products = await ctx.db.query("products").collect();

    const matchingProducts = products
      .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, limit);

    // Enrich with company info
    const enriched = await Promise.all(
      matchingProducts.map(async (product) => {
        const company = await ctx.db.get(product.companyId);
        return {
          ...product,
          companyName: company?.name || "Unknown",
          companyLogo: company?.logo,
        };
      })
    );

    return enriched;
  },
});
