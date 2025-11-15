/**
 * STOCK MARKET ENGINE
 * 
 * A realistic stock market simulation system featuring:
 * - Multiple stocks across different sectors
 * - Non-linear price movements with realistic volatility
 * - Automated ticks every 5 minutes with OHLC data
 * - Instant price updates on player buy/sell actions
 * - Bid/ask spreads and slippage for large trades
 * - Sector correlations and market trends
 * - Simulated earnings events and news
 * - Fairness controls to prevent exploitation
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const SECTORS = ["tech", "energy", "finance", "healthcare", "consumer"] as const;
type Sector = typeof SECTORS[number];

// Base volatility ranges by sector (daily)
const SECTOR_BASE_VOLATILITY: Record<Sector, number> = {
  tech: 0.035,      // 3.5% daily
  energy: 0.045,    // 4.5% daily
  finance: 0.03,    // 3.0% daily
  healthcare: 0.04, // 4.0% daily
  consumer: 0.025,  // 2.5% daily
};

// Mean reversion speed (theta in Ornstein-Uhlenbeck)
const MEAN_REVERSION_SPEED = 0.01;

// Volatility clustering factor
const VOLATILITY_CLUSTERING_FACTOR = 1.3;
const VOLATILITY_CLUSTERING_THRESHOLD = 0.02; // 2% change triggers clustering

// Price change caps per tick for fairness
const MAX_TICK_CHANGE_PERCENT = 0.10; // 10% max per tick

// Bid/ask spread (percentage)
const BID_ASK_SPREAD = 0.001; // 0.1%

// Max price impact per trade (percentage)
const MAX_TRADE_IMPACT_PERCENT = 0.02; // 2%

// Event probabilities per tick
const EVENT_PROBABILITY = 0.10; // 10% chance per tick
const POSITIVE_EVENT_PROBABILITY = 0.5; // 50% of events are positive

// Sub-ticks for OHLC generation
const SUB_TICKS = 5;
const STOCK_UPDATE_BATCH_SIZE = 50; // Total stocks to update per tick
const STOCK_MICRO_BATCH_SIZE = 10; // Process 10 stocks at a time to avoid read limits
const STOCK_HISTORY_WINDOW = 10;

async function loadStocksBatch(ctx: any, limit: number) {
  const seen = new Set<string>();
  const ordered: Doc<"stocks">[] = await ctx.db
    .query("stocks")
    .withIndex("by_lastUpdated", (q: any) => q.gt("lastUpdated", 0))
    .order("asc")
    .take(limit);

  const batch: Doc<"stocks">[] = [];

  for (const stock of ordered) {
    batch.push(stock);
    seen.add(`${stock._id}`);
  }

  if (batch.length < limit) {
    const fallback = await ctx.db.query("stocks").take(limit - batch.length);
    for (const stock of fallback) {
      const id = `${stock._id}`;
      if (seen.has(id)) continue;
      batch.push(stock);
      seen.add(id);
      if (batch.length === limit) break;
    }
  }

  return batch;
}

// Initial stock configurations
const INITIAL_STOCKS = [
  {
    name: "TechCorp Industries",
    symbol: "TCH",
    sector: "tech" as Sector,
    initialPrice: 15000, // $150.00
    outstandingShares: 1000000,
    liquidity: 50000, // affects price impact
  },
  {
    name: "Energy Solutions Inc",
    symbol: "ENRG",
    sector: "energy" as Sector,
    initialPrice: 8500, // $85.00
    outstandingShares: 1500000,
    liquidity: 40000,
  },
  {
    name: "Global Finance Corp",
    symbol: "GFC",
    sector: "finance" as Sector,
    initialPrice: 12000, // $120.00
    outstandingShares: 2000000,
    liquidity: 60000,
  },
  {
    name: "MediHealth Systems",
    symbol: "MHS",
    sector: "healthcare" as Sector,
    initialPrice: 9500, // $95.00
    outstandingShares: 800000,
    liquidity: 35000,
  },
  {
    name: "Consumer Goods Co",
    symbol: "CGC",
    sector: "consumer" as Sector,
    initialPrice: 6000, // $60.00
    outstandingShares: 2500000,
    liquidity: 70000,
  },
];

// ============================================================================
// HELPER FUNCTIONS - RANDOM NUMBER GENERATION
// ============================================================================

/**
 * Generate random number using Box-Muller transform for Gaussian distribution
 * Mean = 0, Std Dev = 1
 */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Generate random number in uniform distribution
 */
function randomUniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

// ============================================================================
// HELPER FUNCTIONS - PRICE CALCULATIONS
// ============================================================================

/**
 * Calculate fair value based on historical average with noise
 * If stock is linked to a company, fair value is based on 5x company balance
 */
async function calculateFairValue(
  ctx: any,
  stock: Doc<"stocks">,
  recentPrices: number[],
  companiesMap?: Map<string, any>
): Promise<number> {
  // If stock is linked to a company, use company balance for fair value
  if (stock.companyId) {
    // Use pre-fetched company from map to avoid individual queries
    const company = companiesMap?.get(stock.companyId) ?? await ctx.db.get(stock.companyId);
    if (company) {
      // Fair value = 5x company balance / outstanding shares
      const outstandingShares = stock.outstandingShares ?? 1000000;
      const companyBasedFairValue = (company.balance * 5) / outstandingShares;
      return Math.max(1, Math.round(companyBasedFairValue));
    }
  }

  // Fallback to historical average for non-company stocks
  if (recentPrices.length === 0) {
    return stock.currentPrice ?? 10000; // Default to 100.00 if undefined
  }

  // Use 20-period moving average as base fair value
  const avgPrice = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;

  // Add random earnings factor (simulating P/E ratio changes)
  const earningsFactor = randomUniform(0.95, 1.05);

  return avgPrice * earningsFactor;
}

