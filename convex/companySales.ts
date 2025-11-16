import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Mutation: List company for sale
export const listCompanyForSale = mutation({
  args: {
    companyId: v.id("companies"),
    askingPrice: v.number(), // in cents
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    // Check if already listed
    const existing = await ctx.db
      .query("companySales")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .filter((q) => q.eq(q.field("status"), "listed"))
      .first();

    if (existing) {
      throw new Error("Company is already listed for sale");
    }

    const now = Date.now();

    const saleId = await ctx.db.insert("companySales", {
      companyId: args.companyId,
      sellerId: company.ownerId,
      askingPrice: args.askingPrice,
      status: "listed" as const,
      createdAt: now,
      updatedAt: now,
    });

    return saleId;
  },
});

// Mutation: Buy company directly (instant purchase at asking price)
export const buyCompanyDirectly = mutation({
  args: {
    saleId: v.id("companySales"),
    buyerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const sale = await ctx.db.get(args.saleId);
    if (!sale) {
      throw new Error("Sale listing not found");
    }

    if (sale.status !== "listed") {
      throw new Error("Company is not available for purchase");
    }

    const company = await ctx.db.get(sale.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    // Check buyer isn't the owner
    if (company.ownerId === args.buyerId) {
      throw new Error("Cannot buy your own company");
    }

    const buyer = await ctx.db.get(args.buyerId);
    if (!buyer) {
      throw new Error("Buyer not found");
    }

    // Check buyer balance
    if (buyer.balance < sale.askingPrice) {
      throw new Error("Insufficient balance");
    }

    // HARD LIMIT: Check if buyer has reached max companies (5)
    const buyerCompanies = await ctx.db
      .query("companies")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.buyerId))
      .collect();

    if (buyerCompanies.length >= 5) {
      throw new Error("You have reached the maximum limit of 5 companies. Delete an existing company to purchase this one.");
    }

    const now = Date.now();

    // Transfer payment
    await ctx.db.patch(args.buyerId, {
      balance: buyer.balance - sale.askingPrice,
      updatedAt: now,
    });

    const seller = await ctx.db.get(sale.sellerId);
    if (seller) {
      await ctx.db.patch(sale.sellerId, {
        balance: seller.balance + sale.askingPrice,
        updatedAt: now,
      });
    }

    // Transfer company ownership
    await ctx.db.patch(sale.companyId, {
      ownerId: args.buyerId,
      updatedAt: now,
    });

    // Update sale status
    await ctx.db.patch(args.saleId, {
      status: "accepted" as const,
      buyerId: args.buyerId,
      updatedAt: now,
    });

    // Create transaction
    await ctx.db.insert("transactions", {
      fromAccountId: args.buyerId,
      fromAccountType: "player" as const,
      toAccountId: sale.sellerId,
      toAccountType: "player" as const,
      amount: sale.askingPrice,
      assetType: "cash" as const,
      description: `Purchased company: ${company.name}`,
      createdAt: now,
    });

    return { success: true, newOwnerId: args.buyerId };
  },
});

// Mutation: Unlist company from sale
export const unlistCompany = mutation({
  args: {
    companyId: v.id("companies"),
    sellerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    // Verify ownership
    if (company.ownerId !== args.sellerId) {
      throw new Error("Only the company owner can unlist the company");
    }

    // Find active listing
    const listing = await ctx.db
      .query("companySales")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .filter((q) => q.eq(q.field("status"), "listed"))
      .first();

    if (!listing) {
      throw new Error("No active listing found for this company");
    }

    // Update status to cancelled
    await ctx.db.patch(listing._id, {
      status: "cancelled" as const,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Query: Get all companies for sale
export const getAllCompaniesForSale = query({
  handler: async (ctx) => {
    const sales = await ctx.db
      .query("companySales")
      .withIndex("by_status", (q) => q.eq("status", "listed"))
      .collect();

    // Enrich with company and seller data
    const enrichedSales = await Promise.all(
      sales.map(async (sale) => {
        const company = await ctx.db.get(sale.companyId);
        const seller = await ctx.db.get(sale.sellerId);
        return {
          ...sale,
          company,
          seller,
        };
      })
    );

    return enrichedSales.filter((s) => s.company && s.seller);
  },
});

// Query: Get player's listed companies
export const getPlayerListedCompanies = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const listings = await ctx.db
      .query("companySales")
      .withIndex("by_sellerId", (q) => q.eq("sellerId", args.playerId))
      .filter((q) => q.eq(q.field("status"), "listed"))
      .collect();

    // Enrich with company data
    const enrichedListings = await Promise.all(
      listings.map(async (listing) => {
        const company = await ctx.db.get(listing.companyId);
        return {
          ...listing,
          company,
        };
      })
    );

    return enrichedListings.filter((l) => l.company);
  },
});
