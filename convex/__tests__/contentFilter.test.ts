/**
 * Content Filter Tests
 * Tests for profanity filtering and validation functions
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

// Import all convex modules for testing (lazy loading for convex-test)
// @ts-expect-error - Vite's import.meta.glob not in TypeScript types
const modules = import.meta.glob(["../*.*s", "../_generated/*.*s"]);

describe("Content Filter - Normal Words (False Positives Check)", () => {
  test("should allow company names with common words", async () => {
    const t = convexTest(schema, modules);
    
    const playerId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-normal-words",
      });
      
      return await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Test common words that might trigger false positives
    const validNames = [
      "Class A Solutions",
      "Assignment Management Inc",
      "Assumption Analytics",
      "Bass Pro Fishing",
      "Hello World Technologies",
      "Shell Oil Company",
      "Michelle's Bakery",
      "Essex Manufacturing",
      "Sussex Textiles",
      "Document Processing Corp",
      "Cucumber Farm Fresh",
      "Scrap Metal Works",
      "Button Factory",
      "Butter Goods",
      "Constitution Legal",
      "Title Insurance Co",
      "Pool Supply Shop",
      "Spoon Cutlery",
      "Shampoo and Care",
      "Classic Cars Inc",
      "Passion Fruit Co",
      "Graduate School Services",
      "Associate Partners LLC",
    ];

    for (const name of validNames) {
      try {
        const companyId = await t.mutation(api.companies.createCompany, {
          ownerId: playerId,
          name: name,
          ticker: "TST",
        });
        expect(companyId).toBeDefined();
      } catch (error: any) {
        throw new Error(`Valid company name "${name}" was rejected: ${error.message}`);
      }
    }
  });

  test("should allow product names with common words", async () => {
    const t = convexTest(schema, modules);
    
    const { playerId, companyId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-product-words",
      });
      
      const playerId = await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const companyId = await ctx.db.insert("companies", {
        ownerId: playerId,
        name: "Test Company",
        balance: 5000000,
        isPublic: false,
        reputationScore: 0.5,
        flaggedStatus: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { playerId, companyId };
    });

    const validProducts = [
      "Classic White Button-Down Shirt",
      "Assumption Calculator Pro",
      "Bass Guitar Strings",
      "Documentation Software",
      "Poolside Accessories",
      "Assignment Tracker App",
      "Hello Kitty Merchandise",
    ];

    for (const productName of validProducts) {
      try {
        const productId = await t.mutation(api.products.createProduct, {
          companyId: companyId,
          name: productName,
          price: 1999,
        });
        expect(productId).toBeDefined();
      } catch (error: any) {
        throw new Error(`Valid product name "${productName}" was rejected: ${error.message}`);
      }
    }
  });

  test("should allow descriptions with common words", async () => {
    const t = convexTest(schema, modules);
    
    const { playerId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-descriptions",
      });
      
      const playerId = await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { playerId };
    });

    const validDescriptions = [
      "A class-leading solution for assignment management",
      "Based on the assumption that quality matters",
      "Hello! We make the best products with passion",
      "Document processing and classification services",
      "Buttoned-up professional solutions",
      "Pool maintenance and accessory supplies",
    ];

    for (const description of validDescriptions) {
      try {
        const companyId = await t.mutation(api.companies.createCompany, {
          ownerId: playerId,
          name: "Test Company",
          description: description,
          ticker: "TST",
        });
        expect(companyId).toBeDefined();
      } catch (error: any) {
        throw new Error(`Valid description was rejected: ${error.message}`);
      }
    }
  });

  test("should allow ticker symbols with common letter combinations", async () => {
    const t = convexTest(schema, modules);
    
    const { playerId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-tickers",
      });
      
      const playerId = await ctx.db.insert("players", {
        userId,
        balance: 100000000,
        netWorth: 100000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { playerId };
    });

    const validTickers = [
      "CLASS",
      "BASS",
      "ASSUM",
      "HELLO",
      "SHELL",
      "DOCU",
      "POOL",
      "BUTT",
    ];

    for (const ticker of validTickers) {
      try {
        const companyId = await t.mutation(api.companies.createCompany, {
          ownerId: playerId,
          name: `Test Company ${ticker}`,
          ticker: ticker,
        });
        
        // Make it public with this ticker
        await t.run(async (ctx) => {
          await ctx.db.patch(companyId, {
            balance: 5000000,
          });
        });

        const stockId = await t.mutation(api.companies.makeCompanyPublic, {
          companyId: companyId,
          ownerId: playerId,
          ticker: ticker,
          sector: "tech",
        });
        
        expect(stockId).toBeDefined();
      } catch (error: any) {
        throw new Error(`Valid ticker "${ticker}" was rejected: ${error.message}`);
      }
    }
  });
});

describe("Content Filter - Profanity Detection", () => {
  test("should reject company names with profanity", async () => {
    const t = convexTest(schema, modules);
    
    const playerId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-profanity",
      });
      
      return await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Test with obvious profanity (using mild examples for testing)
    const invalidNames = [
      "Damn Good Products",
      "Holy Hell Solutions",
    ];

    for (const name of invalidNames) {
      try {
        await t.mutation(api.companies.createCompany, {
          ownerId: playerId,
          name: name,
          ticker: "TST",
        });
        // If we get here, the test should fail
        throw new Error(`Profane company name "${name}" was allowed`);
      } catch (error: any) {
        // Should throw an error about inappropriate content
        expect(error.message).toContain("inappropriate content");
      }
    }
  });

  test("should reject product names with profanity", async () => {
    const t = convexTest(schema, modules);
    
    const { playerId, companyId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-product-profanity",
      });
      
      const playerId = await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const companyId = await ctx.db.insert("companies", {
        ownerId: playerId,
        name: "Test Company",
        balance: 5000000,
        isPublic: false,
        reputationScore: 0.5,
        flaggedStatus: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { playerId, companyId };
    });

    const invalidProducts = [
      "Damn Good Product",
    ];

    for (const productName of invalidProducts) {
      try {
        await t.mutation(api.products.createProduct, {
          companyId: companyId,
          name: productName,
          price: 1999,
        });
        throw new Error(`Profane product name "${productName}" was allowed`);
      } catch (error: any) {
        expect(error.message).toContain("inappropriate content");
      }
    }
  });

  test("should reject descriptions with profanity", async () => {
    const t = convexTest(schema, modules);
    
    const playerId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-description-profanity",
      });
      
      return await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const invalidDescriptions = [
      "This is a damn good company",
      "We make hell of a product",
    ];

    for (const description of invalidDescriptions) {
      try {
        await t.mutation(api.companies.createCompany, {
          ownerId: playerId,
          name: "Test Company",
          description: description,
          ticker: "TST",
        });
        throw new Error(`Profane description was allowed`);
      } catch (error: any) {
        expect(error.message).toContain("inappropriate content");
      }
    }
  });

  test("should reject ticker symbols with profanity", async () => {
    const t = convexTest(schema, modules);
    
    const playerId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-ticker-profanity",
      });
      
      return await ctx.db.insert("players", {
        userId,
        balance: 100000000,
        netWorth: 100000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const invalidTickers = [
      "DAMN",
      "HELL",
    ];

    for (const ticker of invalidTickers) {
      try {
        const companyId = await t.mutation(api.companies.createCompany, {
          ownerId: playerId,
          name: `Test Company ${ticker}`,
          ticker: ticker,
        });
        
        await t.run(async (ctx) => {
          await ctx.db.patch(companyId, {
            balance: 5000000,
          });
        });

        await t.mutation(api.companies.makeCompanyPublic, {
          companyId: companyId,
          ownerId: playerId,
          ticker: ticker,
          sector: "tech",
        });
        
        throw new Error(`Profane ticker "${ticker}" was allowed`);
      } catch (error: any) {
        expect(error.message).toContain("inappropriate content");
      }
    }
  });

  test("should reject tags with profanity", async () => {
    const t = convexTest(schema, modules);
    
    const { playerId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-tags-profanity",
      });
      
      const playerId = await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { playerId };
    });

    try {
      await t.mutation(api.companies.createCompany, {
        ownerId: playerId,
        name: "Test Company",
        tags: ["tech", "innovation", "damn"],
        ticker: "TST",
      });
      throw new Error("Profane tag was allowed");
    } catch (error: any) {
      expect(error.message).toContain("inappropriate content");
    }
  });
});

describe("Content Filter - Edge Cases", () => {
  test("should handle empty and whitespace-only inputs", async () => {
    const t = convexTest(schema, modules);
    
    const playerId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-empty",
      });
      
      return await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Empty name should be rejected
    try {
      await t.mutation(api.companies.createCompany, {
        ownerId: playerId,
        name: "   ",
        ticker: "TST",
      });
      throw new Error("Empty name was allowed");
    } catch (error: any) {
      expect(error.message).toContain("cannot be empty");
    }

    // Empty description should be treated as undefined (optional)
    const companyId = await t.mutation(api.companies.createCompany, {
      ownerId: playerId,
      name: "Valid Company",
      description: "   ",
      ticker: "TST",
    });
    
    const company = await t.run(async (ctx) => {
      return await ctx.db.get(companyId);
    });
    
    expect((company as any)?.description).toBeUndefined();
  });

  test("should enforce length limits", async () => {
    const t = convexTest(schema, modules);
    
    const playerId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-length",
      });
      
      return await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Name too long (over 100 chars)
    try {
      await t.mutation(api.companies.createCompany, {
        ownerId: playerId,
        name: "A".repeat(101),
        ticker: "TST",
      });
      throw new Error("Too-long name was allowed");
    } catch (error: any) {
      expect(error.message).toContain("too long");
    }

    // Description too long (over 1000 chars)
    try {
      await t.mutation(api.companies.createCompany, {
        ownerId: playerId,
        name: "Valid Company",
        description: "A".repeat(1001),
        ticker: "TST",
      });
      throw new Error("Too-long description was allowed");
    } catch (error: any) {
      expect(error.message).toContain("too long");
    }

    // Tag too long (over 30 chars)
    try {
      await t.mutation(api.companies.createCompany, {
        ownerId: playerId,
        name: "Valid Company",
        tags: ["A".repeat(31)],
        ticker: "TST",
      });
      throw new Error("Too-long tag was allowed");
    } catch (error: any) {
      expect(error.message).toContain("too long");
    }

    // Ticker too long (over 6 chars)
    try {
      const companyId = await t.mutation(api.companies.createCompany, {
        ownerId: playerId,
        name: "Valid Company",
        ticker: "TST",
      });
      
      await t.run(async (ctx) => {
        await ctx.db.patch(companyId, {
          balance: 5000000,
        });
      });

      await t.mutation(api.companies.makeCompanyPublic, {
        companyId: companyId,
        ownerId: playerId,
        ticker: "A".repeat(7),
        sector: "tech",
      });
      
      throw new Error("Too-long ticker was allowed");
    } catch (error: any) {
      expect(error.message).toContain("too long");
    }
  });

  test("should trim whitespace from inputs", async () => {
    const t = convexTest(schema, modules);
    
    const playerId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: "test-trim",
      });
      
      return await ctx.db.insert("players", {
        userId,
        balance: 10000000,
        netWorth: 10000000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const companyId = await t.mutation(api.companies.createCompany, {
      ownerId: playerId,
      name: "  Test Company  ",
      description: "  A great company  ",
      ticker: "TST",
    });

    const company = await t.run(async (ctx) => {
      return await ctx.db.get(companyId);
    });

    expect((company as any)?.name).toBe("Test Company");
    expect((company as any)?.description).toBe("A great company");
  });
});