/**
 * Get current volatility with clustering effects
 */
function getCurrentVolatility(stock: Doc<"stocks">): number {
  const baseVol = SECTOR_BASE_VOLATILITY[stock.sector as Sector] || 0.03;
  
  // Check if we're in a volatility cluster (recent large change)
  if (Math.abs(stock.lastPriceChange ?? 0) > VOLATILITY_CLUSTERING_THRESHOLD) {
    return baseVol * VOLATILITY_CLUSTERING_FACTOR;
  }
  
  return baseVol;
}

/**
 * Calculate simulated market trend (overall economy influence)
 */
function getMarketTrend(): number {
  // Very small random walk for overall market
  return randomUniform(-0.01, 0.01);
}

/**
 * Generate sector drift (correlated movement within sector)
 */
function generateSectorDrift(): number {
  return randomUniform(-0.005, 0.005);
}

/**
 * Simulate random market event
 */
function generateMarketEvent(): { hasEvent: boolean; impact: number } {
  if (Math.random() > EVENT_PROBABILITY) {
    return { hasEvent: false, impact: 0 };
  }
  
  const isPositive = Math.random() < POSITIVE_EVENT_PROBABILITY;
  
  // Event impact ranges from -15% to +15%
  const impact = isPositive
    ? randomUniform(0.03, 0.15)
    : randomUniform(-0.15, -0.03);
  
  return { hasEvent: true, impact };
}

/**
 * Calculate new price using Ornstein-Uhlenbeck process with enhancements
 */
function calculateNewPrice(
  currentPrice: number,
  fairValue: number,
  volatility: number,
  momentum: number,
  sectorDrift: number,
  marketTrend: number,
  dt: number = 1
): number {
  // Mean reversion component (drift toward fair value)
  const meanReversion = (fairValue - currentPrice) * MEAN_REVERSION_SPEED;
  
  // Momentum component (short-term autocorrelation)
  const momentumComponent = momentum * 0.3;
  
  // Random volatility component
  const randomComponent = randomNormal() * volatility * Math.sqrt(dt);
  
  // Total drift
  const drift = meanReversion + momentumComponent + sectorDrift + marketTrend;
  
  // Calculate new price
  let newPrice = currentPrice + (drift * currentPrice) + (randomComponent * currentPrice);
  
  // Apply market event if it occurs
  const event = generateMarketEvent();
  if (event.hasEvent) {
    newPrice *= (1 + event.impact);
  }
  
  // Cap maximum change per calculation for fairness
  const maxChange = currentPrice * (MAX_TICK_CHANGE_PERCENT / SUB_TICKS);
  newPrice = clamp(newPrice, currentPrice - maxChange, currentPrice + maxChange);
  
  // Prevent negative prices - minimum 1 cent to prevent NaN
  newPrice = Math.max(newPrice, 1); // Minimum $0.01
  
  // Ensure minimum movement for very low prices to prevent "stuck" behavior
  // If price is very low (< $10) and calculation suggests movement, ensure at least 1 cent change
  if (currentPrice < 1000 && Math.abs(newPrice - currentPrice) < 1) {
    const shouldMove = Math.abs(drift + randomComponent) > 0.01;
    if (shouldMove) {
      // Add minimum 1 cent movement in the direction suggested by drift
      const direction = (drift + randomComponent) > 0 ? 1 : -1;
      newPrice = Math.max(1, currentPrice + direction);
    }
  }
  
  return Math.round(newPrice);
}

/**
 * Calculate price impact from a trade
 */
function calculatePriceImpact(
  shares: number,
  liquidity: number,
  direction: 1 | -1
): number {
  // Impact = (shares / liquidity) * direction
  const rawImpact = (shares / liquidity) * direction;
  
  // Cap the impact for fairness
  return clamp(rawImpact, -MAX_TRADE_IMPACT_PERCENT, MAX_TRADE_IMPACT_PERCENT);
}

/**
 * Simulate volume based on player activity
 */
function simulateVolume(stock: Doc<"stocks">): number {
  // Base volume proportional to outstanding shares
  // Generate realistic volume based on stock characteristics
  const baseVolume = (stock.outstandingShares ?? 1000000) * 0.001; // 0.1% of outstanding shares
  
  // Add randomness
  return Math.round(baseVolume * randomUniform(0.5, 1.5));
}

/**
 * Sync company market cap when stock market cap changes
 * This ensures the company page shows the correct market cap that matches the stock page
 */
