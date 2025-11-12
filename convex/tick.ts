/**
 * TICK SYSTEM
 *
 * Central coordinating system that runs every 5 minutes to:
 * 1. Execute bot purchases from marketplace (max 100 products)
 * 2. Deduct employee costs (10 companies per tick, rotated)
 * 3. Update stock prices (via realistic stock market engine)
 * 4. Update cryptocurrency prices
 * 5. Apply loan interest (100 loans per tick, rotated)
 * 6. Update player net worth (10 players per tick, rotated)
 * 7. Record tick history
 * 
 * CRITICAL: Uses a distributed lock to prevent concurrent execution
 * 
 * OPTIMIZATION: All batch operations use strict limits to stay under
 * Convex's 32,000 document read limit. Operations use rotation so all
 * entities get processed eventually across multiple ticks.
 * 
 * Read Budget per Tick (estimated):
 * - Bot purchases: ~100 products + 100 company reads = 200
 * - Employee costs: 10 companies * 20 sales = 200
 * - Stock prices: handled separately
 * - Crypto prices: handled separately  
 * - Loan interest: 100 loans + 100 player reads = 200
 * - Net worth: 10 players * (5+5+3+3) * 2 = 320
 * Total: ~920 reads (safe margin under 32k limit)
 */

import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const LOAN_INTEREST_BATCH_SIZE = 40;
const LOAN_INTEREST_MAX_BATCHES = 3;
const NET_WORTH_BATCH_SIZE = 6;
const NET_WORTH_MAX_BATCHES = 3;

type TickLockAcquireResult =
  | { acquired: true; lockId: Id<"tickLock"> }
  | { acquired: false };

// Acquire distributed lock for tick execution
async function acquireTickLock(ctx: any, lockSource: string): Promise<TickLockAcquireResult> {
  const lock = await ctx.db
    .query("tickLock")
    .withIndex("by_lockId", (q: any) => q.eq("lockId", "singleton"))
    .first();

  const now = Date.now();
  
  if (!lock) {
    // Create the lock for the first time
    const lockId = await ctx.db.insert("tickLock", {
      lockId: "singleton",
      isLocked: true,
      lockedAt: now,
      lockedBy: lockSource,
    });
    return { acquired: true, lockId };
  }

  // Check if lock is stale (older than 10 minutes - should never happen)
  if (lock.isLocked && lock.lockedAt && (now - lock.lockedAt) > 10 * 60 * 1000) {
    console.log(`[TICK] Stale lock detected, forcing release`);
    await ctx.db.patch(lock._id, {
      isLocked: true,
      lockedAt: now,
      lockedBy: lockSource,
    });
    return { acquired: true, lockId: lock._id };
  }

  // If already locked, cannot acquire
  if (lock.isLocked) {
    console.log(`[TICK] Lock already held by ${lock.lockedBy}, skipping`);
    return { acquired: false };
  }

  // Acquire the lock
  await ctx.db.patch(lock._id, {
    isLocked: true,
    lockedAt: now,
    lockedBy: lockSource,
  });
  return { acquired: true, lockId: lock._id };
}

// Release distributed lock
async function releaseTickLock(ctx: any, lockId?: Id<"tickLock">) {
  if (lockId) {
    await ctx.db.patch(lockId, {
      isLocked: false,
      lockedAt: undefined,
      lockedBy: undefined,
    });
    return;
  }

  const lock = await ctx.db
    .query("tickLock")
    .withIndex("by_lockId", (q: any) => q.eq("lockId", "singleton"))
    .first();

  if (lock) {
    await ctx.db.patch(lock._id, {
      isLocked: false,
      lockedAt: undefined,
      lockedBy: undefined,
    });
  }
}

