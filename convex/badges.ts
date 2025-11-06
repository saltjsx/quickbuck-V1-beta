import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { hasPermission } from "./moderation";

/**
 * Query: Get all badges
 */
export const getAllBadges = query({
  handler: async (ctx) => {
    const badges = await ctx.db.query("badges").collect();
    return badges;
  },
});

/**
 * Query: Get badges for a specific player
 */
export const getPlayerBadges = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const playerBadges = await ctx.db
      .query("playerBadges")
      .withIndex("by_playerId", (q) => q.eq("playerId", args.playerId))
      .collect();

    // Enrich with badge details
    const badges = await Promise.all(
      playerBadges.map(async (pb) => {
        const badge = await ctx.db.get(pb.badgeId);
        return badge;
      })
    );

    return badges.filter((b) => b !== null);
  },
});

/**
 * Query: Get all players with badges (admin only)
 */
export const getAllPlayerBadges = query({
  handler: async (ctx) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) throw new Error("Player not found");

    // Check admin permission
    const isAdmin = await hasPermission(ctx, currentPlayer._id, "admin");
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    // Get all player badges
    const playerBadges = await ctx.db.query("playerBadges").collect();
    
    // Group by player
    const playerBadgeMap = new Map<string, any[]>();
    
    for (const pb of playerBadges) {
      const badge = await ctx.db.get(pb.badgeId);
      if (!badge) continue;
      
      const playerId = pb.playerId;
      if (!playerBadgeMap.has(playerId)) {
        playerBadgeMap.set(playerId, []);
      }
      playerBadgeMap.get(playerId)?.push(badge);
    }

    // Get all players and enrich with badges
    const allPlayers = await ctx.db.query("players").collect();
    const enrichedPlayers = await Promise.all(
      allPlayers.map(async (player) => {
        const playerUser = await ctx.db.get(player.userId);
        const badges = playerBadgeMap.get(player._id) || [];
        
        return {
          _id: player._id,
          name: playerUser?.name || playerUser?.clerkUsername || "Unknown",
          email: playerUser?.email || "",
          role: player.role || "normal",
          badges,
        };
      })
    );

    return enrichedPlayers;
  },
});

/**
 * Query: Search players for badge assignment (admin only)
 */
export const searchPlayersForBadges = query({
  args: {
    searchQuery: v.string(),
  },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) throw new Error("Player not found");

    // Check admin permission
    const isAdmin = await hasPermission(ctx, currentPlayer._id, "admin");
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    if (!args.searchQuery.trim()) {
      return [];
    }

    // Get all players and filter by name/email
    const allPlayers = await ctx.db.query("players").collect();
    const enrichedPlayers = await Promise.all(
      allPlayers.map(async (player) => {
        const playerUser = await ctx.db.get(player.userId);
        
        // Get player's current badges
        const playerBadgeRecords = await ctx.db
          .query("playerBadges")
          .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
          .collect();
        
        const badges = await Promise.all(
          playerBadgeRecords.map(async (pb) => {
            return await ctx.db.get(pb.badgeId);
          })
        );

        return {
          _id: player._id,
          name: playerUser?.name || playerUser?.clerkUsername || "Unknown",
          email: playerUser?.email || "",
          role: player.role || "normal",
          badges: badges.filter((b) => b !== null),
        };
      })
    );

    // Filter by search query
    const searchLower = args.searchQuery.toLowerCase();
    const filtered = enrichedPlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.email.toLowerCase().includes(searchLower)
    );

    return filtered.slice(0, 20); // Limit to 20 results
  },
});

/**
 * Mutation: Create a new badge (admin only)
 */
export const createBadge = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) throw new Error("Player not found");

    // Check admin permission
    const isAdmin = await hasPermission(ctx, currentPlayer._id, "admin");
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    // Check if badge with this name already exists
    const existingBadge = await ctx.db
      .query("badges")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    
    if (existingBadge) {
      throw new Error("A badge with this name already exists");
    }

    const now = Date.now();
    const badgeId = await ctx.db.insert("badges", {
      name: args.name,
      description: args.description,
      icon: args.icon,
      createdByAdminId: currentPlayer._id,
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      message: "Badge created successfully",
      badgeId,
    };
  },
});