async function syncCompanyMarketCap(
  ctx: any,
  stock: Doc<"stocks"> | Id<"stocks">,
  newMarketCap: number
): Promise<void> {
  // Get companyId from stock (either from object or by fetching)
  let companyId: Id<"companies"> | undefined;
  if (typeof stock === "string") {
    // stock is an Id, fetch it
    const stockDoc = await ctx.db.get(stock);
    companyId = stockDoc?.companyId;
  } else {
    // stock is a Doc, use it directly
    companyId = stock.companyId;
  }

  // If stock is not linked to a company, nothing to sync
  if (!companyId) {
    return;
  }

  // Update the company's market cap to match the stock's market cap
  await ctx.db.patch(companyId, {
    marketCap: newMarketCap,
    updatedAt: Date.now(),
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize stock market with default stocks
 * This should be called once during game setup
 */
export const initializeStockMarket = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if stocks already exist
    const existingStocks = await ctx.db.query("stocks").collect();
    if (existingStocks.length > 0) {
      throw new Error("Stock market already initialized");
    }
    
    const now = Date.now();
    const stockIds: Id<"stocks">[] = [];
    
    for (const config of INITIAL_STOCKS) {
      const marketCap = config.initialPrice * config.outstandingShares;
      const baseVol = SECTOR_BASE_VOLATILITY[config.sector];
      
      const stockId = await ctx.db.insert("stocks", {
        name: config.name,
        symbol: config.symbol,
        outstandingShares: config.outstandingShares,
        currentPrice: config.initialPrice,
        marketCap,
        liquidity: config.liquidity,
        sector: config.sector,
        fairValue: config.initialPrice,
        lastPriceChange: 0,
        volatility: baseVol,
        trendMomentum: 0,
        lastVolatilityCluster: now,
        createdAt: now,
        lastUpdated: now,
      });
      
      // Create initial price history entry
      await ctx.db.insert("stockPriceHistory", {
        stockId,
        timestamp: now,
        open: config.initialPrice,
        high: config.initialPrice,
        low: config.initialPrice,
        close: config.initialPrice,
        volume: 0,
      });
      
      stockIds.push(stockId);
    }
    
    return {
      success: true,
      stocksCreated: stockIds.length,
      stocks: stockIds,
    };
  },
});

// ============================================================================
// AUTOMATED TICK UPDATE (Called every 5 minutes by cron)
// ============================================================================

/**
 * Update all stock prices - called by tick system
 */
export const updateStockPrices = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const stocks = await loadStocksBatch(ctx, STOCK_UPDATE_BATCH_SIZE);

    if (stocks.length === 0) {
      return { updated: 0, message: "No stocks to update" };
    }
    
    // Calculate global market trend
    const marketTrend = getMarketTrend();
    
    const updates: any[] = [];
    
    // Process stocks in micro-batches to avoid document read limits
    // Each micro-batch: 10 stocks × (1 + 10 companies + 10 history) = ~210 reads
    for (let i = 0; i < stocks.length; i += STOCK_MICRO_BATCH_SIZE) {
      const microBatch = stocks.slice(i, i + STOCK_MICRO_BATCH_SIZE);
      
      // Pre-fetch companies for this micro-batch only
      const companyIds = microBatch
        .map(s => s.companyId)
        .filter((id): id is Id<"companies"> => id !== undefined);
      
      const companiesMap = new Map<string, any>();
      for (const companyId of companyIds) {
        const company = await ctx.db.get(companyId);
        if (company) {
          companiesMap.set(companyId, company);
        }
      }
      
      // Group stocks by sector for this micro-batch
      const stocksBySector = microBatch.reduce((acc, stock) => {
        const sector = stock.sector ?? "other";
        if (!acc[sector]) {
          acc[sector] = [];
        }
        acc[sector].push(stock);
        return acc;
      }, {} as Record<string, Doc<"stocks">[]>);
      
      // Process each sector in this micro-batch
      for (const [sector, sectorStocks] of Object.entries(stocksBySector)) {
        // Generate sector-specific drift (correlated movement)
        const sectorDrift = generateSectorDrift();
        
        for (const stock of sectorStocks) {
          // Get recent price history for fair value calculation
          const recentHistory = await ctx.db
            .query("stockPriceHistory")
            .withIndex("by_stock_time", (q) => q.eq("stockId", stock._id))
            .order("desc")
            .take(STOCK_HISTORY_WINDOW);
        
        const recentPrices = recentHistory.map(h => h.close).filter((p): p is number => p !== undefined);

        // Calculate fair value (pass companiesMap to avoid individual queries)
        const fairValue = await calculateFairValue(ctx, stock, recentPrices, companiesMap);
        
        // Get current volatility
        const volatility = getCurrentVolatility(stock);
        
        // Generate sub-ticks for OHLC
        const currentStockPrice = stock.currentPrice ?? 10000;
        const prices: number[] = [currentStockPrice];
        let currentPrice = currentStockPrice;
        
        for (let i = 0; i < SUB_TICKS; i++) {
          const newPrice = calculateNewPrice(
            currentPrice,
            fairValue,
            volatility,
            stock.trendMomentum ?? 0,
            sectorDrift,
            marketTrend,
            1 / SUB_TICKS
          );
          prices.push(newPrice);
          currentPrice = newPrice;
        }
        
        // Calculate OHLC
        const open = currentStockPrice;
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const close = prices[prices.length - 1];
        const volume = simulateVolume(stock);
        
        // Calculate price change and new momentum
        const priceChange = (close - open) / open;
        const newMomentum = priceChange * 0.7 + (stock.trendMomentum ?? 0) * 0.3; // Exponential moving average
        
        // Update stock
        const newMarketCap = close * (stock.outstandingShares ?? 1000000);
        
        await ctx.db.patch(stock._id, {
          currentPrice: close,
          marketCap: newMarketCap,
          fairValue,
          lastPriceChange: priceChange,
          volatility,
          trendMomentum: newMomentum,
          lastVolatilityCluster: Math.abs(priceChange) > VOLATILITY_CLUSTERING_THRESHOLD ? now : stock.lastVolatilityCluster,
          lastUpdated: now,
        });
        
        // Sync company market cap if stock is linked to a company
        await syncCompanyMarketCap(ctx, stock, newMarketCap);
        
        // Insert price history
        await ctx.db.insert("stockPriceHistory", {
          stockId: stock._id,
          timestamp: now,
          open,
          high,
          low,
          close,
          volume,
        });
        
        updates.push({
          symbol: stock.symbol,
          oldPrice: open,
          newPrice: close,
          change: priceChange,
        });
      } // End stock processing
    } // End sector processing
    } // End micro-batch loop
    
    return {
      updated: updates.length,
      updates,
      timestamp: now,
    };
  },
});

