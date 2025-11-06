import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================
// PLAYER MESSAGING SYSTEM
// ============================================

/**
 * Send a message from one player to another
 * If sent from mod panel, isMod should be true
 */
export const sendMessage = mutation({
  args: {
    recipientId: v.id("players"),
    content: v.string(),
    subject: v.optional(v.string()),
    isMod: v.optional(v.boolean()), // True when sent from mod panel
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const sender = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!sender) throw new Error("Player not found");

    // Check if sender's account is limited or banned
    if (sender.role === "banned") {
      throw new Error("Cannot send messages while banned");
    }
    if (sender.role === "limited") {
      throw new Error("Cannot send messages while account is limited");
    }

    // Validate message content
    if (!args.content.trim()) {
      throw new Error("Message cannot be empty");
    }

    if (args.content.length > 2000) {
      throw new Error("Message is too long (max 2000 characters)");
    }

    // Check if recipient exists
    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) {
      throw new Error("Recipient not found");
    }

    // Create message
    await ctx.db.insert("messages", {
      senderId: sender._id,
      recipientId: args.recipientId,
      senderName: user.name || "Anonymous",
      subject: args.subject,
      content: args.content,
      isRead: false,
      sentAt: Date.now(),
      isMod: args.isMod || false,
    });

    return {
      success: true,
      message: "Message sent successfully",
    };
  },
});

/**
 * Get all messages for the current player (inbox)
 */
export const getInbox = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user) return [];

    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!player) return [];

    // Get all messages where current player is the recipient
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_recipientId", (q) => q.eq("recipientId", player._id))
      .order("desc")
      .collect();

    // Enrich messages with sender player tags
    const enrichedMessages = await Promise.all(
      messages.map(async (message) => {
        const senderTag = await ctx.db
          .query("playerTags")
          .withIndex("by_playerId", (q) => q.eq("playerId", message.senderId))
          .unique();

        return {
          ...message,
          senderTag: senderTag || null,
        };
      })
    );

    return enrichedMessages;
  },
});

/**
 * Get sent messages for the current player
 */
export const getSentMessages = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user) return [];

    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!player) return [];

    // Get all messages where current player is the sender
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_senderId", (q) => q.eq("senderId", player._id))
      .order("desc")
      .collect();

    // Enrich messages with recipient info and tags
    const enrichedMessages = await Promise.all(
      messages.map(async (message) => {
        const recipient = await ctx.db.get(message.recipientId);
        const recipientUser = recipient ? await ctx.db.get(recipient.userId) : null;
        
        const recipientTag = await ctx.db
          .query("playerTags")
          .withIndex("by_playerId", (q) => q.eq("playerId", message.recipientId))
          .unique();

        return {
          ...message,
          recipientName: recipientUser?.name || "Unknown",
          recipientTag: recipientTag || null,
        };
      })
    );

    return enrichedMessages;
  },
});

/**
 * Mark a message as read
 */
export const markAsRead = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!player) throw new Error("Player not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Only the recipient can mark as read
    if (message.recipientId !== player._id) {
      throw new Error("Not authorized to mark this message as read");
    }

    await ctx.db.patch(args.messageId, {
      isRead: true,
    });

    return { success: true };
  },
});

/**
 * Delete a message
 */
export const deleteMessage = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!player) throw new Error("Player not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Only recipient can delete messages from inbox
    if (message.recipientId !== player._id) {
      throw new Error("Not authorized to delete this message");
    }

    await ctx.db.delete(args.messageId);

    return { success: true };
  },
});

/**
 * Get unread message count for current player
 */
export const getUnreadCount = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user) return 0;

    const player = await ctx.db
      .query("players")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!player) return 0;

    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_recipient_read", (q) =>
        q.eq("recipientId", player._id).eq("isRead", false)
      )
      .collect();

    return unreadMessages.length;
  },
});

/**
 * Search for players by name (for sending messages)
 */
export const searchPlayers = query({
  args: {
    searchQuery: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    if (!args.searchQuery.trim() || args.searchQuery.length < 2) {
      return [];
    }

    const query = args.searchQuery.toLowerCase().trim();

    // Get all users
    const users = await ctx.db.query("users").collect();

    // Filter users by name
    const matchingUsers = users.filter((u) =>
      u.name?.toLowerCase().includes(query)
    );

    // Get player data for matching users
    const results = await Promise.all(
      matchingUsers.slice(0, 10).map(async (user) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .unique();

        if (!player) return null;

        // Don't show banned players
        if (player.role === "banned") return null;

        // Get player tag
        const playerTag = await ctx.db
          .query("playerTags")
          .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
          .unique();

        return {
          playerId: player._id,
          playerName: user.name || "Anonymous",
          role: player.role,
          playerTag: playerTag || null,
        };
      })
    );

    return results.filter((r) => r !== null);
  },
});
