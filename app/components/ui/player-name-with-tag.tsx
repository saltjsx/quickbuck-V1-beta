import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

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
  // @ts-ignore - badges API will be available after convex dev regenerates types
  const badges = useQuery(api.badges.getPlayerBadges, { playerId });

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-medium">{playerName}</span>
      {badges && badges.length > 0 && (
        <span className="inline-flex items-center gap-1">
          {badges.map((badge: any) => (
            <TooltipProvider key={badge._id} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 cursor-help"
                    dangerouslySetInnerHTML={{ __html: badge.icon }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-center">
                    <p className="font-semibold">{badge.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {badge.description}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </span>
      )}
    </span>
  );
}