// ============================================================================
// PLAYER TRADING ACTIONS
// ============================================================================

/**
 * Buy stock shares (for players)
 */
export const buyStock = mutation({
  args: {
    stockId: v.id("stocks"),
    shares: v.number(),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    // Get user and player
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    
    if (!user) {
      throw new Error("User not found. Please refresh the page and try again.");
    }
    
    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    
    if (!player) {
      throw new Error("Player not found. Please complete your profile setup.");
    }
    
    // Check player role
    if (player.role === "banned") {
      throw new Error("You are banned and cannot trade stocks");
    }
    
    if (player.role === "limited") {
      throw new Error("Your account is limited and cannot trade stocks");
    }
    
    // Validate shares
    if (args.shares <= 0 || !Number.isInteger(args.shares)) {
      throw new Error("Shares must be a positive integer");
    }
    
    // Get stock
    const stock = await ctx.db.get(args.stockId);
    if (!stock) {
      throw new Error("Stock not found");
    }

    // Check existing holdings + new purchase doesn't exceed 1M shares
    const portfolioCheck = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_player_stock", (q) =>
        q.eq("playerId", player._id).eq("stockId", args.stockId)
      )
      .first();
    
    const currentShares = portfolioCheck?.shares ?? 0;
    const newTotalShares = currentShares + args.shares;
    
    if (newTotalShares > 1000000) {
      throw new Error(`Cannot own more than 1,000,000 shares per stock. You currently own ${currentShares.toLocaleString()} shares.`);
    }
    
    // Calculate ask price (buy at slightly higher price)
    const currentPrice = stock.currentPrice ?? 10000;
    const askPrice = Math.max(1, Math.round(currentPrice * (1 + BID_ASK_SPREAD)));
    
    // Calculate total cost
    const totalCost = askPrice * args.shares;

    // Validate calculations to prevent NaN
    if (!isFinite(askPrice) || !isFinite(totalCost) || askPrice < 1 || totalCost < 1) {
      throw new Error("Invalid price calculation. Please try again.");
    }
    
    // Check player has enough balance
    if (player.balance < totalCost) {
      throw new Error("Insufficient balance");
    }
    
    // Calculate price impact
    const liquidity = stock.liquidity ?? 1000000;
    const impact = calculatePriceImpact(args.shares, liquidity, 1);
    const newPrice = Math.round(currentPrice * (1 + impact));
    
    const now = Date.now();
    
    // Update stock price and market cap
    const newMarketCap = newPrice * (stock.outstandingShares ?? 1000000);
    await ctx.db.patch(args.stockId, {
      currentPrice: newPrice,
      marketCap: newMarketCap,
      lastUpdated: now,
    });
    
    // Sync company market cap if stock is linked to a company
    await syncCompanyMarketCap(ctx, stock, newMarketCap);
    
    // Deduct balance
    await ctx.db.patch(player._id, {
      balance: player.balance - totalCost,
      updatedAt: now,
    });
    
    // Update or create portfolio entry
    const existingPortfolio = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_player_stock", (q) =>
        q.eq("playerId", player._id).eq("stockId", args.stockId)
      )
      .first();
    
    if (existingPortfolio) {
      // Update existing position
      const newTotalShares = existingPortfolio.shares + args.shares;
      const newTotalInvested = existingPortfolio.totalInvested + totalCost;
      const newAverageCost = Math.round(newTotalInvested / newTotalShares);
      
      await ctx.db.patch(existingPortfolio._id, {
        shares: newTotalShares,
        averageCost: newAverageCost,
        totalInvested: newTotalInvested,
        updatedAt: now,
      });
    } else {
      // Create new position
      await ctx.db.insert("playerStockPortfolios", {
        playerId: player._id,
        stockId: args.stockId,
        shares: args.shares,
        averageCost: askPrice,
        totalInvested: totalCost,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    // Record transaction
    await ctx.db.insert("stockTransactions", {
      playerId: player._id,
      stockId: args.stockId,
      type: "buy",
      shares: args.shares,
      pricePerShare: askPrice,
      totalValue: totalCost,
      priceImpact: impact,
      timestamp: now,
    });
    
    // Record in general transactions table
    await ctx.db.insert("transactions", {
      fromAccountId: player._id,
      fromAccountType: "player",
      toAccountId: player._id, // self-reference for stock purchases
      toAccountType: "player",
      amount: totalCost,
      assetType: "stock",
      assetId: args.stockId,
      description: `Bought ${args.shares} shares of ${stock.symbol} at $${(askPrice / 100).toFixed(2)}`,
      createdAt: now,
    });
    
    return {
      success: true,
      shares: args.shares,
      pricePerShare: askPrice,
      totalCost,
      newPrice,
      priceImpact: impact,
      newBalance: player.balance - totalCost,
    };
  },
});

/**
 * Sell stock shares (for players)
 */
export const sellStock = mutation({
  args: {
    stockId: v.id("stocks"),
    shares: v.number(),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    // Get user and player
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    
    if (!user) {
      throw new Error("User not found. Please refresh the page and try again.");
    }
    
    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    
    if (!player) {
      throw new Error("Player not found. Please complete your profile setup.");
    }
    
    // Check player role
    if (player.role === "banned") {
      throw new Error("You are banned and cannot trade stocks");
    }
    
    if (player.role === "limited") {
      throw new Error("Your account is limited and cannot trade stocks");
    }
    
    // Validate shares
    if (args.shares <= 0 || !Number.isInteger(args.shares)) {
      throw new Error("Shares must be a positive integer");
    }
    
    // Get stock
    const stock = await ctx.db.get(args.stockId);
    if (!stock) {
      throw new Error("Stock not found");
    }
    
    // Get player's portfolio
    const portfolio = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_player_stock", (q) =>
        q.eq("playerId", player._id).eq("stockId", args.stockId)
      )
      .first();
    
    if (!portfolio) {
      throw new Error("You don't own any shares of this stock");
    }
    
    if (portfolio.shares < args.shares) {
      throw new Error(`Insufficient shares. You own ${portfolio.shares} shares`);
    }
    
    // Calculate bid price (sell at slightly lower price)
    const currentPrice = stock.currentPrice ?? 10000;
    const bidPrice = Math.max(1, Math.round(currentPrice * (1 - BID_ASK_SPREAD)));
    
    // Calculate total proceeds
    const totalProceeds = bidPrice * args.shares;

    // Validate calculations to prevent NaN
    if (!isFinite(bidPrice) || !isFinite(totalProceeds) || bidPrice < 1 || totalProceeds < 1) {
      throw new Error("Invalid price calculation. Please try again.");
    }
    
    // Calculate price impact (negative for selling)
    const liquidity = stock.liquidity ?? 1000000;
    const impact = calculatePriceImpact(args.shares, liquidity, -1);
    const newPrice = Math.max(1, Math.round(currentPrice * (1 + impact)));
    
    const now = Date.now();
    
    // Update stock price and market cap
    const newMarketCap = newPrice * (stock.outstandingShares ?? 1000000);
    await ctx.db.patch(args.stockId, {
      currentPrice: newPrice,
      marketCap: newMarketCap,
      lastUpdated: now,
    });
    
    // Sync company market cap if stock is linked to a company
    await syncCompanyMarketCap(ctx, stock, newMarketCap);
    
    // Add proceeds to balance
    await ctx.db.patch(player._id, {
      balance: player.balance + totalProceeds,
      updatedAt: now,
    });
    
    // Update portfolio
    const newShares = portfolio.shares - args.shares;
    
    if (newShares === 0) {
      // Delete portfolio entry if no shares left
      await ctx.db.delete(portfolio._id);
    } else {
      // Update portfolio
      const soldInvestment = Math.round((portfolio.totalInvested * args.shares) / portfolio.shares);
      const newTotalInvested = portfolio.totalInvested - soldInvestment;
      
      await ctx.db.patch(portfolio._id, {
        shares: newShares,
        totalInvested: newTotalInvested,
        updatedAt: now,
      });
    }
    
    // Record transaction
    await ctx.db.insert("stockTransactions", {
      playerId: player._id,
      stockId: args.stockId,
      type: "sell",
      shares: args.shares,
      pricePerShare: bidPrice,
      totalValue: totalProceeds,
      priceImpact: impact,
      timestamp: now,
    });
    
    // Record in general transactions table
    await ctx.db.insert("transactions", {
      fromAccountId: player._id,
      fromAccountType: "player",
      toAccountId: player._id, // self-reference for stock sales
      toAccountType: "player",
      amount: totalProceeds,
      assetType: "stock",
      assetId: args.stockId,
      description: `Sold ${args.shares} shares of ${stock.symbol} at $${(bidPrice / 100).toFixed(2)}`,
      createdAt: now,
    });
    
    return {
      success: true,
      shares: args.shares,
      pricePerShare: bidPrice,
      totalProceeds,
      newPrice,
      priceImpact: impact,
      newBalance: player.balance + totalProceeds,
    };
  },
});

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all stocks with company information
 */
