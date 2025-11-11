/**
 * TICK SYSTEM
 *
 * Central coordinating system that runs every 5 minutes to:
 * 1. Execute bot purchases from marketplace
 * 2. Update stock prices (via realistic stock market engine)
 * 3. Update cryptocurrency prices
 * 4. Apply loan interest
 * 5. Record tick history
 * 
 * CRITICAL: Uses a distributed lock to prevent concurrent execution
 */

import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Acquire distributed lock for tick execution
async function acquireTickLock(ctx: any, lockSource: string): Promise<boolean> {
  const lock = await ctx.db
    .query("tickLock")
    .withIndex("by_lockId", (q: any) => q.eq("lockId", "singleton"))
    .first();

  const now = Date.now();
  
  if (!lock) {
    // Create the lock for the first time
    await ctx.db.insert("tickLock", {
      lockId: "singleton",
      isLocked: true,
      lockedAt: now,
      lockedBy: lockSource,
    });
    return true;
  }

  // Check if lock is stale (older than 10 minutes - should never happen)
  if (lock.isLocked && lock.lockedAt && (now - lock.lockedAt) > 10 * 60 * 1000) {
    console.log(`[TICK] Stale lock detected, forcing release`);
    await ctx.db.patch(lock._id, {
      isLocked: true,
      lockedAt: now,
      lockedBy: lockSource,
    });
    return true;
  }

  // If already locked, cannot acquire
  if (lock.isLocked) {
    console.log(`[TICK] Lock already held by ${lock.lockedBy}, skipping`);
    return false;
  }

  // Acquire the lock
  await ctx.db.patch(lock._id, {
    isLocked: true,
    lockedAt: now,
    lockedBy: lockSource,
  });
  return true;
}

// Release distributed lock
async function releaseTickLock(ctx: any) {
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
async function executeTickLogic(ctx: any, lockSource: string) {
  const now = Date.now();

  // Try to acquire lock
  const lockAcquired = await acquireTickLock(ctx, lockSource);
  if (!lockAcquired) {
    console.log(`[TICK] Could not acquire lock, another tick is running`);
    throw new Error("Another tick is currently running. Please wait.");
  }

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

    // Step 1: Bot purchases from marketplace
    const botPurchases = await executeBotPurchases(ctx, botBudget);

    // Step 1.5: Deduct employee costs from company income
    await deductEmployeeCosts(ctx);

    // Step 2: Update stock prices
    const stockPriceUpdates: any = await ctx.runMutation(
      internal.stocks.updateStockPrices
    );

    // Step 3: Update cryptocurrency prices
    const cryptoPriceUpdates: any = await ctx.runMutation(
      internal.crypto.updateCryptoPrices
    );

    // Step 4: Apply loan interest
    await applyLoanInterest(ctx);

    // Step 5: Update player net worth values for efficient querying
    await updatePlayerNetWorth(ctx);

    // Step 6: Record tick history
    const tickId = await ctx.db.insert("tickHistory", {
      tickNumber,
      timestamp: now,
      botPurchases,
      cryptoPriceUpdates,
      totalBudgetSpent: botPurchases.reduce((sum, p) => sum + p.totalPrice, 0),
    });

    console.log(`Tick #${tickNumber} completed`);

    return {
      tickNumber,
      tickId,
      botPurchases: botPurchases.length,
      stockUpdates: stockPriceUpdates?.updated || 0,
      cryptoUpdates: cryptoPriceUpdates?.length || 0,
    };
  } finally {
    // Always release the lock, even if an error occurred
    await releaseTickLock(ctx);
  }
}

