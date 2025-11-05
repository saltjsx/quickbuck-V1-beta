import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { validateName, validateDescription, validateTicker, validateTags } from "./contentFilter";
import { canCreateContent } from "./moderation";

// Mutation: Create company
export const createCompany = mutation({
  args: {
    ownerId: v.id("players"),
    name: v.string(),
    description: v.optional(v.string()),
    logo: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    ticker: v.string(), // Now required
  },
  handler: async (ctx, args) => {
    // ROLE CHECK: Verify player can create companies
    const canCreate = await canCreateContent(ctx, args.ownerId);
    if (!canCreate) {
      throw new Error("Your account does not have permission to create companies");
    }

    // HARD LIMIT: Check if player has reached max companies (5)
    const playerCompanies = await ctx.db
      .query("companies")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
      .collect();
    
    if (playerCompanies.length >= 5) {
      throw new Error("You have reached the maximum limit of 5 companies. Delete an existing company to create a new one.");
    }

    // CONTENT FILTER: Validate company name and description
    const validatedName = validateName(args.name, "Company name");
    const validatedDescription = validateDescription(args.description, "Company description");
    const validatedTags = validateTags(args.tags);
    const validatedTicker = validateTicker(args.ticker);

    // Validate ticker format
    if (!validatedTicker) {
      throw new Error("Invalid ticker format");
    }

    const now = Date.now();
    
    const companyId = await ctx.db.insert("companies", {
      ownerId: args.ownerId,
      name: validatedName,
      description: validatedDescription,
      logo: args.logo,
      tags: validatedTags,
      ticker: validatedTicker, // Store the ticker
      balance: 0,
      isPublic: false,
      reputationScore: 0.5, // Start with neutral reputation
      flaggedStatus: false,
      createdAt: now,
      updatedAt: now,
    });

    return companyId;
  },
});

// Mutation: Update company info
export const updateCompanyInfo = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    logo: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const updates: any = {
      updatedAt: Date.now(),
    };

    // CONTENT FILTER: Validate name and description if provided
    if (args.name !== undefined) {
      updates.name = validateName(args.name, "Company name");
    }
    if (args.description !== undefined) {
      updates.description = validateDescription(args.description, "Company description");
    }
    if (args.logo !== undefined) updates.logo = args.logo;
    if (args.tags !== undefined) {
      updates.tags = validateTags(args.tags);
    }

    await ctx.db.patch(args.companyId, updates);

    return await ctx.db.get(args.companyId);
  },
});

// Mutation: Update company balance
export const updateCompanyBalance = mutation({
  args: {
    companyId: v.id("companies"),
    amount: v.number(), // in cents, can be negative
  },
  handler: async (ctx, args) => {
    // EXPLOIT FIX: Validate amount is safe integer
    if (!Number.isSafeInteger(args.amount)) {
      throw new Error("Amount is not a safe integer");
    }

    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const newBalance = company.balance + args.amount;

    // EXPLOIT FIX: Validate new balance is safe and non-negative
    if (!Number.isSafeInteger(newBalance)) {
      throw new Error("Balance calculation overflow");
    }

    if (newBalance < 0) {
      throw new Error("Insufficient company balance");
    }

    await ctx.db.patch(args.companyId, {
      balance: newBalance,
      updatedAt: Date.now(),
    });

    return newBalance;
  },
});

// Note: Company IPO system has been removed
// Stock market is now independent of player-owned companies
// See stocks.ts for the standalone stock market system