export const getAllStocks = query({
  handler: async (ctx) => {
    const stocks = await ctx.db.query("stocks").collect();
    
    // Enrich stocks with company data (logo)
    const enrichedStocks = await Promise.all(
      stocks.map(async (stock) => {
        let companyLogo = undefined;
        
        if (stock.companyId) {
          const company = await ctx.db.get(stock.companyId);
          companyLogo = company?.logo;
        }
        
        return {
          ...stock,
          companyLogo,
        };
      })
    );
    
    return enrichedStocks;
  },
});

// ============================================================================
// COMPANY TRADING ACTIONS
// ============================================================================

/**
 * Buy stock shares for a company
 */
export const buyStockForCompany = mutation({
  args: {
    companyId: v.id("companies"),
    stockId: v.id("stocks"),
    shares: v.number(),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    // Get user and player
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    
    if (!user) {
      throw new Error("User not found. Please refresh the page and try again.");
    }
    
    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    
    if (!player) {
      throw new Error("Player not found. Please complete your profile setup.");
    }
    
    // Get company and verify ownership
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }
    
    if (company.ownerId !== player._id) {
      throw new Error("You don't own this company");
    }
    
    // Validate shares
    if (args.shares <= 0 || !Number.isInteger(args.shares)) {
      throw new Error("Shares must be a positive integer");
    }
    
    // Get stock
    const stock = await ctx.db.get(args.stockId);
    if (!stock) {
      throw new Error("Stock not found");
    }

    // Check existing holdings + new purchase doesn't exceed 1M shares
    const portfolioCheck = await ctx.db
      .query("companyStockPortfolios")
      .withIndex("by_company_stock", (q) =>
        q.eq("companyId", args.companyId).eq("stockId", args.stockId)
      )
      .first();
    
    const currentShares = portfolioCheck?.shares ?? 0;
    const newTotalShares = currentShares + args.shares;
    
    if (newTotalShares > 1000000) {
      throw new Error(`Cannot own more than 1,000,000 shares per stock. Company currently owns ${currentShares.toLocaleString()} shares.`);
    }
    
    // Calculate ask price (buy at slightly higher price)
    const currentPrice = stock.currentPrice ?? 10000;
    const askPrice = Math.max(1, Math.round(currentPrice * (1 + BID_ASK_SPREAD)));
    
    // Calculate total cost
    const totalCost = askPrice * args.shares;

    // Validate calculations to prevent NaN
    if (!isFinite(askPrice) || !isFinite(totalCost) || askPrice < 1 || totalCost < 1) {
      throw new Error("Invalid price calculation. Please try again.");
    }
    
    // Check company has enough balance
    if (company.balance < totalCost) {
      throw new Error(`Insufficient company balance. Required: $${(totalCost / 100).toFixed(2)}, Available: $${(company.balance / 100).toFixed(2)}`);
    }
    
    // Calculate price impact (positive for buying)
    const liquidity = stock.liquidity ?? 1000000;
    const impact = calculatePriceImpact(args.shares, liquidity, 1);
    const newPrice = Math.max(1, Math.round(currentPrice * (1 + impact)));
    
    const now = Date.now();
    
    // Update stock price and market cap
    const newMarketCap = newPrice * (stock.outstandingShares ?? 1000000);
    await ctx.db.patch(args.stockId, {
      currentPrice: newPrice,
      marketCap: newMarketCap,
      lastPriceChange: impact,
      lastUpdated: now,
    });
    
    // Sync company market cap if stock is linked to a company
    await syncCompanyMarketCap(ctx, stock, newMarketCap);
    
    // Deduct from company balance
    await ctx.db.patch(args.companyId, {
      balance: company.balance - totalCost,
      updatedAt: now,
    });
    
    // Update or create portfolio entry
    const existingPortfolio = await ctx.db
      .query("companyStockPortfolios")
      .withIndex("by_company_stock", (q) =>
        q.eq("companyId", args.companyId).eq("stockId", args.stockId)
      )
      .first();
    
    if (existingPortfolio) {
      // Update existing portfolio
      const newTotalShares = existingPortfolio.shares + args.shares;
      const newTotalInvested = existingPortfolio.totalInvested + totalCost;
      const newAverageCost = Math.round(newTotalInvested / newTotalShares);
      
      await ctx.db.patch(existingPortfolio._id, {
        shares: newTotalShares,
        averageCost: newAverageCost,
        totalInvested: newTotalInvested,
        updatedAt: now,
      });
    } else {
      // Create new portfolio entry
      await ctx.db.insert("companyStockPortfolios", {
        companyId: args.companyId,
        stockId: args.stockId,
        shares: args.shares,
        averageCost: askPrice,
        totalInvested: totalCost,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    // Record transaction
    await ctx.db.insert("companyStockTransactions", {
      companyId: args.companyId,
      stockId: args.stockId,
      type: "buy",
      shares: args.shares,
      pricePerShare: askPrice,
      totalValue: totalCost,
      priceImpact: impact,
      timestamp: now,
    });
    
    return {
      success: true,
      shares: args.shares,
      pricePerShare: askPrice,
      totalCost,
      newPrice,
      impact,
    };
  },
});

/**
 * Sell stock shares for a company
 */
export const sellStockForCompany = mutation({
  args: {
    companyId: v.id("companies"),
    stockId: v.id("stocks"),
    shares: v.number(),
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    // Get user and player
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    
    if (!user) {
      throw new Error("User not found. Please refresh the page and try again.");
    }
    
    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    
    if (!player) {
      throw new Error("Player not found. Please complete your profile setup.");
    }
    
    // Get company and verify ownership
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }
    
    if (company.ownerId !== player._id) {
      throw new Error("You don't own this company");
    }
    
    // Validate shares
    if (args.shares <= 0 || !Number.isInteger(args.shares)) {
      throw new Error("Shares must be a positive integer");
    }
    
    // Get stock
    const stock = await ctx.db.get(args.stockId);
    if (!stock) {
      throw new Error("Stock not found");
    }
    
    // Get company's portfolio
    const portfolio = await ctx.db
      .query("companyStockPortfolios")
      .withIndex("by_company_stock", (q) =>
        q.eq("companyId", args.companyId).eq("stockId", args.stockId)
      )
      .first();
    
    if (!portfolio) {
      throw new Error("Company doesn't own any shares of this stock");
    }
    
    if (portfolio.shares < args.shares) {
      throw new Error(`Insufficient shares. Company owns ${portfolio.shares} shares`);
    }
    
    // Calculate bid price (sell at slightly lower price)
    const currentPrice = stock.currentPrice ?? 10000;
    const bidPrice = Math.max(1, Math.round(currentPrice * (1 - BID_ASK_SPREAD)));
    
    // Calculate total proceeds
    const totalProceeds = bidPrice * args.shares;

    // Validate calculations to prevent NaN
    if (!isFinite(bidPrice) || !isFinite(totalProceeds) || bidPrice < 1 || totalProceeds < 1) {
      throw new Error("Invalid price calculation. Please try again.");
    }
    
    // Calculate price impact (negative for selling)
    const liquidity = stock.liquidity ?? 1000000;
    const impact = calculatePriceImpact(args.shares, liquidity, -1);
    const newPrice = Math.max(1, Math.round(currentPrice * (1 + impact)));
    
    const now = Date.now();
    
    // Update stock price and market cap
    const newMarketCap = newPrice * (stock.outstandingShares ?? 1000000);
    await ctx.db.patch(args.stockId, {
      currentPrice: newPrice,
      marketCap: newMarketCap,
      lastPriceChange: impact,
      lastUpdated: now,
    });
    
    // Sync company market cap if stock is linked to a company
    await syncCompanyMarketCap(ctx, stock, newMarketCap);
    
    // Add to company balance
    await ctx.db.patch(args.companyId, {
      balance: company.balance + totalProceeds,
      updatedAt: now,
    });
    
    // Update portfolio
    const newShares = portfolio.shares - args.shares;
    const proportionSold = args.shares / portfolio.shares;
    const newTotalInvested = Math.round(portfolio.totalInvested * (1 - proportionSold));
    
    if (newShares === 0) {
      // Delete portfolio entry if no shares remaining
      await ctx.db.delete(portfolio._id);
    } else {
      const newAverageCost = Math.round(newTotalInvested / newShares);
      await ctx.db.patch(portfolio._id, {
        shares: newShares,
        averageCost: newAverageCost,
        totalInvested: newTotalInvested,
        updatedAt: now,
      });
    }
    
    // Record transaction
    await ctx.db.insert("companyStockTransactions", {
      companyId: args.companyId,
      stockId: args.stockId,
      type: "sell",
      shares: args.shares,
      pricePerShare: bidPrice,
      totalValue: totalProceeds,
      priceImpact: impact,
      timestamp: now,
    });
    
    return {
      success: true,
      shares: args.shares,
      pricePerShare: bidPrice,
      totalProceeds,
      newPrice,
      impact,
    };
  },
});

/**
 * Get stock by symbol
 */
export const getStockBySymbol = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stocks")
      .withIndex("by_symbol", (q) => q.eq("symbol", args.symbol))
      .first();
  },
});

