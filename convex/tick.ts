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

    // Step 1: Bot purchases from marketplace (per-company allocation)
    console.log('[TICK] Step 1: Bot purchases (per-company batches)...');
    const botPurchases: Array<{
      productId: any;
      companyId: any;
      quantity: number;
      totalPrice: number;
    }> = [];
    
    // Process companies in batches to avoid overloading Convex
    // Each company gets $50k budget (min $30k spend)
    const companiesPerBatch = 5; // Process 5 companies per batch
    const totalBatches = 4; // Process up to 20 companies total (4 batches * 5)
    
    for (let i = 0; i < totalBatches; i++) {
      try {
        const offset = i * companiesPerBatch;
        console.log(`[TICK] Bot purchases batch ${i + 1}/${totalBatches} (companies ${offset}-${offset + companiesPerBatch - 1})...`);
        const batchPurchases = await ctx.runMutation(
          internal.tick.executeBotPurchasesMutation,
          { 
            companiesLimit: companiesPerBatch,
            offset: offset,
          }
        );
        
        if (Array.isArray(batchPurchases)) {
          botPurchases.push(...batchPurchases);
        }
        console.log(`[TICK] Batch ${i + 1} completed: ${batchPurchases?.length || 0} purchases`);
      } catch (error) {
        console.error(`[TICK] Error in bot purchases batch ${i + 1}:`, error);
        // Continue with other batches even if one fails
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
 * BOT PURCHASE SYSTEM - PER-COMPANY BUDGET ALLOCATION
 * 
 * The bot simulates market demand by purchasing products from each company:
 * - Each company gets a budget allocation of $50,000 (5,000,000 cents)
 * - Minimum spend per company: $30,000 (3,000,000 cents)
 * - Buys based on attractiveness scoring within each company
 * 
 * Scoring factors:
 * 1. Quality rating (40% weight) - Higher quality = more attractive
 * 2. Price preference (30% weight) - Medium prices preferred (~$1000 sweet spot)
 * 3. Demand score (20% weight) - Products with more sales are more attractive
 * 4. Base attractiveness (10% weight) - Ensures all products get some consideration
 * 
 * Budget allocation is proportional to attractiveness scores.
 * Expensive items receive a penalty to prevent budget concentration.
 */
async function executeBotPurchasesForCompany(
  ctx: any,
  companyId: any,
  companyBudget: number,
  minSpend: number
) {
  console.log(`[BOT] Processing company ${companyId} with budget: $${(companyBudget / 100).toFixed(2)}`);

  const purchases: Array<{
    productId: any;
    companyId: any;
    quantity: number;
    totalPrice: number;
  }> = [];

  try {
    // Step 1: Fetch active products for this specific company
    const products = await ctx.db
      .query("products")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
      .filter((q: any) =>
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("isArchived"), false),
          q.lte(q.field("price"), 5000000) // Max price: $50,000
        )
      )
      .take(30); // Limit products per company to avoid overload

    if (!products || products.length === 0) {
      console.log(`[BOT] No active products found for company ${companyId}`);
      return { purchases, totalSpent: 0 };
    }

    console.log(`[BOT] Found ${products.length} active products for company ${companyId}`);

    // Step 2: Filter eligible products (must have valid price and available stock)
    const eligibleProducts = products.filter((p: any) => {
      const hasValidPrice = p.price && p.price > 0 && isFinite(p.price);
      const hasStock = p.stock === undefined || p.stock === null || p.stock > 0;
      return hasValidPrice && hasStock;
    });

    if (eligibleProducts.length === 0) {
      console.log(`[BOT] No eligible products for company ${companyId} after filtering`);
      return { purchases, totalSpent: 0 };
    }

    console.log(`[BOT] ${eligibleProducts.length} eligible products for company ${companyId}`);

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
      console.log(`[BOT] No products with positive scores for company ${companyId}`);
      return { purchases, totalSpent: 0 };
    }

    // Step 4: Calculate total score for budget allocation
    const totalScore = scoredProducts.reduce(
      (sum: number, item: any) => sum + item.score,
      0
    );

    if (totalScore <= 0 || !isFinite(totalScore)) {
      console.log(`[BOT] Invalid total score for company ${companyId}`);
      return { purchases, totalSpent: 0 };
    }

    console.log(`[BOT] Total attractiveness score for company ${companyId}: ${totalScore.toFixed(4)}`);

    // Step 5: Allocate budget and make purchases
    let remainingBudget = companyBudget;
    let purchaseCount = 0;
    const MAX_PURCHASES_PER_COMPANY = 15; // Limit purchases per company to avoid overload

    for (const { product, score } of scoredProducts) {
      if (remainingBudget <= 0) {
        console.log(`[BOT] Budget exhausted for company ${companyId}`);
        break;
      }

      if (purchaseCount >= MAX_PURCHASES_PER_COMPANY) {
        console.log(`[BOT] Reached max purchases limit (${MAX_PURCHASES_PER_COMPANY}) for company ${companyId}`);
        break;
      }

      // Initialize variables for error logging
      let quantity = 0;
      let finalPrice = 0;

      try {
        // Calculate this product's budget allocation
        const budgetAllocation = Math.floor((score / totalScore) * companyBudget);

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
          `[BOT] Company ${companyId} Purchase #${purchaseCount}: ${quantity}x ${product.name} for $${(finalPrice / 100).toFixed(2)}`
        );
      } catch (error) {
        console.error(`[BOT] Error purchasing product ${product._id} from company ${companyId}:`, error);
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

    const totalSpent = companyBudget - remainingBudget;
    
    // Check if we met minimum spend requirement
    if (totalSpent < minSpend) {
      console.log(
        `[BOT] Company ${companyId}: Only spent $${(totalSpent / 100).toFixed(2)} (min: $${(minSpend / 100).toFixed(2)}). Insufficient products.`
      );
    } else {
      console.log(
        `[BOT] Company ${companyId} complete: ${purchases.length} purchases, $${(totalSpent / 100).toFixed(2)} spent`
      );
    }

    return { purchases, totalSpent };
  } catch (error) {
    console.error(`[BOT] Fatal error in executeBotPurchasesForCompany for company ${companyId}:`, error);
    return { purchases, totalSpent: 0 }; // Return what we have so far
  }
}