// Shared tick execution logic
async function executeTickLogic(ctx: any, lockSource: string): Promise<{
  tickNumber: number;
  tickId: Id<"tickHistory">;
  botPurchases: number;
  stockUpdates: number;
  cryptoUpdates: number;
}> {
  const now = Date.now();

  // Try to acquire lock
  const lockResult = await acquireTickLock(ctx, lockSource);
  if (!lockResult.acquired) {
    console.log(`[TICK] Could not acquire lock, another tick is running`);
    throw new Error("Another tick is currently running. Please wait.");
  }

  const lockId = lockResult.lockId;

  try {
    // Get last tick number
    const lastTick = await ctx.db
      .query("tickHistory")
      .withIndex("by_tickNumber")
      .order("desc")
      .first();

    const tickNumber = (lastTick?.tickNumber || 0) + 1;

    console.log(`Executing tick #${tickNumber}`);

    // Hardcode bot budget to avoid extra query (was 10000000 = $100k)
    const botBudget = 50000000; // $500,000 in cents

    // Step 1: Bot purchases from marketplace (chunked into multiple mutations)
    console.log('[TICK] Step 1: Bot purchases (chunked)...');
    const botPurchases: Array<{
      productId: any;
      companyId: any;
      quantity: number;
      totalPrice: number;
    }> = [];
    
    const purchasesPerChunk = 10;
    const totalChunks = 3;
    const budgetPerChunk = Math.floor(botBudget / totalChunks);
    
    for (let i = 0; i < totalChunks; i++) {
      try {
        console.log(`[TICK] Bot purchases chunk ${i + 1}/${totalChunks}...`);
        const chunkPurchases = await ctx.runMutation(
          internal.tick.executeBotPurchasesMutation,
          { 
            totalBudget: budgetPerChunk,
            maxPurchases: purchasesPerChunk,
          }
        );
        
        if (Array.isArray(chunkPurchases)) {
          botPurchases.push(...chunkPurchases);
        }
        console.log(`[TICK] Chunk ${i + 1} completed: ${chunkPurchases?.length || 0} purchases`);
      } catch (error) {
        console.error(`[TICK] Error in bot purchases chunk ${i + 1}:`, error);
        // Continue with other chunks even if one fails
      }
    }

    // Step 1.5: Deduct employee costs from company income (isolated mutation)
    console.log('[TICK] Step 1.5: Employee costs...');
    await ctx.runMutation(internal.tick.deductEmployeeCostsMutation);

    // Step 2: Update stock prices (isolated mutation)
    console.log('[TICK] Step 2: Stock prices...');
    const stockPriceUpdates: any = await ctx.runMutation(
      internal.stocks.updateStockPrices
    );

    // Step 3: Update cryptocurrency prices (isolated mutation)
    console.log('[TICK] Step 3: Crypto prices...');
    const cryptoPriceUpdates: any = await ctx.runMutation(
      internal.crypto.updateCryptoPrices
    );

    // Step 4: Apply loan interest (isolated mutation)
    console.log('[TICK] Step 4: Loan interest (batched)...');
    let loanCursor: string | undefined;
    let loanBatches = 0;
    let loansProcessed = 0;
    while (loanBatches < LOAN_INTEREST_MAX_BATCHES) {
      const loanResult = await ctx.runMutation(
        internal.tick.applyLoanInterestMutation,
        {
          limit: LOAN_INTEREST_BATCH_SIZE,
          cursor: loanCursor,
        }
      );

      if (!loanResult) {
        break;
      }

      loansProcessed += loanResult.processed ?? 0;
      loanCursor = loanResult.cursor ?? undefined;
      loanBatches += 1;

      if (!loanCursor) {
        break;
      }
    }
    console.log(`[TICK] Loan interest batches: ${loanBatches}, loans processed: ${loansProcessed}`);

    // Step 5: Update player net worth values (isolated mutation)
    console.log('[TICK] Step 5: Player net worth (batched)...');
    let netWorthCursor: string | undefined;
    let netWorthBatches = 0;
    let playersProcessed = 0;
    while (netWorthBatches < NET_WORTH_MAX_BATCHES) {
      const netWorthResult = await ctx.runMutation(
        internal.tick.updatePlayerNetWorthMutation,
        {
          limit: NET_WORTH_BATCH_SIZE,
          cursor: netWorthCursor,
        }
      );

      if (!netWorthResult) {
        break;
      }

      playersProcessed += netWorthResult.processed ?? 0;
      netWorthCursor = netWorthResult.cursor ?? undefined;
      netWorthBatches += 1;

      if (!netWorthCursor) {
        break;
      }
    }
    console.log(`[TICK] Net worth batches: ${netWorthBatches}, players processed: ${playersProcessed}`);

    // Step 6: Record tick history
    const tickId: Id<"tickHistory"> = await ctx.db.insert("tickHistory", {
      tickNumber,
      timestamp: now,
      botPurchases: botPurchases || [],
      cryptoPriceUpdates: cryptoPriceUpdates || [],
      totalBudgetSpent: Array.isArray(botPurchases) 
        ? botPurchases.reduce((sum: number, p: any) => sum + p.totalPrice, 0)
        : 0,
    });

    console.log(`Tick #${tickNumber} completed`);

    return {
      tickNumber,
      tickId,
      botPurchases: Array.isArray(botPurchases) ? botPurchases.length : 0,
      stockUpdates: stockPriceUpdates?.updated || 0,
      cryptoUpdates: Array.isArray(cryptoPriceUpdates) ? cryptoPriceUpdates.length : 0,
    };
  } finally {
    // Always release the lock, even if an error occurred
    await releaseTickLock(ctx, lockId);
  }
}