/**
 * Get stock by ID
 */
export const getStockById = query({
  args: { stockId: v.id("stocks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.stockId);
  },
});

/**
 * Get price history for a stock
 */
export const getStockPriceHistory = query({
  args: {
    stockId: v.id("stocks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // If no limit is specified, fetch all history
    // Otherwise use the provided limit for backward compatibility
    const query = ctx.db
      .query("stockPriceHistory")
      .withIndex("by_stock_time", (q) => q.eq("stockId", args.stockId))
      .order("desc");

    if (args.limit !== undefined) {
      return await query.take(args.limit);
    }

    // Collect all results when no limit is specified
    return await query.collect();
  },
});

/**
 * Get player's stock portfolio
 */
export const getPlayerPortfolio = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .first();
    
    if (!user) {
      return null;
    }
    
    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    
    if (!player) {
      return null;
    }
    
    const portfolios = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
      .collect();
    
    // Enrich with stock data and calculate current values
    const enrichedPortfolios = await Promise.all(
      portfolios.map(async (portfolio) => {
        const stock = await ctx.db.get(portfolio.stockId);
        if (!stock) return null;
        
        const currentValue = (stock.currentPrice ?? 10000) * portfolio.shares;
        const gainLoss = currentValue - portfolio.totalInvested;
        const gainLossPercent = (gainLoss / portfolio.totalInvested) * 100;
        
        return {
          ...portfolio,
          stock,
          currentValue,
          gainLoss,
          gainLossPercent,
        };
      })
    );
    
    return enrichedPortfolios.filter((p) => p !== null);
  },
});

