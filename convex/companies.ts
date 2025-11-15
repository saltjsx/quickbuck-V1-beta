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
    // Require authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be logged in to make a company public");
    }

    // Get user and verify they exist
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) {
      throw new Error("User not found");
    }

    // Get player and verify they exist
    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) {
      throw new Error("Player not found");
    }

    // Verify the player making the request matches the ownerId parameter
    if (currentPlayer._id !== args.ownerId) {
      throw new Error("You can only make your own companies public");
    }

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
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.playerId))
      .collect();
    
    // For public companies, calculate market cap from stock's current price
    // This ensures the market cap is always synced with the actual stock market
    // Fetch all stocks once to avoid multiple queries
    const allStocks = await ctx.db.query("stocks").collect();
    const stocksByCompanyId = new Map(
      allStocks
        .filter((s) => s.companyId !== undefined)
        .map((s) => [s.companyId!, s])
    );
    
    const enrichedCompanies = companies.map((company) => {
      if (company.isPublic) {
        // Find the stock linked to this company
        const stock = stocksByCompanyId.get(company._id);
        
        if (stock && stock.currentPrice) {
          // Calculate market cap from current stock price
          const currentMarketCap = stock.currentPrice * (stock.outstandingShares ?? 1000000);
          return {
            ...company,
            marketCap: currentMarketCap,
          };
        }
      }
      return company;
    });
    
    return enrichedCompanies;
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

    // CASCADE DELETE: Delete all company-related records
    
    // 1. Delete all products for this company
    const products = await ctx.db
      .query("products")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    
    for (const product of products) {
      // Delete cart items that reference this product
      const cartItems = await ctx.db
        .query("cartItems")
        .withIndex("by_productId", (q) => q.eq("productId", product._id))
        .collect();
      
      for (const cartItem of cartItems) {
        await ctx.db.delete(cartItem._id);
      }
      
      // Delete the product
      await ctx.db.delete(product._id);
    }

    // 2. Delete marketplace listings for this company
    const listings = await ctx.db
      .query("marketplaceListings")
      .withIndex("by_sellerCompanyId", (q) => q.eq("sellerCompanyId", args.companyId))
      .collect();

    for (const listing of listings) {
      await ctx.db.delete(listing._id);
    }

    // 3. Delete company sales offers
    const companySales = await ctx.db
      .query("companySales")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    for (const sale of companySales) {
      await ctx.db.delete(sale._id);
    }

    // 4. Delete company shares
    const companyShares = await ctx.db
      .query("companyShares")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    for (const share of companyShares) {
      await ctx.db.delete(share._id);
    }

    // Note: We keep marketplaceSales and transactions for historical records

    // Finally, delete the company
    await ctx.db.delete(args.companyId);

    return {
      companyId: args.companyId,
      transferredAmount: transferAmount,
      message: `Company deleted successfully. $${(transferAmount / 100).toFixed(2)} transferred to owner.`,
    };
  },
});

// Employee System

// Define available employees with their bonuses
const AVAILABLE_EMPLOYEES = [
  {
    id: "employee_stock_5",
    name: "Junior Stock Manager",
    bonusType: "stock_boost_5" as const,
    bonusPercentage: 5,
    upfrontCost: 5000000, // $50,000 in cents
    tickCostPercentage: 2,
    description: "Increases business stock by 5%",
  },
  {
    id: "employee_stock_10",
    name: "Senior Stock Manager",
    bonusType: "stock_boost_10" as const,
    bonusPercentage: 10,
    upfrontCost: 10000000, // $100,000 in cents
    tickCostPercentage: 5,
    description: "Increases business stock by 10%",
  },
];

// Query: Get available employees for a company
export const getAvailableEmployees = query({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const hiredEmployeeIds = (company.employees || []).map((e) => e.id);

    // Return employees that haven't been hired yet
    return AVAILABLE_EMPLOYEES.filter(
      (employee) => !hiredEmployeeIds.includes(employee.id)
    );
  },
});

// Query: Get hired employees for a company
export const getHiredEmployees = query({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    return company.employees || [];
  },
});

// Mutation: Hire an employee
export const hireEmployee = mutation({
  args: {
    companyId: v.id("companies"),
    employeeId: v.string(),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    // Find the employee template
    const employeeTemplate = AVAILABLE_EMPLOYEES.find(
      (e) => e.id === args.employeeId
    );
    if (!employeeTemplate) {
      throw new Error("Invalid employee");
    }

    // Check if already hired
    const existingEmployees = company.employees || [];
    if (existingEmployees.some((e) => e.id === args.employeeId)) {
      throw new Error("This employee is already hired");
    }

    // Check if player can afford upfront cost
    const owner = await ctx.db.get(company.ownerId);
    if (!owner) {
      throw new Error("Company owner not found");
    }

    if (owner.balance < employeeTemplate.upfrontCost) {
      throw new Error(
        `Insufficient funds. Need $${(employeeTemplate.upfrontCost / 100).toFixed(2)}`
      );
    }

    // Deduct upfront cost from player
    await ctx.db.patch(company.ownerId, {
      balance: owner.balance - employeeTemplate.upfrontCost,
      updatedAt: Date.now(),
    });

    // Add employee to company
    const newEmployee = {
      id: employeeTemplate.id,
      name: employeeTemplate.name,
      bonusType: employeeTemplate.bonusType,
      bonusPercentage: employeeTemplate.bonusPercentage,
      upfrontCost: employeeTemplate.upfrontCost,
      tickCostPercentage: employeeTemplate.tickCostPercentage,
      hiredAt: Date.now(),
    };

    await ctx.db.patch(args.companyId, {
      employees: [...existingEmployees, newEmployee],
      updatedAt: Date.now(),
    });

    // Record transaction
    await ctx.db.insert("transactions", {
      fromAccountId: company.ownerId,
      fromAccountType: "player",
      toAccountId: args.companyId,
      toAccountType: "company",
      amount: employeeTemplate.upfrontCost,
      assetType: "cash",
      description: `Hired ${employeeTemplate.name} for company`,
      createdAt: Date.now(),
    });

    return {
      success: true,
      employee: newEmployee,
    };
  },
});

// Mutation: Fire an employee
export const fireEmployee = mutation({
  args: {
    companyId: v.id("companies"),
    employeeId: v.string(),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const existingEmployees = company.employees || [];
    const employeeToFire = existingEmployees.find(
      (e) => e.id === args.employeeId
    );

    if (!employeeToFire) {
      throw new Error("Employee not found");
    }

    // Remove employee from company
    const updatedEmployees = existingEmployees.filter(
      (e) => e.id !== args.employeeId
    );

    await ctx.db.patch(args.companyId, {
      employees: updatedEmployees,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      firedEmployee: employeeToFire,
    };
  },
});

// Query: Calculate total employee bonus for a company
export const getCompanyEmployeeBonus = query({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      return { totalStockBoost: 0, totalTickCostPercentage: 0 };
    }

    const employees = company.employees || [];
    
    let totalStockBoost = 0;
    let totalTickCostPercentage = 0;

    for (const employee of employees) {
      if (employee.bonusType.startsWith("stock_boost")) {
        totalStockBoost += employee.bonusPercentage;
      }
      totalTickCostPercentage += employee.tickCostPercentage;
    }

    return {
      totalStockBoost,
      totalTickCostPercentage,
      employees,
    };
  },
});
