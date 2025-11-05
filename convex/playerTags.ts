import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { hasPermission } from "./moderation";

/**
 * Query: Get tag for a specific player
 */
export const getPlayerTag = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db
      .query("playerTags")
      .withIndex("by_playerId", (q) => q.eq("playerId", args.playerId))
      .unique();

    return tag;
  },
});

/**
 * Query: Get all players with tags (for admin panel)
 */
export const getAllPlayerTags = query({
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

    // Get all tags with player information
    const tags = await ctx.db.query("playerTags").collect();
    
    const enrichedTags = await Promise.all(
      tags.map(async (tag) => {
        const player = await ctx.db.get(tag.playerId);
        const playerUser = player ? await ctx.db.get(player.userId) : null;
        
        return {
          ...tag,
          playerName: playerUser?.name || playerUser?.clerkUsername || "Unknown",
          playerEmail: playerUser?.email || "",
        };
      })
    );

    return enrichedTags;
  },
});

/**
 * Query: Search players for tagging (admin only)
 */
export const searchPlayersForTagging = query({
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
        const playerTag = await ctx.db
          .query("playerTags")
          .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
          .unique();

        return {
          _id: player._id,
          name: playerUser?.name || playerUser?.clerkUsername || "Unknown",
          email: playerUser?.email || "",
          role: player.role || "normal",
          hasTag: !!playerTag,
          tag: playerTag,
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
 * Mutation: Create or update a player tag (admin only)
 */
export const setPlayerTag = mutation({
  args: {
    playerId: v.id("players"),
    tagText: v.string(),
    tagColor: v.string(),
    usernameColor: v.optional(v.string()),
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

    // Validate target player exists
    const targetPlayer = await ctx.db.get(args.playerId);
    if (!targetPlayer) throw new Error("Target player not found");

    // Check if tag already exists
    const existingTag = await ctx.db
      .query("playerTags")
      .withIndex("by_playerId", (q) => q.eq("playerId", args.playerId))
      .unique();

    const now = Date.now();

    if (existingTag) {
      // Update existing tag
      await ctx.db.patch(existingTag._id, {
        tagText: args.tagText,
        tagColor: args.tagColor,
        usernameColor: args.usernameColor,
        createdByAdminId: currentPlayer._id,
        updatedAt: now,
      });

      return {
        success: true,
        message: "Player tag updated successfully",
        tagId: existingTag._id,
      };
    } else {
      // Create new tag
      const tagId = await ctx.db.insert("playerTags", {
        playerId: args.playerId,
        tagText: args.tagText,
        tagColor: args.tagColor,
        usernameColor: args.usernameColor,
        createdByAdminId: currentPlayer._id,
        createdAt: now,
        updatedAt: now,
      });

      return {
        success: true,
        message: "Player tag created successfully",
        tagId,
      };
    }
  },
});

/**
 * Mutation: Remove a player tag (admin only)
 */
export const removePlayerTag = mutation({
  args: {
    playerId: v.id("players"),
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

    // Find and delete the tag
    const tag = await ctx.db
      .query("playerTags")
      .withIndex("by_playerId", (q) => q.eq("playerId", args.playerId))
      .unique();

    if (!tag) {
      throw new Error("No tag found for this player");
    }

    await ctx.db.delete(tag._id);

    return {
      success: true,
      message: "Player tag removed successfully",
    };
  },
});
