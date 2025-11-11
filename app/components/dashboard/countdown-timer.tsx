"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Clock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { formatTimeRemaining } from "~/lib/game-utils";

interface CountdownTimerProps {
  lastTickTime?: number;
  /** height in pixels to force the card to match another element */
  heightPx?: number | undefined;
}

export function CountdownTimer({
  lastTickTime,
  heightPx,
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    if (!lastTickTime) {
      setTimeRemaining(TICK_INTERVAL_MS);
      return;
    }

    // Helper to update the time
    const updateTime = () => {
      const now = Date.now();
      const timeSinceLastTick = now - lastTickTime;

      // If time since last tick is negative (clock skew), return full interval
      if (timeSinceLastTick < 0) {
        setTimeRemaining(TICK_INTERVAL_MS);
        return;
      }

      // If we've exceeded the tick interval, the tick should have run but hasn't yet
      // Show the time past due, cycling back through the interval
      if (timeSinceLastTick >= TICK_INTERVAL_MS) {
        // Calculate how far we are into the current cycle
        const timeIntoCycle = timeSinceLastTick % TICK_INTERVAL_MS;
        const timeUntilNextTick = TICK_INTERVAL_MS - timeIntoCycle;
        setTimeRemaining(timeUntilNextTick);
        return;
      }

      // Calculate time until next tick (normal case)
      const timeUntilNextTick = TICK_INTERVAL_MS - timeSinceLastTick;

      // Never show negative time
      setTimeRemaining(Math.max(timeUntilNextTick, 0));
    };

    // Update immediately
    updateTime();

    // Update every second
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [lastTickTime, TICK_INTERVAL_MS]);

  const progress =
    ((TICK_INTERVAL_MS - timeRemaining) / TICK_INTERVAL_MS) * 100;
  const isAlmostDue = timeRemaining < 30000; // Less than 30 seconds

  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={heightPx ? { height: `${heightPx}px` } : undefined}
    >
      <Card
        className={`relative overflow-hidden ${heightPx ? "h-full" : ""} ${
          isAlmostDue ? "border-[var(--chart-3)]/20 dark:border-[var(--chart-3)]/30" : ""
        }`}
      >
        {/* Progress bar background */}
        <div className="absolute inset-x-0 top-0 h-1 bg-muted">
          <motion.div
            className={`h-full ${isAlmostDue ? "bg-[var(--chart-3)]" : "bg-primary"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">
              Next Market Update
            </CardTitle>
            {isAlmostDue && (
              <Badge
                variant="secondary"
                className="bg-[var(--chart-3)]/10 text-[var(--chart-3)] dark:bg-[var(--chart-3)]/20 dark:text-[var(--chart-3)]"
              >
                <Zap className="mr-1 h-3 w-3" />
                Soon
              </Badge>
            )}
          </div>
          <motion.div
            className={`rounded-lg p-2 ${
              isAlmostDue ? "bg-[var(--chart-3)]/10 dark:bg-[var(--chart-3)]/20" : "bg-muted"
            }`}
            animate={isAlmostDue ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 1, repeat: isAlmostDue ? Infinity : 0 }}
          >
            <Clock
              className={`h-5 w-5 ${
                isAlmostDue
                  ? "text-[var(--chart-3)]"
                  : "text-muted-foreground"
              }`}
            />
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-3">
          <motion.div
            className={`text-3xl font-bold tracking-tight ${
              isAlmostDue ? "text-[var(--chart-3)]" : ""
            }`}
            animate={isAlmostDue ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 1, repeat: isAlmostDue ? Infinity : 0 }}
          >
            {formatTimeRemaining(timeRemaining)}
          </motion.div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Markets update every 5 minutes
            </p>
            <div className="flex items-center gap-2 text-xs">
              <div
                className={`h-2 w-2 rounded-full ${
                  isAlmostDue ? "bg-[var(--chart-3)]" : "bg-emerald-500"
                } animate-pulse`}
              />
              <span className="text-muted-foreground">
                {isAlmostDue ? "Update imminent" : "System active"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