// Main tick mutation - runs every 5 minutes via cron
export const executeTick = internalMutation({
  handler: async (ctx): Promise<{
    tickNumber: number;
    tickId: Id<"tickHistory">;
    botPurchases: number;
    stockUpdates: number;
    cryptoUpdates: number;
  }> => {
    console.log("[TICK] Executing tick via CRON...");
    try {
      const result = await executeTickLogic(ctx, "cron");
      console.log("[TICK] ✅ Tick completed successfully", result);
      return result;
    } catch (error) {
      console.error("[TICK] ❌ Tick failed", error);
      throw error;
    }
  },
});

// Manual trigger for testing (can be called from admin dashboard)
export const manualTick = mutation({
  handler: async (ctx): Promise<{
    tickNumber: number;
    tickId: Id<"tickHistory">;
    botPurchases: number;
    stockUpdates: number;
    cryptoUpdates: number;
  }> => {
    console.log("[TICK] Manual tick triggered");
    return await executeTickLogic(ctx, "manual");
  },
});

/**
 * BOT PURCHASE SYSTEM - COMPLETELY REWRITTEN
 * 
 * The bot simulates market demand by purchasing products based on:
 * 1. Quality rating (40% weight) - Higher quality = more attractive
 * 2. Price preference (30% weight) - Medium prices preferred (~$1000 sweet spot)
 * 3. Demand score (20% weight) - Products with more sales are more attractive
 * 4. Base attractiveness (10% weight) - Ensures all products get some consideration
 * 
 * Budget allocation is proportional to attractiveness scores.
 * Expensive items receive a penalty to prevent budget concentration.
 * 
 * Traits preserved:
 * - Attractiveness scoring algorithm
 * - Budget allocation proportional to scores
 * - Stock and maxPerOrder constraints
 * - Price limits (skip products over $50k)
 * - Safe database operations with error handling
 */