/**
 * Mutation: Update a badge (admin only)
 */
export const updateBadge = mutation({
  args: {
    badgeId: v.id("badges"),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) throw new Error("Player not found");

    // Check admin permission
    const isAdmin = await hasPermission(ctx, currentPlayer._id, "admin");
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    // Verify badge exists
    const badge = await ctx.db.get(args.badgeId);
    if (!badge) throw new Error("Badge not found");

    // Check if another badge with this name exists
    const existingBadge = await ctx.db
      .query("badges")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    
    if (existingBadge && existingBadge._id !== args.badgeId) {
      throw new Error("Another badge with this name already exists");
    }

    const now = Date.now();
    await ctx.db.patch(args.badgeId, {
      name: args.name,
      description: args.description,
      icon: args.icon,
      updatedAt: now,
    });

    return {
      success: true,
      message: "Badge updated successfully",
    };
  },
});

/**
 * Mutation: Delete a badge (admin only)
 */
export const deleteBadge = mutation({
  args: {
    badgeId: v.id("badges"),
  },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) throw new Error("Player not found");

    // Check admin permission
    const isAdmin = await hasPermission(ctx, currentPlayer._id, "admin");
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    // Verify badge exists
    const badge = await ctx.db.get(args.badgeId);
    if (!badge) throw new Error("Badge not found");

    // Delete all player badge assignments
    const playerBadges = await ctx.db
      .query("playerBadges")
      .withIndex("by_badgeId", (q) => q.eq("badgeId", args.badgeId))
      .collect();
    
    for (const pb of playerBadges) {
      await ctx.db.delete(pb._id);
    }

    // Delete the badge
    await ctx.db.delete(args.badgeId);

    return {
      success: true,
      message: "Badge deleted successfully",
    };
  },
});

/**
 * Mutation: Assign a badge to a player (admin only)
 */
export const assignBadge = mutation({
  args: {
    playerId: v.id("players"),
    badgeId: v.id("badges"),
  },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) throw new Error("Player not found");

    // Check admin permission
    const isAdmin = await hasPermission(ctx, currentPlayer._id, "admin");
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    // Verify player and badge exist
    const targetPlayer = await ctx.db.get(args.playerId);
    if (!targetPlayer) throw new Error("Player not found");

    const badge = await ctx.db.get(args.badgeId);
    if (!badge) throw new Error("Badge not found");

    // Check if player already has this badge
    const existingAssignment = await ctx.db
      .query("playerBadges")
      .withIndex("by_player_badge", (q) => 
        q.eq("playerId", args.playerId).eq("badgeId", args.badgeId)
      )
      .unique();
    
    if (existingAssignment) {
      throw new Error("Player already has this badge");
    }

    const now = Date.now();
    const assignmentId = await ctx.db.insert("playerBadges", {
      playerId: args.playerId,
      badgeId: args.badgeId,
      assignedByAdminId: currentPlayer._id,
      assignedAt: now,
    });

    return {
      success: true,
      message: "Badge assigned successfully",
      assignmentId,
    };
  },
});

/**
 * Mutation: Remove a badge from a player (admin only)
 */
export const removeBadge = mutation({
  args: {
    playerId: v.id("players"),
    badgeId: v.id("badges"),
  },
  handler: async (ctx, args) => {
    // Check authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const currentPlayer = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!currentPlayer) throw new Error("Player not found");

    // Check admin permission
    const isAdmin = await hasPermission(ctx, currentPlayer._id, "admin");
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    // Find the assignment
    const assignment = await ctx.db
      .query("playerBadges")
      .withIndex("by_player_badge", (q) => 
        q.eq("playerId", args.playerId).eq("badgeId", args.badgeId)
      )
      .unique();
    
    if (!assignment) {
      throw new Error("Player does not have this badge");
    }

    await ctx.db.delete(assignment._id);

    return {
      success: true,
      message: "Badge removed successfully",
    };
  },
});
