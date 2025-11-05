# Player Tags Feature - Admin Guide

## Overview

The Player Tags feature allows administrators to add custom tags and username colors next to any player's name throughout the application. This is useful for highlighting VIPs, staff members, beta testers, or any other special player categories.

## Features

- **Custom Tag Text**: Add any text label (e.g., "VIP", "Staff", "Beta Tester")
- **Tag Text Color**: Customize the color of the text inside the tag box
- **Username Color**: Optionally customize the color of the player's username itself
- **Admin-Only Access**: Only users with the "admin" role can manage tags
- **Real-time Updates**: Tags appear immediately across all pages where player names are displayed

## How to Access

### Admin Button Location

- Look for the **Tags icon button** (🏷️) next to the dark mode toggle in the sidebar footer
- This button is **only visible to admin users**

### Opening the Tag Manager

1. Click the Tags icon button in the sidebar footer
2. The Player Tags Manager dialog will open

## Using the Tag Manager

### Tab 1: Add/Edit Tags

#### Searching for Players

1. Type a player's name or email in the search box
2. Up to 20 matching results will appear
3. Click on a player to select them

#### Creating a Tag

1. After selecting a player, fill in:
   - **Tag Text**: The text to display in the tag (max 20 characters)
   - **Tag Text Color**: Click the color picker or enter a hex color code (e.g., #FFFFFF)
   - **Username Color** (Optional): Set a custom color for the player's username
2. Preview your tag in the preview section
3. Click "Save Tag" to apply

#### Editing a Tag

1. Search for a player who already has a tag (indicated by "Has Tag" badge)
2. Select them to load their existing tag
3. Make your changes
4. Click "Save Tag" to update

### Tab 2: Existing Tags

#### Viewing All Tags

- This tab shows all players who currently have tags
- Each entry displays:
  - Player name with their tag and colors applied
  - Player email
  - Edit and Delete buttons

#### Quick Actions

- **Edit Icon**: Opens the Add/Edit tab with this player's tag loaded for editing
- **Trash Icon**: Removes the tag from this player

## Where Tags Appear

Tags and custom username colors are displayed wherever player names appear:

- **Leaderboard**: Both in the main table and top player cards
- **Messages**: When viewing message threads
- **Mod Panel**: In player lists
- **And more**: The `PlayerNameWithTag` component can be used anywhere

## Technical Details

### Backend (Convex)

- **Schema**: `playerTags` table in `convex/schema.ts`
- **API**: `convex/playerTags.ts` contains all queries and mutations
- **Security**: All operations require admin role validation via `hasPermission()`

### Frontend Components

- **Manager Dialog**: `app/components/admin/player-tags-manager.tsx`
- **Display Component**: `app/components/ui/player-name-with-tag.tsx`
- **Admin Button**: Integrated in `app/components/dashboard/app-sidebar.tsx`

### Usage Example

```tsx
import { PlayerNameWithTag } from "~/components/ui/player-name-with-tag";

<PlayerNameWithTag
  playerId={player._id}
  playerName={player.userName}
  className="text-sm"
/>;
```

## After Running `npx convex dev`

Once you run `npx convex dev`, the Convex types will be regenerated and the feature will be fully functional:

1. The playerTags API will be available
2. TypeScript errors will be resolved
3. The feature will work end-to-end

## Color Recommendations

### Tag Text Colors (High Contrast)

- White: `#FFFFFF` - Classic, works on dark backgrounds
- Gold: `#FFD700` - Premium/VIP feel
- Red: `#FF4444` - Staff/Important
- Cyan: `#00FFFF` - Special/Unique
- Lime: `#00FF00` - Beta/Testing

### Username Colors

- Keep it readable - avoid overly bright or dark colors
- Test in both light and dark modes
- Consider: `#FF6B6B`, `#4ECDC4`, `#45B7D1`, `#FFA07A`, `#98D8C8`

## Best Practices

1. **Be Consistent**: Use the same tag styles for similar player categories
2. **Keep Tag Text Short**: 3-10 characters works best
3. **Test Both Themes**: Check how colors look in light and dark mode
4. **Document Your Tags**: Keep track of what each tag type means for your team
5. **Use Sparingly**: Too many tagged players reduces the impact

## Troubleshooting

### Button Not Visible

- Verify your user account has the "admin" role in the database
- Check that you're logged in

### Changes Not Appearing

- Tags should appear immediately after saving
- Try refreshing the page if needed
- Ensure `npx convex dev` is running

### Can't Find a Player

- Try searching by email instead of name
- Check that the player account exists in the database
- Search is case-insensitive

## Security Notes

- Only admin-role users can access the tag management interface
- All backend operations validate admin permissions
- Non-admin users can see tags but cannot create/edit/delete them
- The admin button is completely hidden from non-admin users in the UI