async function executeBotPurchases(ctx: any, totalBudget: number, maxPurchases?: number) {
  console.log(`[BOT] Starting purchase cycle with budget: $${(totalBudget / 100).toFixed(2)}`);

  const purchases: Array<{
    productId: any;
    companyId: any;
    quantity: number;
    totalPrice: number;
  }> = [];

  try {
    // Step 1: Fetch active products (limit to 50 for better performance)
    const products = await ctx.db
      .query("products")
      .withIndex("by_isActive_totalRevenue", (q: any) => q.eq("isActive", true))
      .order("desc")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("isArchived"), false),
          q.lte(q.field("price"), 5000000) // Max price: $50,000
        )
      )
      .take(50);

    if (!products || products.length === 0) {
      console.log("[BOT] No active products found");
      return purchases;
    }

    console.log(`[BOT] Found ${products.length} active products`);

    // Step 2: Filter eligible products (must have valid price and available stock)
    const eligibleProducts = products.filter((p: any) => {
      const hasValidPrice = p.price && p.price > 0 && isFinite(p.price);
      const hasStock = p.stock === undefined || p.stock === null || p.stock > 0;
      return hasValidPrice && hasStock;
    });

    if (eligibleProducts.length === 0) {
      console.log("[BOT] No eligible products after filtering");
      return purchases;
    }

    console.log(`[BOT] ${eligibleProducts.length} eligible products`);

    // Step 3: Calculate attractiveness scores for each product
    const scoredProducts = eligibleProducts
      .map((product: any) => {
        try {
          // Quality rating (0-1 scale)
          const quality = Math.max(0, Math.min(1, product.qualityRating || 0.5));

          // Price preference using log-normal distribution
          // Favors medium-priced items around $1000 sweet spot
          const priceInCents = product.price;
          const priceInDollars = priceInCents / 100;
          const logPrice = Math.log(Math.max(1, priceInCents));
          const avgLogPrice = Math.log(100000); // $1000 in cents
          const priceZ = (logPrice - avgLogPrice) / 2;
          const pricePreference = Math.exp(-(priceZ ** 2) / 2);

          // Unit price penalty (prevents budget concentration on expensive items)
          const unitPricePenalty = 1 / (1 + Math.pow(priceInDollars / 5000, 1.2));

          // Demand score based on historical sales
          const totalSold = product.totalSold || 0;
          const demandScore = Math.min(totalSold / 100, 1);

          // Combined attractiveness score (weighted average + penalty)
          const rawScore =
            (0.4 * quality + 0.3 * pricePreference + 0.2 * demandScore + 0.1) *
            unitPricePenalty;

          const finalScore = Math.max(0, Math.min(1, rawScore));

          return {
            product,
            score: finalScore,
          };
        } catch (error) {
          console.error(`[BOT] Error scoring product ${product._id}:`, error);
          return { product, score: 0 };
        }
      })
      .filter((item: any) => item.score > 0); // Remove products with 0 score

    if (scoredProducts.length === 0) {
      console.log("[BOT] No products with positive scores");
      return purchases;
    }

    // Step 4: Calculate total score for budget allocation
    const totalScore = scoredProducts.reduce(
      (sum: number, item: any) => sum + item.score,
      0
    );

    if (totalScore <= 0 || !isFinite(totalScore)) {
      console.log("[BOT] Invalid total score");
      return purchases;
    }

    console.log(`[BOT] Total attractiveness score: ${totalScore.toFixed(4)}`);

    // Step 5: Allocate budget and make purchases
    let remainingBudget = totalBudget;
    let purchaseCount = 0;
    const MAX_PURCHASES_PER_TICK = maxPurchases || 25; // Limit purchases to avoid transaction overload

    for (const { product, score } of scoredProducts) {
      if (remainingBudget <= 0) {
        console.log("[BOT] Budget exhausted");
        break;
      }

      if (purchaseCount >= MAX_PURCHASES_PER_TICK) {
        console.log(`[BOT] Reached max purchases limit (${MAX_PURCHASES_PER_TICK})`);
        break;
      }

      // Initialize variables for error logging
      let quantity = 0;
      let finalPrice = 0;

      try {
        // Calculate this product's budget allocation
        const budgetAllocation = Math.floor((score / totalScore) * totalBudget);

        // Skip if allocation is too small to buy even one unit
        if (budgetAllocation < product.price) {
          continue;
        }

        // Calculate desired quantity
        quantity = Math.floor(budgetAllocation / product.price);

        // Apply stock constraint
        if (product.stock !== undefined && product.stock !== null && product.stock > 0) {
          quantity = Math.min(quantity, product.stock);
        }

        // Apply maxPerOrder constraint
        if (product.maxPerOrder && product.maxPerOrder > 0) {
          quantity = Math.min(quantity, product.maxPerOrder);
        }

        // Skip if no quantity available
        if (quantity <= 0) {
          continue;
        }

        // Calculate actual purchase price
        const purchasePrice = quantity * product.price;

        // Adjust for remaining budget
        if (purchasePrice > remainingBudget) {
          quantity = Math.floor(remainingBudget / product.price);
          if (quantity <= 0) {
            continue;
          }
        }

        finalPrice = quantity * product.price;

        // Validate final calculations
        if (!isFinite(finalPrice) || finalPrice <= 0 || !isFinite(quantity) || quantity <= 0) {
          console.error(`[BOT] Invalid calculation for product ${product._id}`);
          continue;
        }

        // Step 6: Verify company exists first (before any writes)
        const company = await ctx.db.get(product.companyId);
        if (!company) {
          console.warn(`[BOT] Company not found for product ${product._id}, skipping`);
          continue;
        }

        // Step 7: Execute purchase - update product
        const updateData: any = {
          totalSold: (product.totalSold || 0) + quantity,
          totalRevenue: (product.totalRevenue || 0) + finalPrice,
          updatedAt: Date.now(),
        };

        if (product.stock !== undefined && product.stock !== null) {
          updateData.stock = product.stock - quantity;
        }

        await ctx.db.patch(product._id, updateData);

        // Step 8: Credit company
        await ctx.db.patch(product.companyId, {
          balance: company.balance + finalPrice,
          updatedAt: Date.now(),
        });

        // Step 9: Record sale
        await ctx.db.insert("marketplaceSales", {
          productId: product._id,
          companyId: product.companyId,
          quantity,
          purchaserId: "bot" as const,
          purchaserType: "bot" as const,
          totalPrice: finalPrice,
          createdAt: Date.now(),
        });

        // Step 10: Track purchase
        purchases.push({
          productId: product._id,
          companyId: product.companyId,
          quantity,
          totalPrice: finalPrice,
        });

        remainingBudget -= finalPrice;
        purchaseCount++;

        console.log(
          `[BOT] Purchase #${purchaseCount}: ${quantity}x ${product.name} for $${(finalPrice / 100).toFixed(2)}`
        );
      } catch (error) {
        console.error(`[BOT] Error purchasing product ${product._id}:`, error);
        console.error(`[BOT] Error details:`, {
          message: error instanceof Error ? error.message : String(error),
          productId: product._id,
          productName: product.name,
          quantity,
          finalPrice,
        });
        // Continue to next product on error
        continue;
      }
    }

    const totalSpent = totalBudget - remainingBudget;
    console.log(
      `[BOT] Purchase cycle complete: ${purchases.length} purchases, $${(totalSpent / 100).toFixed(2)} spent`
    );

    return purchases;
  } catch (error) {
    console.error("[BOT] Fatal error in executeBotPurchases:", error);
    return purchases; // Return what we have so far
  }
}