/**
 * Get player's stock transactions
 */
export const getPlayerStockTransactions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .first();
    
    if (!user) {
      return [];
    }
    
    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    
    if (!player) {
      return [];
    }
    
    const limit = args.limit || 50;
    
    const transactions = await ctx.db
      .query("stockTransactions")
      .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
      .order("desc")
      .take(limit);
    
    // Enrich with stock data
    const enrichedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        const stock = await ctx.db.get(transaction.stockId);
        return {
          ...transaction,
          stock,
        };
      })
    );
    
    return enrichedTransactions;
  },
});

/**
 * Get stocks by sector
 */
export const getStocksBySector = query({
  args: { sector: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stocks")
      .withIndex("by_sector", (q) => q.eq("sector", args.sector))
      .collect();
  },
});

/**
 * Get market overview (all sectors aggregated)
 */
export const getMarketOverview = query({
  handler: async (ctx) => {
    const stocks = await ctx.db.query("stocks").collect();
    
    if (stocks.length === 0) {
      return {
        totalMarketCap: 0,
        averageChange24h: 0,
        stockCount: 0,
        sectors: [],
      };
    }
    
    // Calculate total market cap
    const totalMarketCap = stocks.reduce((sum, s) => sum + (s.marketCap ?? 0), 0);
    
    // Calculate average 24h change
    const averageChange24h = stocks.reduce((sum, s) => sum + (s.lastPriceChange ?? 0), 0) / stocks.length;
    
    // Group by sector
    const sectorStats = stocks.reduce((acc, stock) => {
      const sector = stock.sector ?? "other";
      if (!acc[sector]) {
        acc[sector] = {
          sector: sector,
          stockCount: 0,
          totalMarketCap: 0,
          averageChange: 0,
        };
      }
      
      acc[sector].stockCount++;
      acc[sector].totalMarketCap += stock.marketCap ?? 0;
      acc[sector].averageChange += stock.lastPriceChange ?? 0;
      
      return acc;
    }, {} as Record<string, any>);
    
    // Calculate sector averages
    const sectors = Object.values(sectorStats).map((sector: any) => ({
      ...sector,
      averageChange: sector.averageChange / sector.stockCount,
    }));
    
    return {
      totalMarketCap,
      averageChange24h,
      stockCount: stocks.length,
      sectors,
    };
  },
});

