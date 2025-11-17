/**
 * TICK SYSTEM
 *
 * Central coordinating system that runs every 5 minutes to:
 * 1. Execute bot purchases from marketplace (100 companies, 100 products each, rotated)
 * 2. Deduct employee costs (10 companies per tick, rotated)
 * 3. Update stock prices (via realistic stock market engine)
 * 4. Update cryptocurrency prices
 * 5. Apply loan interest (120 loans per tick, rotated)
 * 6. Update player net worth (18 players per tick, rotated)
 * 7. Record tick history
 *
 * CRITICAL: Uses a distributed lock to prevent concurrent execution
 *
 * OPTIMIZATION: All batch operations use strict limits to stay under
 * Convex's 32,000 document read limit. Operations use rotation so all
 * entities get processed eventually across multiple ticks.
 *
 * Read Budget per Tick (estimated):
 * - Bot purchases: max 100 companies * 100 products * 3 reads = ~30,000 reads
 * - Employee costs: 10 companies * 20 sales = 200
 * - Stock prices: handled separately
 * - Crypto prices: handled separately
 * - Loan interest: 120 loans + 120 player reads = 240
 * - Net worth: 18 players * (5+5+3+3) * 2 = 576
 * Total: ~31,016 reads (safe under 32k limit with buffer for overhead)
 */

import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

const LOAN_INTEREST_BATCH_SIZE = 40;
const LOAN_INTEREST_MAX_BATCHES = 3;
const NET_WORTH_BATCH_SIZE = 6;
const NET_WORTH_MAX_BATCHES = 3;

type TickLockAcquireResult =
  | { acquired: true; lockId: Id<"tickLock"> }
  | { acquired: false };