// Mutation: Make company public (IPO)
export const makeCompanyPublic = mutation({
  args: {
    companyId: v.id("companies"),
    ownerId: v.id("players"),
    ticker: v.string(), // User-chosen ticker for the stock
    sector: v.string(), // User-chosen sector
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    // Verify ownership
    if (company.ownerId !== args.ownerId) {
      throw new Error("Only the company owner can make the company public");
    }

    // Check if already public
    if (company.isPublic) {
      throw new Error("Company is already public");
    }

    // Validate sector
    const validSectors = ["tech", "energy", "finance", "healthcare", "consumer"];
    if (!validSectors.includes(args.sector.toLowerCase())) {
      throw new Error("Invalid sector. Must be one of: tech, energy, finance, healthcare, consumer");
    }

    // Company must have some balance
    if (company.balance < 10000) {
      throw new Error("Company must have at least $100 in balance to go public");
    }

    // Validate and clean the ticker
    const validatedTicker = validateTicker(args.ticker);
    if (!validatedTicker) {
      throw new Error("Invalid ticker format");
    }

    // Check for ticker uniqueness across all stocks
    const existingStocks = await ctx.db.query("stocks").collect();
    const tickerExists = existingStocks.some(
      (stock) => stock.symbol && stock.symbol.toUpperCase() === validatedTicker.toUpperCase()
    );

    if (tickerExists) {
      throw new Error(`Ticker "${validatedTicker}" is already in use. Please choose a different ticker.`);
    }

    // Calculate valuation: 5x company balance
    const valuation = company.balance * 5; // in cents
    
    // Create stock for this company
    // Assume 1,000,000 outstanding shares initially
    const outstandingShares = 1000000;
    const pricePerShare = Math.floor(valuation / outstandingShares); // in cents
    
    const stockId = await ctx.db.insert("stocks", {
      companyId: args.companyId,
      name: company.name,
      symbol: validatedTicker,
      outstandingShares,
      currentPrice: pricePerShare,
      marketCap: valuation,
      liquidity: Math.max(50000, valuation / 100), // Liquidity scales with market cap
      sector: args.sector.toLowerCase(),
      fairValue: pricePerShare,
      lastPriceChange: 0,
      volatility: 0.03,
      trendMomentum: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    });

    // Update company to be public
    await ctx.db.patch(args.companyId, {
      isPublic: true,
      sector: args.sector.toLowerCase(),
      marketCap: valuation,
      updatedAt: Date.now(),
    });

    return {
      companyId: args.companyId,
      stockId,
      symbol: validatedTicker,
      valuation: valuation / 100, // in dollars for display
      pricePerShare: pricePerShare / 100, // in dollars for display
      outstandingShares,
      message: `${company.name} went public with ticker "${validatedTicker}"! Valuation: $${(valuation / 100).toFixed(2)}, Share Price: $${(pricePerShare / 100).toFixed(2)}`,
    };
  },
});

// Query: Get company
export const getCompany = query({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.companyId);
  },
});

// Query: Get player's companies
export const getPlayerCompanies = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companies")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.playerId))
      .collect();
  },
});

// Query: Get all public companies
export const getAllPublicCompanies = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("companies")
      .withIndex("by_isPublic", (q) => q.eq("isPublic", true))
      .collect();
  },
});

// Query: Get all companies (public and private)
export const getAllCompanies = query({
  handler: async (ctx) => {
    return await ctx.db.query("companies").collect();
  },
});

// Note: Ticker system removed - see stocks.ts for independent stock market

// Note: Company ownership is now 100% to owner
// Company shares system removed - see stocks.ts for independent stock market
export const getPlayerCompanyOwnership = query({
  args: {
    playerId: v.id("players"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return 0;

    // Player owns 100% if they're the owner
    if (company.ownerId === args.playerId) {
      return 100;
    }

    return 0;
  },
});

// Note: Market cap system removed - companies now ranked by balance only
// See stocks.ts for independent stock market with market caps

// Query: Get top companies by balance
export const getTopCompaniesByBalance = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const companies = await ctx.db.query("companies").collect();
    return companies.sort((a, b) => b.balance - a.balance).slice(0, args.limit);
  },
});

// Mutation: Delete company
export const deleteCompany = mutation({
  args: {
    companyId: v.id("companies"),
    ownerId: v.id("players"), // For validation
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    // Verify ownership
    if (company.ownerId !== args.ownerId) {
      throw new Error("Only the company owner can delete the company");
    }

    // Note: Stock system is now independent of companies

    // Transfer company balance to owner
    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("Owner not found");
    }

    const transferAmount = company.balance;
    if (transferAmount > 0) {
      await ctx.db.patch(args.ownerId, {
        balance: owner.balance + transferAmount,
        updatedAt: Date.now(),
      });

      // Create transaction record
      await ctx.db.insert("transactions", {
        fromAccountId: args.companyId,
        fromAccountType: "company" as const,
        toAccountId: args.ownerId,
        toAccountType: "player" as const,
        amount: transferAmount,
        assetType: "cash" as const,
        description: `Company ${company.name} deleted - balance transferred to owner`,
        createdAt: Date.now(),
      });
    }

    // Archive all products
    const products = await ctx.db
      .query("products")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    
    for (const product of products) {
      await ctx.db.patch(product._id, {
        isActive: false,
        isArchived: true,
        updatedAt: Date.now(),
      });
    }

    // Actually delete the company
    await ctx.db.delete(args.companyId);

    return {
      companyId: args.companyId,
      transferredAmount: transferAmount,
      message: `Company deleted successfully. $${(transferAmount / 100).toFixed(2)} transferred to owner.`,
    };
  },
});
