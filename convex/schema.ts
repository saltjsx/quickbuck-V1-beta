import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    clerkUsername: v.optional(v.string()), // Clerk username identifier
    tokenIdentifier: v.string(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // Game tables
  players: defineTable({
    userId: v.id("users"),
    balance: v.number(), // in cents
    netWorth: v.number(), // in cents, calculated field
    role: v.optional(
      v.union(
        v.literal("normal"),
        v.literal("limited"),
        v.literal("banned"),
        v.literal("mod"),
        v.literal("admin")
      )
    ), // Player role - defaults to "normal"
    limitReason: v.optional(v.string()), // Reason for limited account
    banReason: v.optional(v.string()), // Reason for ban
    warnings: v.optional(
      v.array(
        v.object({
          reason: v.string(),
          createdAt: v.number(),
        })
      )
    ), // List of warnings
    warningCount: v.optional(v.number()), // Total warnings (for quick access)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_role", ["role"])
    .index("by_balance", ["balance"])
    .index("by_netWorth", ["netWorth"]),

  companies: defineTable({
    ownerId: v.id("players"),
    name: v.string(),
    description: v.optional(v.string()),
    logo: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    sector: v.optional(v.string()), // e.g., "tech", "energy", "finance", "healthcare", "consumer"
    balance: v.number(), // in cents
    isPublic: v.boolean(),
    reputationScore: v.number(), // 0-1
    flaggedStatus: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Legacy fields - to be removed via migration
    ticker: v.optional(v.string()),
    marketCap: v.optional(v.number()),
    sharesOutstanding: v.optional(v.number()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_isPublic", ["isPublic"])
    .index("by_marketCap", ["marketCap"]),

  products: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(), // in cents
    productionCostPercentage: v.optional(v.number()), // 0-1, percentage of price (e.g., 0.35 = 35%)
    productionCost: v.optional(v.number()), // DEPRECATED: old field, kept for backwards compatibility
    image: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    stock: v.optional(v.number()), // null means unlimited
    totalRevenue: v.number(), // in cents
    totalSold: v.number(),
    recentSalesCount: v.optional(v.number()), // sliding window
    qualityRating: v.number(), // 0-1
    isActive: v.boolean(),
    isArchived: v.boolean(),
    maxPerOrder: v.optional(v.number()),
    lastPriceChange: v.optional(v.number()), // timestamp of last price change
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_isActive", ["isActive"])
    .index("by_price", ["price"])
    .index("by_totalRevenue", ["totalRevenue"])
    .index("by_isActive_totalRevenue", ["isActive", "totalRevenue"]),

  carts: defineTable({
    userId: v.id("players"),
    totalPrice: v.number(), // in cents
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  cartItems: defineTable({
    cartId: v.id("carts"),
    productId: v.id("products"),
    quantity: v.number(),
    pricePerUnit: v.number(), // in cents, snapshot at add time
  })
    .index("by_cartId", ["cartId"])
    .index("by_productId", ["productId"]),

  transactions: defineTable({
    fromAccountId: v.union(v.id("players"), v.id("companies")),
    fromAccountType: v.union(v.literal("player"), v.literal("company")),
    toAccountId: v.union(v.id("players"), v.id("companies")),
    toAccountType: v.union(v.literal("player"), v.literal("company")),
    amount: v.number(), // in cents
    assetType: v.union(
      v.literal("cash"),
      v.literal("stock"),
      v.literal("product"),
      v.literal("crypto")
    ),
    assetId: v.optional(v.string()), // id of stock/crypto/product if applicable
    linkedLoanId: v.optional(v.id("loans")), // For audit trail and duplicate detection
    description: v.string(),
    createdAt: v.number(),
  })
    .index("by_fromAccountId", ["fromAccountId"])
    .index("by_toAccountId", ["toAccountId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_linkedLoanId", ["linkedLoanId"])
    .index("by_fromAccountId_assetType", ["fromAccountId", "assetType"])
    .index("by_fromAccountId_createdAt", ["fromAccountId", "createdAt"]),

  loans: defineTable({
    playerId: v.id("players"),
    amount: v.number(), // in cents, original amount
    interestRate: v.number(), // percentage, e.g., 5 for 5%
    remainingBalance: v.number(), // in cents
    accruedInterest: v.number(), // in cents
    createdAt: v.number(),
    dueDate: v.optional(v.number()),
    lastInterestApplied: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("paid"),
      v.literal("defaulted")
    ),
    idempotencyKey: v.optional(v.string()), // For duplicate request detection
  })
    .index("by_playerId", ["playerId"])
    .index("by_status", ["status"])
    .index("by_playerId_createdAt", ["playerId", "createdAt"]),

  marketplaceListings: defineTable({
    productId: v.id("products"),
    sellerCompanyId: v.id("companies"),
    quantity: v.number(),
    listedPrice: v.number(), // in cents
    soldQuantity: v.number(),
    createdAt: v.number(),
  })
    .index("by_productId", ["productId"])
    .index("by_sellerCompanyId", ["sellerCompanyId"]),

  companyShares: defineTable({
    companyId: v.id("companies"),
    userId: v.id("players"),
    shares: v.number(),
    purchasePrice: v.number(), // in cents per share
    purchasedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_userId", ["userId"])
    .index("by_userId_companyId", ["userId", "companyId"]),

  marketplaceSales: defineTable({
    productId: v.id("products"),
    companyId: v.id("companies"),
    quantity: v.number(),
    purchaserId: v.union(v.id("players"), v.literal("bot")),
    purchaserType: v.union(v.literal("player"), v.literal("bot")),
    totalPrice: v.number(), // in cents
    createdAt: v.number(),
  })
    .index("by_productId", ["productId"])
    .index("by_companyId", ["companyId"])
    .index("by_purchaserId", ["purchaserId"])
    .index("by_createdAt", ["createdAt"]),

  companySales: defineTable({
    companyId: v.id("companies"),
    sellerId: v.id("players"), // current owner listing company
    buyerId: v.optional(v.id("players")), // player making offer
    askingPrice: v.number(), // in cents, seller's asking price
    offeredPrice: v.optional(v.number()), // in cents, buyer's offer
    counterOfferPrice: v.optional(v.number()), // in cents
    status: v.union(
      v.literal("listed"),
      v.literal("offer_pending"),
      v.literal("counter_offer"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("cancelled")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_sellerId", ["sellerId"])
    .index("by_buyerId", ["buyerId"])
    .index("by_status", ["status"]),

  tickHistory: defineTable({
    tickNumber: v.number(),
    timestamp: v.number(),
    botPurchases: v.array(
      v.object({
        productId: v.id("products"),
        companyId: v.id("companies"),
        quantity: v.number(),
        totalPrice: v.number(),
      })
    ),
    cryptoPriceUpdates: v.optional(
      v.array(
        v.object({
          cryptoId: v.id("cryptocurrencies"),
          oldPrice: v.number(),
          newPrice: v.number(),
        })
      )
    ),
    // Legacy field from old stock system
    stockPriceUpdates: v.optional(v.any()),
    totalBudgetSpent: v.number(), // in cents
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_tickNumber", ["tickNumber"]),

  // Upgrades system
  upgrades: defineTable({
    playerId: v.id("players"),
    upgradeType: v.string(), // e.g., "interest_boost", "stock_returns_boost"
    name: v.string(),
    description: v.string(),
    cost: v.number(), // in cents
    benefit: v.string(), // e.g., "+10% Daily Interest Rate"
    isActive: v.boolean(),
    purchasedAt: v.number(),
  })
    .index("by_playerId", ["playerId"])
    .index("by_upgradeType", ["upgradeType"]),

  // Gambling history
  gamblingHistory: defineTable({
    playerId: v.id("players"),
    gameType: v.union(
      v.literal("slots"),
      v.literal("blackjack"),
      v.literal("dice"),
      v.literal("roulette")
    ),
    betAmount: v.number(), // in cents
    payout: v.number(), // in cents
    result: v.union(v.literal("win"), v.literal("loss")),
    details: v.optional(v.any()), // game-specific details
    timestamp: v.number(),
  })
    .index("by_playerId", ["playerId"])
    .index("by_gameType", ["gameType"])
    .index("by_timestamp", ["timestamp"]),

  // Configuration table for game settings
  gameConfig: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Player marketplace inventory
  playerInventory: defineTable({
    playerId: v.id("players"),
    productId: v.id("products"),
    quantity: v.number(),
    purchasedAt: v.number(),
    totalPrice: v.number(), // total price paid for these items in cents
  })
    .index("by_playerId", ["playerId"])
    .index("by_productId", ["productId"])
    .index("by_playerId_productId", ["playerId", "productId"]),

  subscriptions: defineTable({
    userId: v.optional(v.string()),
    polarId: v.optional(v.string()),
    polarPriceId: v.optional(v.string()),
    currency: v.optional(v.string()),
    interval: v.optional(v.string()),
    status: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    amount: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    customerCancellationReason: v.optional(v.string()),
    customerCancellationComment: v.optional(v.string()),
    metadata: v.optional(v.any()),
    customFieldData: v.optional(v.any()),
    customerId: v.optional(v.string()),
  })
    .index("userId", ["userId"])
    .index("polarId", ["polarId"]),
  webhookEvents: defineTable({
    type: v.string(),
    polarEventId: v.string(),
    createdAt: v.string(),
    modifiedAt: v.string(),
    data: v.any(),
  })
    .index("type", ["type"])
    .index("polarEventId", ["polarEventId"]),

  globalAlerts: defineTable({
    createdBy: v.id("players"), // admin who created it
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("success"),
      v.literal("error")
    ), // alert type/color
    readBy: v.optional(v.array(v.id("players"))), // players who have seen it (starts empty)
    sentAt: v.number(), // timestamp when sent
    createdAt: v.number(),
  }).index("by_sentAt", ["sentAt"]),

  // Active blackjack games
  blackjackGames: defineTable({
    playerId: v.id("players"),
    betAmount: v.number(), // in cents
    playerHand: v.array(v.number()),
    dealerHand: v.array(v.number()),
    deck: v.array(v.number()),
    gameState: v.union(
      v.literal("playing"),
      v.literal("player_bust"),
      v.literal("dealer_bust"),
      v.literal("player_win"),
      v.literal("dealer_win"),
      v.literal("push"),
      v.literal("blackjack")
    ),
    playerStood: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_playerId", ["playerId"])
    .index("by_playerId_updatedAt", ["playerId", "updatedAt"]),

  // Cryptocurrency system
  cryptocurrencies: defineTable({
    name: v.string(), // e.g., "GameCoin"
    symbol: v.string(), // e.g., "GMC"
    description: v.optional(v.string()), // user-provided description
    tags: v.optional(v.array(v.string())), // user-provided tags
    imageUrl: v.optional(v.string()), // user-provided image URL/link
    createdByPlayerId: v.optional(v.id("players")), // player who created this crypto
    totalSupply: v.number(),
    circulatingSupply: v.number(),
    currentPrice: v.number(), // in cents
    marketCap: v.number(), // in cents
    liquidity: v.number(), // simulated pool for price impact
    baseVolatility: v.number(), // daily volatility factor (0.05-0.2)
    trendDrift: v.number(), // current trend direction (-0.01 to 0.01)
    lastVolatilityUpdate: v.number(), // for volatility clustering
    lastPriceChange: v.number(), // for momentum calculation
    createdAt: v.number(),
    lastUpdated: v.number(),
  })
    .index("by_symbol", ["symbol"])
    .index("by_createdByPlayerId", ["createdByPlayerId"]),

  cryptoPriceHistory: defineTable({
    cryptoId: v.id("cryptocurrencies"),
    timestamp: v.number(),
    open: v.number(), // in cents
    high: v.number(), // in cents
    low: v.number(), // in cents
    close: v.number(), // in cents
    volume: v.number(), // aggregated trades in interval
  })
    .index("by_crypto_time", ["cryptoId", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  playerCryptoWallets: defineTable({
    playerId: v.id("players"),
    cryptoId: v.id("cryptocurrencies"),
    balance: v.number(), // amount of coins owned
    totalInvested: v.number(), // in cents, total money spent
    averagePurchasePrice: v.number(), // in cents per coin
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_player_crypto", ["playerId", "cryptoId"])
    .index("by_playerId", ["playerId"])
    .index("by_cryptoId", ["cryptoId"]),

  cryptoTransactions: defineTable({
    playerId: v.id("players"),
    cryptoId: v.id("cryptocurrencies"),
    type: v.union(v.literal("buy"), v.literal("sell")),
    amount: v.number(), // coins
    pricePerCoin: v.number(), // in cents
    totalValue: v.number(), // in cents
    priceImpact: v.number(), // percentage
    timestamp: v.number(),
  })
    .index("by_playerId", ["playerId"])
    .index("by_cryptoId", ["cryptoId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_player_crypto_time", ["playerId", "cryptoId", "timestamp"]),

  // Stock Market System
  stocks: defineTable({
    name: v.optional(v.string()), // e.g., "TechCorp"
    symbol: v.optional(v.string()), // e.g., "TCH"
    outstandingShares: v.optional(v.number()),
    currentPrice: v.optional(v.number()), // in cents
    marketCap: v.optional(v.number()), // in cents (currentPrice * outstandingShares)
    liquidity: v.optional(v.number()), // simulated pool size for price impact
    sector: v.optional(v.string()), // e.g., "tech", "energy", "finance", "healthcare", "consumer"
    fairValue: v.optional(v.number()), // in cents, simulated intrinsic value for mean reversion
    lastPriceChange: v.optional(v.number()), // for momentum tracking
    volatility: v.optional(v.number()), // current volatility factor
    trendMomentum: v.optional(v.number()), // short-term trend direction
    lastVolatilityCluster: v.optional(v.number()), // timestamp of last high volatility event
    createdAt: v.optional(v.number()),
    lastUpdated: v.optional(v.number()),
    // Legacy fields from old company-based stock system
    companyId: v.optional(v.id("companies")),
    ticker: v.optional(v.string()),
    price: v.optional(v.number()),
    totalShares: v.optional(v.number()),
    previousPrice: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_symbol", ["symbol"])
    .index("by_sector", ["sector"]),

  stockPriceHistory: defineTable({
    stockId: v.id("stocks"),
    timestamp: v.number(),
    open: v.optional(v.number()), // in cents
    high: v.optional(v.number()), // in cents
    low: v.optional(v.number()), // in cents
    close: v.optional(v.number()), // in cents
    volume: v.optional(v.number()), // aggregated trades in interval
    // Legacy field
    price: v.optional(v.number()),
  })
    .index("by_stock_time", ["stockId", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  playerStockPortfolios: defineTable({
    playerId: v.id("players"),
    stockId: v.id("stocks"),
    shares: v.number(),
    averageCost: v.number(), // in cents per share
    totalInvested: v.number(), // in cents
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_player_stock", ["playerId", "stockId"])
    .index("by_playerId", ["playerId"])
    .index("by_stockId", ["stockId"]),

  stockTransactions: defineTable({
    playerId: v.id("players"),
    stockId: v.id("stocks"),
    type: v.union(v.literal("buy"), v.literal("sell")),
    shares: v.number(),
    pricePerShare: v.number(), // in cents
    totalValue: v.number(), // in cents
    priceImpact: v.number(), // percentage
    timestamp: v.number(),
  })
    .index("by_playerId", ["playerId"])
    .index("by_stockId", ["stockId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_player_stock_time", ["playerId", "stockId", "timestamp"]),

  companyStockPortfolios: defineTable({
    companyId: v.id("companies"),
    stockId: v.id("stocks"),
    shares: v.number(),
    averageCost: v.number(), // in cents per share
    totalInvested: v.number(), // in cents
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_stock", ["companyId", "stockId"])
    .index("by_companyId", ["companyId"])
    .index("by_stockId", ["stockId"]),

  companyStockTransactions: defineTable({
    companyId: v.id("companies"),
    stockId: v.id("stocks"),
    type: v.union(v.literal("buy"), v.literal("sell")),
    shares: v.number(),
    pricePerShare: v.number(), // in cents
    totalValue: v.number(), // in cents
    priceImpact: v.number(), // percentage
    timestamp: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_stockId", ["stockId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_company_stock_time", ["companyId", "stockId", "timestamp"]),

  gameRules: defineTable({
    content: v.string(), // Single text field containing all rules
    lastUpdatedBy: v.id("players"),
    lastUpdatedAt: v.number(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  emailBlacklist: defineTable({
    email: v.string(),
    reason: v.string(), // Reason for blacklisting
    bannedByAdminId: v.id("players"),
    bannedAt: v.number(),
    originalPlayerName: v.optional(v.string()), // Store for reference
  }).index("by_email", ["email"]),

  moderatorMessages: defineTable({
    recipientPlayerId: v.id("players"),
    senderPlayerId: v.id("players"),
    senderName: v.string(),
    message: v.string(),
    isRead: v.boolean(),
    sentAt: v.number(),
    isMod: v.optional(v.boolean()), // True when sent from mod panel, false for regular messages
  })
    .index("by_recipientPlayerId", ["recipientPlayerId"])
    .index("by_senderPlayerId", ["senderPlayerId"])
    .index("by_recipient_read", ["recipientPlayerId", "isRead"]),

  // Player-to-player messages (separate from moderator messages)
  messages: defineTable({
    senderId: v.id("players"),
    recipientId: v.id("players"),
    senderName: v.string(),
    subject: v.optional(v.string()),
    content: v.string(),
    isRead: v.boolean(),
    sentAt: v.number(),
    isMod: v.boolean(), // True when sent from mod panel
  })
    .index("by_recipientId", ["recipientId"])
    .index("by_senderId", ["senderId"])
    .index("by_recipient_read", ["recipientId", "isRead"])
    .index("by_sentAt", ["sentAt"]),

  // Player tags (admin-only feature)
  playerTags: defineTable({
    playerId: v.id("players"),
    tagText: v.string(), // Text shown in the tag box
    tagColor: v.string(), // Color of text in the tag box (e.g., "#FF0000")
    usernameColor: v.optional(v.string()), // Custom username text color (e.g., "#00FF00")
    createdByAdminId: v.id("players"), // Admin who created/edited this tag
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_playerId", ["playerId"])
    .index("by_createdByAdminId", ["createdByAdminId"]),
});