/**
 * Get stock statistics for a specific stock
 */
export const getStockStats = query({
  args: { stockId: v.id("stocks") },
  handler: async (ctx, args) => {
    const stock = await ctx.db.get(args.stockId);
    if (!stock) {
      return null;
    }
    
    // Get recent history for calculations
    const history = await ctx.db
      .query("stockPriceHistory")
      .withIndex("by_stock_time", (q) => q.eq("stockId", args.stockId))
      .order("desc")
      .take(30);
    
    if (history.length === 0) {
      return {
        stock,
        dayHigh: stock.currentPrice,
        dayLow: stock.currentPrice,
        weekHigh: stock.currentPrice,
        weekLow: stock.currentPrice,
        volume24h: 0,
        priceChange24h: 0,
        priceChangePercent24h: 0,
      };
    }
    
    // Calculate stats
    const dayHistory = history.slice(0, 12); // Last 1 hour (12 * 5 minutes)
    const weekHistory = history; // Last 2.5 hours (30 * 5 minutes) - adjust as needed
    
    const dayHigh = Math.max(...dayHistory.map(h => h.high).filter((h): h is number => h !== undefined));
    const dayLow = Math.min(...dayHistory.map(h => h.low).filter((h): h is number => h !== undefined));
    const weekHigh = Math.max(...weekHistory.map(h => h.high).filter((h): h is number => h !== undefined));
    const weekLow = Math.min(...weekHistory.map(h => h.low).filter((h): h is number => h !== undefined));
    const volume24h = dayHistory.reduce((sum, h) => sum + (h.volume ?? 0), 0);
    
    const currentPrice = stock.currentPrice ?? 10000;
    const oldPrice = dayHistory[dayHistory.length - 1]?.close ?? currentPrice;
    const priceChange24h = currentPrice - oldPrice;
    const priceChangePercent24h = (priceChange24h / oldPrice) * 100;
    
    return {
      stock,
      dayHigh,
      dayLow,
      weekHigh,
      weekLow,
      volume24h,
      priceChange24h,
      priceChangePercent24h,
    };
  },
});

// Query: Get stock ownership distribution
export const getStockOwnership = query({
  args: {
    stockId: v.id("stocks"),
  },
  handler: async (ctx, args) => {
    // Get all portfolios for this stock
    const portfolios = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_stockId", (q) => q.eq("stockId", args.stockId))
      .collect();

    // Get player and user names
    const ownershipData = await Promise.all(
      portfolios.map(async (portfolio) => {
        const player = await ctx.db.get(portfolio.playerId);
        if (!player) return null;
        
        const user = await ctx.db.get(player.userId);
        const playerName = user?.name || user?.clerkUsername || `Player ${portfolio.playerId.slice(-4)}`;
        
        return {
          playerId: portfolio.playerId,
          playerName,
          shares: portfolio.shares,
        };
      })
    );

    // Filter out nulls and sort by shares descending
    const validData = ownershipData.filter((d): d is NonNullable<typeof d> => d !== null);
    validData.sort((a, b) => b.shares - a.shares);

    return validData;
  },
});