// Stock market functionality has been removed

// Deduct employee costs from companies based on their income
async function deductEmployeeCosts(ctx: any) {
  // CRITICAL: Process only 10 companies per tick to stay WELL under read limits
  // Even with 10 companies * 20 sales = 200 reads, plus overhead, we stay safe
  const COMPANIES_PER_TICK = 10;
  const SALES_PER_COMPANY = 20;
  
  // Use indexed query by updatedAt to process companies in rotation
  // This ensures all companies get processed eventually
  const allCompanies = await ctx.db
    .query("companies")
    .order("asc") // Order by _creationTime ascending (oldest first)
    .take(COMPANIES_PER_TICK);
  
  let companiesProcessed = 0;
  
  for (const company of allCompanies) {
    const employees = company.employees || [];
    
    if (employees.length === 0) {
      // Update timestamp even if no employees (mark as processed)
      await ctx.db.patch(company._id, {
        updatedAt: Date.now(),
      });
      continue;
    }

    // Calculate total tick cost percentage
    let totalTickCostPercentage = 0;
    for (const employee of employees) {
      totalTickCostPercentage += employee.tickCostPercentage;
    }

    if (totalTickCostPercentage === 0) {
      await ctx.db.patch(company._id, {
        updatedAt: Date.now(),
      });
      continue;
    }

    // Get recent sales (last tick's income) to calculate employee costs from
    // We'll use sales from the last 20 minutes (one tick cycle)
    const twentyMinutesAgo = Date.now() - (20 * 60 * 1000);
    
    const recentSales = await ctx.db
      .query("marketplaceSales")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", company._id))
      .filter((q: any) => q.gte(q.field("createdAt"), twentyMinutesAgo))
      .take(SALES_PER_COMPANY); // Reduced to 20 sales per company

    const tickIncome = recentSales.reduce((sum: number, sale: any) => sum + sale.totalPrice, 0);

    if (tickIncome === 0) {
      await ctx.db.patch(company._id, {
        updatedAt: Date.now(),
      });
      continue;
    }

    // Calculate employee cost
    const employeeCost = Math.floor(tickIncome * (totalTickCostPercentage / 100));

    if (employeeCost > 0 && employeeCost <= company.balance) {
      // Deduct from company balance
      await ctx.db.patch(company._id, {
        balance: company.balance - employeeCost,
        updatedAt: Date.now(),
      });

      // Transfer to company owner
      const owner = await ctx.db.get(company.ownerId);
      if (owner) {
        // This money goes back to owner as it's overhead, not salary to employees
        // The upfront cost was already paid, this is the recurring cost
        // We deduct it from company but don't give it back to player (it's operating cost)
        
        // Record transaction for audit
        await ctx.db.insert("transactions", {
          fromAccountId: company._id,
          fromAccountType: "company",
          toAccountId: company.ownerId,
          toAccountType: "player",
          amount: employeeCost,
          assetType: "cash",
          description: `Employee costs for tick (${totalTickCostPercentage}% of income)`,
          createdAt: Date.now(),
        });
      }
      companiesProcessed++;
    } else {
      // Still update timestamp
      await ctx.db.patch(company._id, {
        updatedAt: Date.now(),
      });
    }
  }
  
  console.log(`Processed employee costs for ${companiesProcessed} companies`);
}