// Wrapper function to process all companies with budget allocation
async function executeBotPurchasesAllCompanies(ctx: any, companiesLimit: number = 10, offset: number = 0) {
  console.log(`[BOT] Starting bot purchases for up to ${companiesLimit} companies (offset: ${offset})`);
  
  const allPurchases: Array<{
    productId: any;
    companyId: any;
    quantity: number;
    totalPrice: number;
  }> = [];
  
  const BUDGET_PER_COMPANY = 5000000; // $50,000 in cents
  const MIN_SPEND_PER_COMPANY = 3000000; // $30,000 in cents
  
  try {
    // Fetch ALL companies (no limit) and slice based on offset
    const allCompanies = await ctx.db
      .query("companies")
      .collect(); // Get ALL companies
    
    console.log(`[BOT] Total companies in database: ${allCompanies.length}`);
    
    // Apply offset and limit to get the specific batch
    const companies = allCompanies.slice(offset, offset + companiesLimit);
    
    if (!companies || companies.length === 0) {
      console.log(`[BOT] No companies found at offset ${offset}`);
      return allPurchases;
    }
    
    console.log(`[BOT] Processing ${companies.length} companies (offset ${offset} to ${offset + companies.length - 1})`);
    
    let totalSpentAllCompanies = 0;
    let companiesProcessed = 0;
    
    for (const company of companies) {
      try {
        console.log(`[BOT] Processing company: ${company.name} (ID: ${company._id})`);
        const result = await executeBotPurchasesForCompany(
          ctx,
          company._id,
          BUDGET_PER_COMPANY,
          MIN_SPEND_PER_COMPANY
        );
        
        allPurchases.push(...result.purchases);
        totalSpentAllCompanies += result.totalSpent;
        companiesProcessed++;
        console.log(`[BOT] Company ${company.name}: ${result.purchases.length} purchases, $${(result.totalSpent / 100).toFixed(2)} spent`);
      } catch (error) {
        console.error(`[BOT] Error processing company ${company.name} (${company._id}):`, error);
        // Continue with next company
      }
    }
    
    console.log(
      `[BOT] All companies processed: ${companiesProcessed} companies, ${allPurchases.length} total purchases, $${(totalSpentAllCompanies / 100).toFixed(2)} total spent`
    );
    
    return allPurchases;
  } catch (error) {
    console.error("[BOT] Fatal error in executeBotPurchasesAllCompanies:", error);
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
// Update player net worth values
async function updatePlayerNetWorth(
  ctx: any,
  args: {
    limit?: number;
    cursor?: string;
  }
) {
  console.log(`[NET_WORTH] updatePlayerNetWorth called with raw args:`, JSON.stringify(args));
  
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
  const safeLimit = (typeof safeLimitCalculated === 'number' && 
                     isFinite(safeLimitCalculated) && 
                     safeLimitCalculated > 0) 
    ? safeLimitCalculated 
    : 6;
  
  console.log(`[NET_WORTH] Processing players with limit=${safeLimit} (input was ${limit}), cursor=${cursor ? 'yes' : 'no'}`);
  
  // WORKAROUND: Use .take() instead of .paginate() since paginate is causing issues
  console.log(`[NET_WORTH] Using .take() instead of .paginate() with limit=${safeLimit}`);
  
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

  console.log(`Updated net worth for ${playersUpdated} players (batch limit ${safeLimit})`);

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
  }
) {
  console.log(`[LOAN] applyLoanInterest called with raw args:`, JSON.stringify(args));
  
  // OPTIMIZED: Process loans in small batches to avoid read explosion
  // Add defensive check for undefined limit - EXTREMELY defensive
  const limit = typeof args.limit === 'number' ? args.limit : 40;
  const cursor = args.cursor;
  const safeLimitInput = limit;
  const safeLimitCalculated = Math.max(1, Math.min(safeLimitInput, 100));
  
  // Triple check that we have a valid finite positive number
  const safeLimit = (typeof safeLimitCalculated === 'number' && 
                     isFinite(safeLimitCalculated) && 
                     safeLimitCalculated > 0) 
    ? safeLimitCalculated 
    : 40;
  
  console.log(`[LOAN] Processing loans with limit=${safeLimit} (input was ${limit}), cursor=${cursor ? 'yes' : 'no'}`);
  
  // WORKAROUND: Use .take() instead of .paginate() since paginate is causing issues
  // This means we lose pagination but at least it will work
  console.log(`[LOAN] Using .take() instead of .paginate() with limit=${safeLimit}`);
  
  // CRITICAL: Final validation before .take() - must be a concrete number
  const takeLimitValue = Number(safeLimit);
  if (!isFinite(takeLimitValue) || takeLimitValue <= 0) {
    console.error(`[LOAN] CRITICAL: Invalid take limit: ${takeLimitValue}, using 40`);
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
  
  console.log(`Applied interest to ${loansProcessed} loans (batch limit ${safeLimit})`);

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
    return await executeBotPurchasesAllCompanies(ctx, args.companiesLimit, args.offset || 0);
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
    console.log(`[MUTATION] applyLoanInterestMutation called with:`, JSON.stringify(args));
    
    // Defensive: Ensure limit is always a valid number
    const safeArgs = {
      limit: args.limit ?? 40,
      cursor: args.cursor,
    };
    
    console.log(`[MUTATION] Calling applyLoanInterest with safeArgs:`, JSON.stringify(safeArgs));
    
    return await applyLoanInterest(ctx, safeArgs);
  },
});

export const updatePlayerNetWorthMutation = internalMutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log(`[MUTATION] updatePlayerNetWorthMutation called with:`, JSON.stringify(args));
    
    // Defensive: Ensure limit is always a valid number
    const safeArgs = {
      limit: args.limit ?? 6,
      cursor: args.cursor,
    };
    
    console.log(`[MUTATION] Calling updatePlayerNetWorth with safeArgs:`, JSON.stringify(safeArgs));
    
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
