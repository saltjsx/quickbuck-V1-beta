import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const findUserByToken = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    // Get the user's identity from the auth context
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    // Check if we've already stored this identity before
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (user !== null) {
      return user;
    }

    return null;
  },
});

export const upsertUser = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    // Extract image from Clerk identity
    // Clerk typically uses image_url in JWT tokens (OIDC standard is 'picture')
    const clerkImage =
      (identity as any)?.image_url ||
      (identity as any)?.picture ||
      (identity as any)?.imageUrl ||
      (identity as any)?.pictureUrl ||
      (identity as any)?.profileImageUrl ||
      (identity as any)?.avatar_url ||
      undefined;

    // Check if user exists by token
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (existingUser) {
      // REQUIRE NAME: Validate that user has a name
      if (!identity.name || identity.name.trim() === "") {
        throw new Error(
          "Account name is required. Please complete your profile setup in Clerk."
        );
      }

      // Update if needed - always update image to ensure it's current
      const updatedFields: Parameters<typeof ctx.db.patch>[1] = {
        name: identity.name,
        email: identity.email,
        image: clerkImage ?? undefined,
      };

      // Only patch if something has changed
      const hasChanges =
        existingUser.name !== updatedFields.name ||
        existingUser.email !== updatedFields.email ||
        existingUser.image !== updatedFields.image;

      if (hasChanges) {
        await ctx.db.patch(existingUser._id, updatedFields);
      }

      // Return updated user data
      return await ctx.db.get(existingUser._id);
    }

    // DUPLICATE EMAIL FIX: Check if email already exists before creating new user
    if (identity.email) {
      const existingEmailUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email))
        .first();

      if (existingEmailUser) {
        throw new Error(
          "An account with this email already exists. Please use a different email or sign in with your existing account."
        );
      }
    }

    // REQUIRE NAME: Validate that user has a name
    if (!identity.name || identity.name.trim() === "") {
      throw new Error(
        "Account name is required. Please complete your profile setup in Clerk."
      );
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      name: identity.name,
      email: identity.email,
      image: clerkImage ?? undefined,
      tokenIdentifier: identity.subject,
    });

    return await ctx.db.get(userId);
  },
});

// Debug query to check what fields are available in Clerk identity
export const debugClerkIdentity = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return { error: "Not authenticated" };
    }

    // Return all available fields (safely)
    return {
      availableFields: Object.keys(identity),
      name: identity.name,
      email: identity.email,
      subject: identity.subject,
      image_url: (identity as any)?.image_url,
      picture: (identity as any)?.picture,
      imageUrl: (identity as any)?.imageUrl,
      pictureUrl: (identity as any)?.pictureUrl,
      profileImageUrl: (identity as any)?.profileImageUrl,
      avatar_url: (identity as any)?.avatar_url,
    };
  },
});

// Mutation to refresh user profile image from Clerk
export const refreshUserImage = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Extract image from Clerk identity - prioritize image_url
    const clerkImage =
      (identity as any)?.image_url ||
      (identity as any)?.picture ||
      (identity as any)?.imageUrl ||
      (identity as any)?.pictureUrl ||
      (identity as any)?.profileImageUrl ||
      (identity as any)?.avatar_url ||
      undefined;

    // Find user by token
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Update user image
    await ctx.db.patch(user._id, {
      image: clerkImage ?? undefined,
    });

    return await ctx.db.get(user._id);
  },
});

// Query to get current user with fresh data
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    return user;
  },
});