// Main tick mutation - runs every 5 minutes via cron
export const executeTick = internalMutation({
  handler: async (ctx) => {
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
  handler: async (ctx) => {
    console.log("[TICK] Manual tick triggered");
    return await executeTickLogic(ctx, "manual");
  },
});

// Bot purchase logic based on AUTO_PRODUCT_ALGO.md
async function executeBotPurchases(ctx: any, totalBudget: number) {
  console.log(`Bot purchasing with budget: $${totalBudget / 100}`);

  const purchases: Array<{
    productId: any;
    companyId: any;
    quantity: number;
    totalPrice: number;
  }> = [];

  // Get active products
  // Use index and order by totalRevenue to prioritize popular products
  const products = await ctx.db
    .query("products")
    .withIndex("by_isActive_totalRevenue", (q: any) => q.eq("isActive", true))
    .order("desc")
    .filter((q: any) =>
      q.and(
        q.eq(q.field("isArchived"), false),
        q.lte(q.field("price"), 5000000) // Skip products over $50k
      )
    )
    .collect(); // Get all active products

  if (products.length === 0) {
    console.log("No active products found");
    return purchases;
  }

  // Filter out invalid products (already filtered by price in query)
  const eligibleProducts = products.filter((p: any) => {
    return (
      p.price > 0 && (p.stock === undefined || p.stock === null || p.stock > 0)
    );
  });

  if (eligibleProducts.length === 0) {
    console.log("No eligible products");
    return purchases;
  }

  // Calculate attractiveness scores
  const scoredProducts = eligibleProducts.map((product: any) => {
    // Quality rating (0-1)
    const q = product.qualityRating || 0.5;

    // Price preference (favor medium prices)
    const priceInDollars = product.price / 100;
    const logPrice = Math.log(product.price + 1);
    const avgLogPrice = Math.log(100000); // ~$1000 sweet spot
    const priceZ = (logPrice - avgLogPrice) / 2;
    const pricePreferenceScore = Math.exp(-(priceZ ** 2) / 2);

    // Unit price penalty (reduce allocation for expensive items)
    const unitPricePenalty = 1 / (1 + Math.pow(priceInDollars / 5000, 1.2));

    // Demand score (based on recent sales)
    const demandScore = Math.min((product.totalSold || 0) / 100, 1);

    // Combined score
    const rawAttractiveness =
      (0.4 * q + 0.3 * pricePreferenceScore + 0.2 * demandScore + 0.1) *
      unitPricePenalty;

    return {
      product,
      score: Math.max(0, Math.min(1, rawAttractiveness)),
    };
  });

  // Calculate total score
  const totalScore = scoredProducts.reduce(
    (sum: number, p: any) => sum + p.score,
    0
  );

  if (totalScore === 0) {
    console.log("Total score is zero");
    return purchases;
  }

  let remainingBudget = totalBudget;

  // Allocate budget proportionally
  for (const { product, score } of scoredProducts) {
    if (remainingBudget <= 0) break;

    // Calculate desired spend
    const desiredSpend = Math.floor((score / totalScore) * totalBudget);

    if (desiredSpend < product.price) continue;

    // Calculate quantity
    let quantity = Math.floor(desiredSpend / product.price);

    // Apply stock constraints
    if (product.stock !== undefined && product.stock !== null) {
      quantity = Math.min(quantity, product.stock);
    }

    // Apply max per order
    if (product.maxPerOrder) {
      quantity = Math.min(quantity, product.maxPerOrder);
    }

    if (quantity <= 0) continue;

    const totalPrice = quantity * product.price;

    if (totalPrice > remainingBudget) {
      quantity = Math.floor(remainingBudget / product.price);
      if (quantity <= 0) continue;
    }

    const actualPrice = quantity * product.price;

    // Update product stock
    if (product.stock !== undefined && product.stock !== null) {
      await ctx.db.patch(product._id, {
        stock: product.stock - quantity,
        totalSold: product.totalSold + quantity,
        totalRevenue: product.totalRevenue + actualPrice,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(product._id, {
        totalSold: product.totalSold + quantity,
        totalRevenue: product.totalRevenue + actualPrice,
        updatedAt: Date.now(),
      });
    }

    // Credit company
    const company = await ctx.db.get(product.companyId);
    if (company) {
      await ctx.db.patch(product.companyId, {
        balance: company.balance + actualPrice,
        updatedAt: Date.now(),
      });
    }

    // Record sale
    await ctx.db.insert("marketplaceSales", {
      productId: product._id,
      companyId: product.companyId,
      quantity,
      purchaserId: "bot" as const,
      purchaserType: "bot" as const,
      totalPrice: actualPrice,
      createdAt: Date.now(),
    });

    // Note: We don't create a transaction for bot purchases since "bot" is not a valid account ID
    // Bot purchases are system events, not player-to-company transfers

    purchases.push({
      productId: product._id,
      companyId: product.companyId,
      quantity,
      totalPrice: actualPrice,
    });

    remainingBudget -= actualPrice;
  }

  console.log(`Bot made ${purchases.length} purchases`);
  return purchases;
}

// Stock market functionality has been removed

// Deduct employee costs from companies based on their income
async function deductEmployeeCosts(ctx: any) {
  // Get all companies with employees
  const allCompanies = await ctx.db.query("companies").collect();
  
  for (const company of allCompanies) {
    const employees = company.employees || [];
    
    if (employees.length === 0) continue;

    // Calculate total tick cost percentage
    let totalTickCostPercentage = 0;
    for (const employee of employees) {
      totalTickCostPercentage += employee.tickCostPercentage;
    }

    if (totalTickCostPercentage === 0) continue;

    // Get recent sales (last tick's income) to calculate employee costs from
    // We'll use sales from the last 20 minutes (one tick cycle)
    const twentyMinutesAgo = Date.now() - (20 * 60 * 1000);
    
    const recentSales = await ctx.db
      .query("marketplaceSales")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", company._id))
      .filter((q: any) => q.gte(q.field("createdAt"), twentyMinutesAgo))
      .collect();

    const tickIncome = recentSales.reduce((sum: number, sale: any) => sum + sale.totalPrice, 0);

    if (tickIncome === 0) continue;

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
    }
  }
}

// Update player net worth values for efficient leaderboard queries
async function updatePlayerNetWorth(ctx: any) {
  // Get all players - limit to reasonable batch size
  const players = await ctx.db.query("players").take(1000);

  for (const player of players) {
    let netWorth = player.balance;

    // Add stock holdings value
    const stockHoldings = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_playerId", (q: any) => q.eq("playerId", player._id))
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
      .withIndex("by_playerId", (q: any) => q.eq("playerId", player._id))
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
      .withIndex("by_ownerId", (q: any) => q.eq("ownerId", player._id))
      .collect();

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
      .collect();

    for (const loan of activeLoans) {
      netWorth -= loan.remainingBalance;
    }

    // Update player netWorth field if changed
    if (player.netWorth !== netWorth) {
      await ctx.db.patch(player._id, {
        netWorth,
        updatedAt: Date.now(),
      });
    }
  }
}

// Apply daily loan interest
async function applyLoanInterest(ctx: any) {
  const activeLoans = await ctx.db
    .query("loans")
    .withIndex("by_status", (q: any) => q.eq("status", "active"))
    .collect();

  const now = Date.now();
  const twentyMinutesMs = 20 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

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
      }
    }
  }
}

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
