import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Github, BookOpen, Newspaper } from "lucide-react";
import DiscordIcon from "~/components/icons/discord-icon";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Link } from "react-router";

export function SiteHeader() {
  const currentPlayer = useQuery(api.moderation.getCurrentPlayer);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        {currentPlayer?.role === "limited" && (
          <div className="flex items-center gap-2 rounded-md bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-800 border-2 border-yellow-400">
            ⚠️ Account Limited
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            asChild
            title="Rules"
            aria-label="Rules"
            className="font-bold"
          >
            <Link to="/rules" className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              RULES
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            asChild
            title="News"
            aria-label="News"
          >
            <a
              href="https://news.quickbuck.xyz"
              rel="noopener noreferrer"
              target="_blank"
              className="flex items-center"
            >
              <Newspaper className="h-5 w-5" />
            </a>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            asChild
            title="GitHub"
            aria-label="GitHub"
          >
            <a
              href="https://github.com/saltjsx/quickbuck-v1b"
              rel="noopener noreferrer"
              target="_blank"
              className="flex items-center"
            >
              <Github className="h-5 w-5" />
            </a>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            asChild
            title="Discord"
            aria-label="Discord"
          >
            <a
              href="https://discord.gg/hVcv6upDW"
              rel="noopener noreferrer"
              target="_blank"
              className="flex items-center"
            >
              <DiscordIcon className="h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
