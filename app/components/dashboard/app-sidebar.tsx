import {
  LayoutDashboard,
  Trophy,
  Wallet,
  ArrowLeftRight,
  Receipt,
  CreditCard,
  Building2,
  ShoppingCart,
  TrendingUp,
  Bitcoin,
  Briefcase,
  Store,
  Dice5,
  Bolt,
  Shield,
  MessageSquare,
  Tags,
} from "lucide-react";
import { Link } from "react-router";
import { NavMain } from "./nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { UserButton } from "@clerk/react-router";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { PlayerTagsManager } from "../admin/player-tags-manager";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";

const sidebarGroups = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Portfolio",
        url: "/portfolio",
        icon: Briefcase,
      },
      {
        title: "Leaderboard",
        url: "/leaderboard",
        icon: Trophy,
      },
      {
        title: "Messages",
        url: "/messages",
        icon: MessageSquare,
      },
    ],
  },
  {
    title: "Investments",
    items: [
      {
        title: "Stocks",
        url: "/stocks",
        icon: TrendingUp,
      },
      {
        title: "Crypto",
        url: "/crypto",
        icon: Bitcoin,
      },
      {
        title: "Companies",
        url: "/companies",
        icon: Building2,
      },
    ],
  },
  {
    title: "Banking",
    items: [
      {
        title: "Accounts",
        url: "/accounts",
        icon: Wallet,
      },
      {
        title: "Transfers",
        url: "/transfers",
        icon: ArrowLeftRight,
      },
      {
        title: "Transactions",
        url: "/transactions",
        icon: Receipt,
      },
      {
        title: "Loans",
        url: "/loans",
        icon: CreditCard,
      },
    ],
  },
  {
    title: "Marketplace",
    items: [
      {
        title: "Shop",
        url: "/marketplace",
        icon: ShoppingCart,
      },
      {
        title: "Companies",
        url: "/company-marketplace",
        icon: Store,
      },
    ],
  },
  {
    title: "Entertainment",
    items: [
      {
        title: "Casino",
        url: "/gamble",
        icon: Dice5,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        title: "Upgrades",
        url: "/upgrades",
        icon: Bolt,
      },
    ],
  },
];

export function AppSidebar({
  variant,
  user,
}: {
  variant: "sidebar" | "floating" | "inset";
  user: any;
}) {
  const [showTagsManager, setShowTagsManager] = useState(false);
  const moderationAccess = useQuery(api.moderation.checkModerationAccess);
  // @ts-ignore - messages module exists but not yet in generated types
  const unreadCount = useQuery(api.messages?.getUnreadCount);

  const isAdmin = moderationAccess?.role === "admin";

  // Add moderation panel link if user is mod or admin
  const groups = moderationAccess?.hasAccess
    ? [
        ...sidebarGroups,
        {
          title: "Admin",
          items: [
            {
              title: "Mod Panel",
              url: "/panel",
              icon: Shield,
            },
          ],
        },
      ]
    : sidebarGroups;

  return (
    <Sidebar collapsible="offcanvas" variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to="/" prefetch="viewport">
              <div className="flex items-center gap-2 py-1">
                {/* Optimized light/dark logos */}
                <img
                  src="/betav1-light.png"
                  alt="Quickbuck"
                  width="120"
                  height="28"
                  className="dark:hidden block"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
                <img
                  src="/betav1-dark.png"
                  alt="Quickbuck"
                  width="120"
                  height="28"
                  className="hidden dark:block"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              </div>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} unreadCount={unreadCount} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {isAdmin && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowTagsManager(true)}
                      className="h-9 w-9"
                    >
                      <Tags className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Manage Player Tags</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <UserButton />
        </div>
      </SidebarFooter>
      
      {isAdmin && (
        <PlayerTagsManager
          open={showTagsManager}
          onOpenChange={setShowTagsManager}
        />
      )}
    </Sidebar>
  );
}