// Update player net worth values for efficient leaderboard queries
// Optimized to process only a small batch per tick to avoid read limits
async function updatePlayerNetWorth(
  ctx: any,
  {
    limit,
    cursor,
  }: {
    limit: number;
    cursor?: string;
  }
) {
  // CRITICAL: Only process a small number of players per batch to stay under read budget
  const MAX_HOLDINGS_PER_TYPE = 5; // Reduced from 20
  const MAX_COMPANIES = 3; // Reduced from 10
  const MAX_LOANS = 3; // Reduced from 10
  const safeLimit = Math.max(1, Math.min(limit, 25));
  
  // Get players with oldest lastNetWorthUpdate (or null) first for round-robin processing
  const playerPage = await ctx.db
    .query("players")
    .withIndex("by_lastNetWorthUpdate")
    .order("asc")
    .paginate({ limit: safeLimit, cursor });

  const players = playerPage.page;

  let playersUpdated = 0;

  for (const player of players) {
    let netWorth = player.balance;

    // Add stock holdings value
    const stockHoldings = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_playerId", (q: any) => q.eq("playerId", player._id))
      .take(MAX_HOLDINGS_PER_TYPE);

    for (const holding of stockHoldings) {
      const stock = await ctx.db.get(holding.stockId);
      if (stock) {
        netWorth += holding.shares * stock.currentPrice;
      }
    }

    // Add cryptocurrency holdings value
    const cryptoHoldings = await ctx.db
      .query("playerCryptoWallets")
      .withIndex("by_playerId", (q: any) => q.eq("playerId", player._id))
      .take(MAX_HOLDINGS_PER_TYPE);

    for (const holding of cryptoHoldings) {
      const crypto = await ctx.db.get(holding.cryptoId);
      if (crypto) {
        netWorth += holding.balance * crypto.currentPrice;
      }
    }

    // Add company equity (owned companies)
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_ownerId", (q: any) => q.eq("ownerId", player._id))
      .take(MAX_COMPANIES);

    for (const company of companies) {
      netWorth += company.balance;
      if (company.isPublic && company.marketCap) {
        netWorth += company.marketCap;
      }
    }

    // Subtract unpaid loans from net worth
    const activeLoans = await ctx.db
      .query("loans")
      .withIndex("by_playerId", (q: any) => q.eq("playerId", player._id))
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .take(MAX_LOANS);

    for (const loan of activeLoans) {
      netWorth -= loan.remainingBalance;
    }

    // Always update to mark this player as processed (rotation)
    await ctx.db.patch(player._id, {
      netWorth,
      lastNetWorthUpdate: Date.now(),
      updatedAt: Date.now(),
    });
    
    playersUpdated++;
  }

  console.log(`Updated net worth for ${playersUpdated} players (batch limit ${safeLimit})`);

  return {
    processed: playersUpdated,
    cursor: playerPage.continueCursor ?? undefined,
  };
}

