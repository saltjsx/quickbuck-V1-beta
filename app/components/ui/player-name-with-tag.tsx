import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface PlayerNameWithTagProps {
  playerId: Id<"players">;
  playerName: string;
  className?: string;
}

export function PlayerNameWithTag({
  playerId,
  playerName,
  className = "",
}: PlayerNameWithTagProps) {
  // @ts-ignore - playerTags API will be available after convex dev regenerates types
  const tag = useQuery(api.playerTags.getPlayerTag, { playerId });

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        style={{
          color: tag?.usernameColor || "inherit",
        }}
        className="font-medium"
      >
        {playerName}
      </span>
      {tag && (
        <span
          style={{
            color: tag.tagColor,
            borderColor: tag.tagColor,
          }}
          className="px-2 py-0.5 rounded border text-xs font-medium"
        >
          {tag.tagText}
        </span>
      )}
    </span>
  );
}