// Acquire distributed lock for tick execution
async function acquireTickLock(
  ctx: any,
  lockSource: string,
): Promise<TickLockAcquireResult> {
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
  if (lock.isLocked && lock.lockedAt && now - lock.lockedAt > 10 * 60 * 1000) {
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
async function executeTickLogic(
  ctx: any,
  lockSource: string,
): Promise<{
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

    // Step 1: Bot purchases from marketplace (per-company allocation)
    console.log("[TICK] Step 1: Bot purchases (all companies)...");
    const botPurchases: Array<{
      productId: any;
      companyId: any;
      quantity: number;
      totalPrice: number;
    }> = [];

    // Process companies in batches with rotation to stay under read limits
    try {
      console.log(`[TICK] Bot purchases: processing companies (100 per tick, rotated)...`);
      const allPurchases = await ctx.runMutation(
        internal.tick.executeBotPurchasesMutation,
        {
          companiesLimit: 100, // Process 100 companies per tick (rotated)
          offset: 0,
        },
      );

      if (Array.isArray(allPurchases)) {
        botPurchases.push(...allPurchases);
      }
      console.log(
        `[TICK] Bot purchases completed: ${allPurchases?.length || 0} total purchases`,
      );
    } catch (error) {
      console.error(`[TICK] Error in bot purchases:`, error);
      // Continue even if purchases fail
    }

    // Step 1.5: Deduct employee costs from company income (isolated mutation)
    console.log("[TICK] Step 1.5: Employee costs...");
    await ctx.runMutation(internal.tick.deductEmployeeCostsMutation);

    // Step 2: Update stock prices (isolated mutation)
    console.log("[TICK] Step 2: Stock prices...");
    const stockPriceUpdates: any = await ctx.runMutation(
      internal.stocks.updateStockPrices,
    );

    // Step 3: Update cryptocurrency prices (isolated mutation)
    console.log("[TICK] Step 3: Crypto prices...");
    const cryptoPriceUpdates: any = await ctx.runMutation(
      internal.crypto.updateCryptoPrices,
    );

    // Step 4: Apply loan interest (isolated mutation)
    console.log("[TICK] Step 4: Loan interest (batched)...");
    let loanCursor: string | undefined;
    let loanBatches = 0;
    let loansProcessed = 0;
    while (loanBatches < LOAN_INTEREST_MAX_BATCHES) {
      const loanResult = await ctx.runMutation(
        internal.tick.applyLoanInterestMutation,
        {
          limit: LOAN_INTEREST_BATCH_SIZE,
          cursor: loanCursor,
        },
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
    console.log(
      `[TICK] Loan interest batches: ${loanBatches}, loans processed: ${loansProcessed}`,
    );

    // Step 5: Update player net worth values (isolated mutation)
    console.log("[TICK] Step 5: Player net worth (batched)...");
    let netWorthCursor: string | undefined;
    let netWorthBatches = 0;
    let playersProcessed = 0;
    while (netWorthBatches < NET_WORTH_MAX_BATCHES) {
      const netWorthResult = await ctx.runMutation(
        internal.tick.updatePlayerNetWorthMutation,
        {
          limit: NET_WORTH_BATCH_SIZE,
          cursor: netWorthCursor,
        },
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
    console.log(
      `[TICK] Net worth batches: ${netWorthBatches}, players processed: ${playersProcessed}`,
    );

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
      cryptoUpdates: Array.isArray(cryptoPriceUpdates)
        ? cryptoPriceUpdates.length
        : 0,
    };
  } finally {
    // Always release the lock, even if an error occurred
    await releaseTickLock(ctx, lockId);
  }
}

// Main tick mutation - runs every 5 minutes via cron
export const executeTick = internalMutation({
  handler: async (
    ctx,
  ): Promise<{
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
  handler: async (
    ctx,
  ): Promise<{
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
 * BOT PURCHASE SYSTEM - RANDOM PER-COMPANY BUDGET ALLOCATION
 *
 * The bot simulates market demand by purchasing products from companies:
 * - Total budget per tick: $2,500,000 minimum (can exceed if purchases continue)
 * - Processes 100 companies per tick (rotated, ensures all companies get processed)
 * - Each company gets a RANDOM percentage allocation of the total budget
 * - Max 100 products per company to stay under Convex read limits
 * - Budget is split equally among all valid products in a company
 *
 * ROTATION: Companies are processed in order by creation time, with updatedAt
 * timestamp updated after processing, ensuring all companies get their turn.
 *
 * Max product price: $50,000 (products above this are ignored)
 */
async function executeBotPurchasesForCompany(
  ctx: any,
  companyId: any,
  companyBudget: number,
  minSpend: number,
) {
  console.log(
    `[BOT] Processing company ${companyId} with budget: $${(companyBudget / 100).toFixed(2)}`,
  );

  const purchases: Array<{
    productId: any;
    companyId: any;
    quantity: number;
    totalPrice: number;
  }> = [];

  try {
    // Step 1: Fetch products for this company with a limit to avoid document read limit
    // CRITICAL: Limit to 100 products per company to stay under 32k read limit
    const products = await ctx.db
      .query("products")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
      .take(100); // Limit to 100 products per company

    if (!products || products.length === 0) {
      console.log(`[BOT] No products found for company ${companyId}`);
      return { purchases, totalSpent: 0 };
    }

    console.log(
      `[BOT] Found ${products.length} total products for company ${companyId}`,
    );

    // Step 2: Filter by max price ($50,000) and valid price only
    const validProducts = products.filter((p: any) => {
      const hasValidPrice = p.price && p.price > 0 && isFinite(p.price);
      const withinMaxPrice = p.price <= 5000000; // Max $50,000
      return hasValidPrice && withinMaxPrice;
    });

    if (validProducts.length === 0) {
      console.log(
        `[BOT] No products with valid prices (within $50k max) for company ${companyId}`,
      );
      return { purchases, totalSpent: 0 };
    }

    console.log(
      `[BOT] ${validProducts.length} products with valid prices for company ${companyId}`,
    );

    // Step 3: Calculate budget allocation across products (equal split per product)
    const budgetPerProduct = Math.floor(companyBudget / validProducts.length);

    // Step 4: Buy from ALL products with allocated budget
    let remainingBudget = companyBudget;
    let purchaseCount = 0;

    for (const cachedProduct of validProducts) {
      if (remainingBudget <= 0) {
        console.log(`[BOT] Budget exhausted for company ${companyId}`);
        break;
      }

      // Initialize variables for error logging
      let quantity = 0;
      let finalPrice = 0;

      try {
        // Re-fetch product to get current stock (not cached value)
        const product = await ctx.db.get(cachedProduct._id);
        if (!product) {
          console.warn(
            `[BOT] Product ${cachedProduct._id} no longer exists, skipping`,
          );
          continue;
        }

        // Use the per-product budget allocation (or remaining budget if smaller)
        const productAllocation = Math.min(budgetPerProduct, remainingBudget);

        // Skip if allocation is too small to buy even one unit
        if (productAllocation < product.price) {
          continue;
        }

        // Calculate desired quantity
        quantity = Math.floor(productAllocation / product.price);

        // Apply CURRENT stock constraint (re-fetched above)
        if (
          product.stock !== undefined &&
          product.stock !== null &&
          product.stock > 0
        ) {
          quantity = Math.min(quantity, product.stock);
        } else if (
          product.stock !== undefined &&
          product.stock !== null &&
          product.stock <= 0
        ) {
          // Skip if product is out of stock
          continue;
        }

        // Apply maxPerOrder constraint
        if (product.maxPerOrder && product.maxPerOrder > 0) {
          quantity = Math.min(quantity, product.maxPerOrder);
        }

        // Skip if no quantity available
        if (quantity <= 0) {
          continue;
        }

        finalPrice = quantity * product.price;

        // Validate final calculations
        if (
          !isFinite(finalPrice) ||
          finalPrice <= 0 ||
          !isFinite(quantity) ||
          quantity <= 0
        ) {
          console.error(`[BOT] Invalid calculation for product ${product._id}`);
          continue;
        }

        // Step 6: Verify company exists first (before any writes)
        const company = await ctx.db.get(product.companyId);
        if (!company) {
          console.warn(
            `[BOT] Company not found for product ${product._id}, skipping`,
          );
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
          `[BOT] Company ${companyId} Purchase #${purchaseCount}: ${quantity}x ${product.name} for $${(finalPrice / 100).toFixed(2)}`,
        );
      } catch (error) {
        console.error(
          `[BOT] Error purchasing product ${cachedProduct._id} from company ${companyId}:`,
          error,
        );
        console.error(`[BOT] Error details:`, {
          message: error instanceof Error ? error.message : String(error),
          productId: cachedProduct._id,
          productName: cachedProduct.name,
          quantity,
          finalPrice,
        });
        // Continue to next product on error
        continue;
      }
    }

    const totalSpent = companyBudget - remainingBudget;

    // Check if we met minimum spend requirement
    if (totalSpent < minSpend) {
      console.log(
        `[BOT] Company ${companyId}: Only spent $${(totalSpent / 100).toFixed(2)} (min: $${(minSpend / 100).toFixed(2)}). Insufficient products.`,
      );
    } else {
      console.log(
        `[BOT] Company ${companyId} complete: ${purchases.length} purchases, $${(totalSpent / 100).toFixed(2)} spent`,
      );
    }

    return { purchases, totalSpent };
  } catch (error) {
    console.error(
      `[BOT] Fatal error in executeBotPurchasesForCompany for company ${companyId}:`,
      error,
    );
    return { purchases, totalSpent: 0 }; // Return what we have so far
  }
}

// Wrapper function to process all companies with random budget allocation
async function executeBotPurchasesAllCompanies(
  ctx: any,
  companiesLimit: number = 10000,
  offset: number = 0,
) {
  console.log(`[BOT] Starting bot purchases with random budget allocation`);

  const allPurchases: Array<{
    productId: any;
    companyId: any;
    quantity: number;
    totalPrice: number;
  }> = [];

  const TOTAL_BUDGET = 2500000000; // $2,500,000 in cents (minimum)

  try {
    // Fetch companies with limit to avoid document read issues
    // CRITICAL: With 100 products per company max, we can safely process ~100 companies per tick
    // This gives us: 100 companies * 100 products * 3 reads per product = ~30,000 reads (safe under 32k)
    // Use rotation by updatedAt so all companies eventually get processed
    const allCompanies = await ctx.db
      .query("companies")
      .order("asc") // Order by _creationTime ascending (oldest processed first)
      .take(Math.min(companiesLimit, 100));

    console.log(`[BOT] Total companies fetched: ${allCompanies.length}`);

    if (!allCompanies || allCompanies.length === 0) {
      console.log(`[BOT] No companies found`);
      return allPurchases;
    }

    // Generate random percentage allocations for each company
    // Each company gets a random percentage, and they all add up to 100%
    const randomPercentages = allCompanies.map(() => Math.random());
    const totalRandomValue = randomPercentages.reduce(
      (sum: number, val: number) => sum + val,
      0,
    );
    const normalizedPercentages = randomPercentages.map(
      (val: number) => val / totalRandomValue,
    );

    console.log(
      `[BOT] Generated random budget allocations for ${allCompanies.length} companies`,
    );

    let totalSpentAllCompanies = 0;
    let companiesProcessed = 0;

    for (let i = 0; i < allCompanies.length; i++) {
      const company = allCompanies[i];
      const companyBudget = Math.floor(TOTAL_BUDGET * normalizedPercentages[i]);

      // Skip companies with minimal budget (less than $100) but still update timestamp
      if (companyBudget < 10000) {
        await ctx.db.patch(company._id, {
          updatedAt: Date.now(),
        });
        continue;
      }

      try {
        console.log(
          `[BOT] Processing company: ${company.name} (ID: ${company._id}), budget: $${(companyBudget / 100).toFixed(2)}`,
        );
        const result = await executeBotPurchasesForCompany(
          ctx,
          company._id,
          companyBudget,
          0, // No minimum spend requirement per company
        );

        allPurchases.push(...result.purchases);
        totalSpentAllCompanies += result.totalSpent;
        companiesProcessed++;

        // Update company timestamp for rotation (ensures all companies get processed)
        await ctx.db.patch(company._id, {
          updatedAt: Date.now(),
        });

        console.log(
          `[BOT] Company ${company.name}: ${result.purchases.length} purchases, $${(result.totalSpent / 100).toFixed(2)} spent`,
        );
      } catch (error) {
        console.error(
          `[BOT] Error processing company ${company.name} (${company._id}):`,
          error,
        );
        // Still update timestamp even on error to avoid getting stuck
        try {
          await ctx.db.patch(company._id, {
            updatedAt: Date.now(),
          });
        } catch (patchError) {
          console.error(`[BOT] Failed to update timestamp for company ${company._id}`, patchError);
        }
        // Continue with next company
      }
    }

    console.log(
      `[BOT] All companies processed: ${companiesProcessed} companies, ${allPurchases.length} total purchases, $${(totalSpentAllCompanies / 100).toFixed(2)} total spent (minimum: $${(TOTAL_BUDGET / 100).toFixed(2)})`,
    );

    return allPurchases;
  } catch (error) {
    console.error(
      "[BOT] Fatal error in executeBotPurchasesAllCompanies:",
      error,
    );
    return allPurchases;
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
    const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;

    const recentSales = await ctx.db
      .query("marketplaceSales")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", company._id))
      .filter((q: any) => q.gte(q.field("createdAt"), twentyMinutesAgo))
      .take(SALES_PER_COMPANY); // Reduced to 20 sales per company

    const tickIncome = recentSales.reduce(
      (sum: number, sale: any) => sum + sale.totalPrice,
      0,
    );

    if (tickIncome === 0) {
      await ctx.db.patch(company._id, {
        updatedAt: Date.now(),
      });
      continue;
    }

    // Calculate employee cost
    const employeeCost = Math.floor(
      tickIncome * (totalTickCostPercentage / 100),
    );

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
// Update player net worth values
async function updatePlayerNetWorth(
  ctx: any,
  args: {
    limit?: number;
    cursor?: string;
  },
) {
  console.log(
    `[NET_WORTH] updatePlayerNetWorth called with raw args:`,
    JSON.stringify(args),
  );

  // CRITICAL: Only process a small number of players per batch to stay under read budget
  const MAX_HOLDINGS_PER_TYPE = 5; // Reduced from 20
  const MAX_COMPANIES = 3; // Reduced from 10
  const MAX_LOANS = 3; // Reduced from 10

  // Add defensive check for undefined limit
  const limit = args.limit;
  const cursor = args.cursor;
  const safeLimitInput = limit ?? 6;
  const safeLimitCalculated = Math.max(1, Math.min(safeLimitInput, 25));

  // Triple check that we have a valid finite positive number
  const safeLimit =
    typeof safeLimitCalculated === "number" &&
    isFinite(safeLimitCalculated) &&
    safeLimitCalculated > 0
      ? safeLimitCalculated
      : 6;

  console.log(
    `[NET_WORTH] Processing players with limit=${safeLimit} (input was ${limit}), cursor=${cursor ? "yes" : "no"}`,
  );

  // WORKAROUND: Use .take() instead of .paginate() since paginate is causing issues
  console.log(
    `[NET_WORTH] Using .take() instead of .paginate() with limit=${safeLimit}`,
  );

  const players = await ctx.db
    .query("players")
    .withIndex("by_lastNetWorthUpdate")
    .order("asc")
    .take(safeLimit);

  console.log(`[NET_WORTH] Successfully fetched ${players.length} players`);

  let playersUpdated = 0;

  for (const player of players) {
    let netWorth = player.balance;

    // Add stock holdings value
    const stockHoldings = await ctx.db
      .query("playerStockPortfolios")
      .withIndex("by_playerId", (q: any) => q.eq("playerId", player._id))
      .take(MAX_HOLDINGS_PER_TYPE || 5);

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
      .take(MAX_HOLDINGS_PER_TYPE || 5);

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
      .take(MAX_COMPANIES || 3);

    // Fetch all stocks once to avoid multiple queries (only if there are public companies)
    const hasPublicCompanies = companies.some((c: Doc<"companies">) => c.isPublic);
    let stocksByCompanyId = new Map<Id<"companies">, Doc<"stocks">>();
    if (hasPublicCompanies) {
      const allStocks = await ctx.db.query("stocks").collect();
      stocksByCompanyId = new Map<Id<"companies">, Doc<"stocks">>(
        allStocks
          .filter((s: Doc<"stocks">) => s.companyId !== undefined)
          .map((s: Doc<"stocks">) => [s.companyId!, s])
      );
    }

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

    // Subtract unpaid loans from net worth
    const activeLoans = await ctx.db
      .query("loans")
      .withIndex("by_playerId", (q: any) => q.eq("playerId", player._id))
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .take(MAX_LOANS || 3);

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

  console.log(
    `Updated net worth for ${playersUpdated} players (batch limit ${safeLimit})`,
  );

  return {
    processed: playersUpdated,
    cursor: undefined, // No pagination cursor since we're using .take()
  };
}

// Apply daily loan interest
async function applyLoanInterest(
  ctx: any,
  args: {
    limit?: number;
    cursor?: string;
  },
) {
  console.log(
    `[LOAN] applyLoanInterest called with raw args:`,
    JSON.stringify(args),
  );

  // OPTIMIZED: Process loans in small batches to avoid read explosion
  // Add defensive check for undefined limit - EXTREMELY defensive
  const limit = typeof args.limit === "number" ? args.limit : 40;
  const cursor = args.cursor;
  const safeLimitInput = limit;
  const safeLimitCalculated = Math.max(1, Math.min(safeLimitInput, 100));

  // Triple check that we have a valid finite positive number
  const safeLimit =
    typeof safeLimitCalculated === "number" &&
    isFinite(safeLimitCalculated) &&
    safeLimitCalculated > 0
      ? safeLimitCalculated
      : 40;

  console.log(
    `[LOAN] Processing loans with limit=${safeLimit} (input was ${limit}), cursor=${cursor ? "yes" : "no"}`,
  );

  // WORKAROUND: Use .take() instead of .paginate() since paginate is causing issues
  // This means we lose pagination but at least it will work
  console.log(
    `[LOAN] Using .take() instead of .paginate() with limit=${safeLimit}`,
  );

  // CRITICAL: Final validation before .take() - must be a concrete number
  const takeLimitValue = Number(safeLimit);
  if (!isFinite(takeLimitValue) || takeLimitValue <= 0) {
    console.error(
      `[LOAN] CRITICAL: Invalid take limit: ${takeLimitValue}, using 40`,
    );
    throw new Error(`Invalid take limit: ${takeLimitValue}`);
  }

  const activeLoans = await ctx.db
    .query("loans")
    .withIndex("by_status", (q: any) => q.eq("status", "active"))
    .order("asc")
    .take(takeLimitValue);

  console.log(`[LOAN] Successfully fetched ${activeLoans.length} loans`);

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

  console.log(
    `Applied interest to ${loansProcessed} loans (batch limit ${safeLimit})`,
  );

  return {
    processed: loansProcessed,
    cursor: undefined, // No pagination cursor since we're using .take()
  };
}

// ============================================================================
// INTERNAL MUTATIONS - Each step isolated to prevent read limit accumulation
// ============================================================================

export const executeBotPurchasesMutation = internalMutation({
  args: {
    companiesLimit: v.number(),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await executeBotPurchasesAllCompanies(
      ctx,
      args.companiesLimit,
      args.offset || 0,
    );
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
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(
      `[MUTATION] applyLoanInterestMutation called with:`,
      JSON.stringify(args),
    );

    // Defensive: Ensure limit is always a valid number
    const safeArgs = {
      limit: args.limit ?? 40,
      cursor: args.cursor,
    };

    console.log(
      `[MUTATION] Calling applyLoanInterest with safeArgs:`,
      JSON.stringify(safeArgs),
    );

    return await applyLoanInterest(ctx, safeArgs);
  },
});

export const updatePlayerNetWorthMutation = internalMutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(
      `[MUTATION] updatePlayerNetWorthMutation called with:`,
      JSON.stringify(args),
    );

    // Defensive: Ensure limit is always a valid number
    const safeArgs = {
      limit: args.limit ?? 6,
      cursor: args.cursor,
    };

    console.log(
      `[MUTATION] Calling updatePlayerNetWorth with safeArgs:`,
      JSON.stringify(safeArgs),
    );

    return await updatePlayerNetWorth(ctx, safeArgs);
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
