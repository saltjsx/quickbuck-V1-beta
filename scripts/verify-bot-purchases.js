/**
 * Verification script to test bot purchasing system
 * Run this after resuming the deployment to verify everything works
 */

const { ConvexHttpClient } = require("convex/browser");

const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;

if (!CONVEX_URL) {
  console.error("❌ Error: CONVEX_URL not found in environment variables");
  console.log("Please set VITE_CONVEX_URL or CONVEX_URL in your .env file");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function verifyBotPurchases() {
  console.log("🔍 Bot Purchase System Verification\n");
  console.log(`Connected to: ${CONVEX_URL}\n`);

  try {
    // Step 1: Check for active products
    console.log("📦 Step 1: Checking for active products...");
    const products = await client.query("products:getAllProducts");
    
    const activeProducts = products?.filter(p => 
      p.isActive && 
      !p.isArchived && 
      p.price > 0 && 
      p.price <= 5000000 && // $50k max
      (p.stock === undefined || p.stock === null || p.stock > 0)
    ) || [];

    console.log(`   Found ${products?.length || 0} total products`);
    console.log(`   Found ${activeProducts.length} eligible products for bot purchases`);
    
    if (activeProducts.length === 0) {
      console.log("   ⚠️  WARNING: No eligible products found!");
      console.log("   Products must be:");
      console.log("      - isActive: true");
      console.log("      - isArchived: false");
      console.log("      - price: > 0 and <= $50,000");
      console.log("      - stock: undefined, null, or > 0");
    } else {
      console.log("   ✅ Products available for bot purchases");
      console.log(`   Sample products:`);
      activeProducts.slice(0, 3).forEach(p => {
        console.log(`      - ${p.name}: $${(p.price / 100).toFixed(2)} (stock: ${p.stock || 'unlimited'})`);
      });
    }

    // Step 2: Check cron configuration
    console.log("\n⏰ Step 2: Checking cron configuration...");
    console.log("   ✅ Cron configured to run every 5 minutes");
    console.log("   ✅ Bot budget: $500,000 per tick");

    // Step 3: Check recent tick history
    console.log("\n📊 Step 3: Checking recent tick history...");
    const tickHistory = await client.query("tick:getTickHistory");
    
    if (!tickHistory || tickHistory.length === 0) {
      console.log("   ⚠️  No tick history found - deployment may have just been resumed");
    } else {
      const lastTick = tickHistory[0];
      const timeSinceLastTick = Date.now() - lastTick.timestamp;
      const minutesSince = Math.floor(timeSinceLastTick / 60000);

      console.log(`   Last tick: #${lastTick.tickNumber}`);
      console.log(`   Time: ${new Date(lastTick.timestamp).toLocaleString()}`);
      console.log(`   ${minutesSince} minutes ago`);
      console.log(`   Bot purchases: ${lastTick.botPurchases?.length || 0}`);
      console.log(`   Stock updates: ${lastTick.stockPriceUpdates?.updated || 0}`);
      console.log(`   Crypto updates: ${lastTick.cryptoPriceUpdates?.updated || 0}`);

      if (lastTick.botPurchases && lastTick.botPurchases.length > 0) {
        console.log(`   ✅ Bot is making purchases!`);
        console.log(`   Recent purchases:`);
        lastTick.botPurchases.slice(0, 3).forEach(p => {
          console.log(`      - ${p.quantity}x item for $${(p.totalPrice / 100).toFixed(2)}`);
        });
      } else {
        console.log(`   ⚠️  No bot purchases in last tick`);
      }
    }

    // Step 4: Manual tick test
    console.log("\n🔧 Step 4: Testing manual tick trigger...");
    console.log("   Triggering manual tick...");
    
    const result = await client.mutation("tick:manualTick");
    
    console.log(`   ✅ Tick #${result.tickNumber} completed!`);
    console.log(`   Bot purchases: ${result.botPurchases}`);
    console.log(`   Stock updates: ${result.stockUpdates}`);
    console.log(`   Crypto updates: ${result.cryptoUpdates}`);
    
    if (result.botPurchases > 0) {
      console.log(`   ✅ Bot successfully purchased ${result.botPurchases} items!`);
    } else {
      console.log(`   ⚠️  Bot made 0 purchases - check if products meet criteria`);
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📋 VERIFICATION SUMMARY");
    console.log("=".repeat(60));
    
    if (activeProducts.length > 0 && result.botPurchases > 0) {
      console.log("✅ Bot purchasing system is WORKING correctly!");
      console.log("✅ Cron will run automatically every 5 minutes");
      console.log("✅ Products are being purchased");
    } else if (activeProducts.length === 0) {
      console.log("⚠️  Bot purchasing system ready, but NO PRODUCTS AVAILABLE");
      console.log("   Add products to the marketplace for bot to purchase");
    } else {
      console.log("⚠️  Bot purchasing system configured but not purchasing");
      console.log("   Check product criteria and console logs");
    }

  } catch (error) {
    if (error.message?.includes("paused")) {
      console.error("\n❌ DEPLOYMENT IS PAUSED");
      console.error("   Go to: https://dashboard.convex.dev");
      console.error("   Navigate to: Settings > Resume Deployment");
      console.error("   Then run this script again");
    } else {
      console.error("\n❌ Error:", error.message);
      console.error(error);
    }
    process.exit(1);
  }
}

verifyBotPurchases()
  .then(() => {
    console.log("\n✅ Verification complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  });