// Apply daily loan interest
async function applyLoanInterest(
  ctx: any,
  {
    limit,
    cursor,
  }: {
    limit: number;
    cursor?: string;
  }
) {
  // OPTIMIZED: Process loans in small batches to avoid read explosion
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const loanPage = await ctx.db
    .query("loans")
    .withIndex("by_status", (q: any) => q.eq("status", "active"))
    .order("asc") // Order by creation time for rotation
    .paginate({ limit: safeLimit, cursor });

  const activeLoans = loanPage.page;

  const now = Date.now();
  const twentyMinutesMs = 20 * 60 * 1000;

  let loansProcessed = 0;

  for (const loan of activeLoans) {
    const timeSinceLastInterest = now - loan.lastInterestApplied;

    // Apply interest proportionally for 20-minute intervals
    // 5% daily = 5% / 72 per 20-minute interval (72 intervals per day)
    if (timeSinceLastInterest >= twentyMinutesMs) {
      const dailyRate = loan.interestRate / 100; // 5% = 0.05
      const intervalRate = dailyRate / 72; // 72 twenty-minute intervals per day

      const interestAmount = Math.floor(loan.remainingBalance * intervalRate);

      if (interestAmount > 0) {
        const newBalance = loan.remainingBalance + interestAmount;
        const newAccruedInterest = loan.accruedInterest + interestAmount;

        await ctx.db.patch(loan._id, {
          remainingBalance: newBalance,
          accruedInterest: newAccruedInterest,
          lastInterestApplied: now,
        });

        // Deduct from player balance (allow negative)
        const player = await ctx.db.get(loan.playerId);
        if (player) {
          await ctx.db.patch(loan.playerId, {
            balance: player.balance - interestAmount,
            updatedAt: now,
          });
        }
        loansProcessed++;
      }
    }
  }
  
  console.log(`Applied interest to ${loansProcessed} loans (batch limit ${safeLimit})`);

  return {
    processed: loansProcessed,
    cursor: loanPage.continueCursor ?? undefined,
  };
}

// ============================================================================
// INTERNAL MUTATIONS - Each step isolated to prevent read limit accumulation
// ============================================================================

export const executeBotPurchasesMutation = internalMutation({
  args: { 
    totalBudget: v.number(),
    maxPurchases: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await executeBotPurchases(ctx, args.totalBudget, args.maxPurchases);
  },
});

export const deductEmployeeCostsMutation = internalMutation({
  handler: async (ctx) => {
    await deductEmployeeCosts(ctx);
    return { success: true };
  },
});

export const applyLoanInterestMutation = internalMutation({
  args: {
    limit: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await applyLoanInterest(ctx, args);
  },
});

export const updatePlayerNetWorthMutation = internalMutation({
  args: {
    limit: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await updatePlayerNetWorth(ctx, args);
  },
});

// ============================================================================
// QUERIES
// ============================================================================

// Query: Get tick history
export const getTickHistory = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("tickHistory")
      .withIndex("by_tickNumber")
      .order("desc")
      .take(100);
  },
});

// Query: Get last tick timestamp
export const getLastTick = query({
  handler: async (ctx) => {
    const lastTick = await ctx.db
      .query("tickHistory")
      .withIndex("by_tickNumber")
      .order("desc")
      .first();

    return lastTick
      ? {
          tickNumber: lastTick.tickNumber,
          timestamp: lastTick.timestamp,
        }
      : null;
  },
});
