import { internalMutation } from "./_generated/server";

// Auto-delete inactive products, companies, and crypto
export const cleanupInactiveItems = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const INACTIVE_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

    let deletedCount = {
      products: 0,
      companies: 0,
      crypto: 0,
      users: 0,
    };

    // 1. Delete inactive products (isActive = false for > 30 days)
    const allProducts = await ctx.db.query("products").collect();
    for (const product of allProducts) {
      if (!product.isActive) {
        const inactiveDuration = now - (product.updatedAt || product.createdAt);
        if (inactiveDuration > INACTIVE_THRESHOLD) {
          // Delete the product
          await ctx.db.delete(product._id);
          deletedCount.products++;
        }
      }
    }

    // 2. Delete companies with no active products and flagged status
    const allCompanies = await ctx.db.query("companies").collect();
    for (const company of allCompanies) {
      const companyProducts = await ctx.db
        .query("products")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .collect();

      const hasActiveProducts = companyProducts.some((p) => p.isActive);
      
      // Delete if company has been flagged and has no active products for 30+ days
      if (company.flaggedStatus && !hasActiveProducts) {
        const inactiveDuration = now - (company.updatedAt || company.createdAt);
        if (inactiveDuration > INACTIVE_THRESHOLD) {
          // Delete all company's products first
          for (const product of companyProducts) {
            await ctx.db.delete(product._id);
          }
          // Delete company
          await ctx.db.delete(company._id);
          deletedCount.companies++;
        }
      }
    }

    // 3. Delete stale cryptocurrencies (no activity for > 90 days)
    // Note: Crypto doesn't have isActive field, so we check for old/unused ones
    const allCryptos = await ctx.db.query("cryptocurrencies").collect();
    const CRYPTO_STALE_THRESHOLD = 90 * 24 * 60 * 60 * 1000; // 90 days
    
    for (const crypto of allCryptos) {
      const staleDuration = now - crypto.lastUpdated;
      if (staleDuration > CRYPTO_STALE_THRESHOLD) {
        // Only delete if no one has any balance in it
        const holders = await ctx.db
          .query("playerCryptoWallets")
          .withIndex("by_player_crypto")
          .collect();
        
        const hasHolders = holders.some(w => w.cryptoId === crypto._id && w.balance > 0);
        
        if (!hasHolders) {
          await ctx.db.delete(crypto._id);
          deletedCount.crypto++;
        }
      }
    }

    // 4. Delete users without names (nameless accounts)
    const allUsers = await ctx.db.query("users").collect();
    for (const user of allUsers) {
      if (!user.name || user.name.trim() === "") {
        // Find associated player
        const player = await ctx.db
          .query("players")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .unique();

        if (player) {
          // Delete player's companies and their products
          const playerCompanies = await ctx.db
            .query("companies")
            .withIndex("by_ownerId", (q) => q.eq("ownerId", player._id))
            .collect();

          for (const company of playerCompanies) {
            const companyProducts = await ctx.db
              .query("products")
              .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
              .collect();
            for (const product of companyProducts) {
              await ctx.db.delete(product._id);
            }
            await ctx.db.delete(company._id);
          }

          // Delete player
          await ctx.db.delete(player._id);
        }

        // Delete user
        await ctx.db.delete(user._id);
        deletedCount.users++;
      }
    }

    console.log(
      `[CLEANUP] Deleted ${deletedCount.products} products, ${deletedCount.companies} companies, ${deletedCount.crypto} cryptocurrencies, ${deletedCount.users} nameless users`
    );

    return deletedCount;
  },
});
