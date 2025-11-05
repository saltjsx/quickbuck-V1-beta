import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { Search, Trash2, Edit, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface PlayerTagsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlayerTagsManager({ open, onOpenChange }: PlayerTagsManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [tagText, setTagText] = useState("");
  const [tagColor, setTagColor] = useState("#FFFFFF");
  const [usernameColor, setUsernameColor] = useState("");
  const [activeTab, setActiveTab] = useState("search");

  // @ts-ignore - playerTags API will be available after convex dev regenerates types
  const searchResults = useQuery(
    api.playerTags.searchPlayersForTagging,
    searchQuery.trim() ? { searchQuery } : "skip"
  );

  // @ts-ignore - playerTags API will be available after convex dev regenerates types
  const existingTags = useQuery(api.playerTags.getAllPlayerTags);
  
  // @ts-ignore - playerTags API will be available after convex dev regenerates types
  const setPlayerTag = useMutation(api.playerTags.setPlayerTag);
  // @ts-ignore - playerTags API will be available after convex dev regenerates types
  const removePlayerTag = useMutation(api.playerTags.removePlayerTag);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedPlayerId(null);
      setTagText("");
      setTagColor("#FFFFFF");
      setUsernameColor("");
      setActiveTab("search");
    }
  }, [open]);

  const handleSelectPlayer = (player: any) => {
    setSelectedPlayerId(player._id);
    if (player.tag) {
      setTagText(player.tag.tagText);
      setTagColor(player.tag.tagColor);
      setUsernameColor(player.tag.usernameColor || "");
    } else {
      setTagText("");
      setTagColor("#FFFFFF");
      setUsernameColor("");
    }
  };

  const handleSaveTag = async () => {
    if (!selectedPlayerId) {
      toast.error("Please select a player");
      return;
    }

    if (!tagText.trim()) {
      toast.error("Tag text cannot be empty");
      return;
    }

    try {
      await setPlayerTag({
        playerId: selectedPlayerId,
        tagText: tagText.trim(),
        tagColor,
        usernameColor: usernameColor || undefined,
      });

      toast.success("Tag saved successfully");
      setSelectedPlayerId(null);
      setTagText("");
      setTagColor("#FFFFFF");
      setUsernameColor("");
      setSearchQuery("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save tag");
    }
  };

  const handleRemoveTag = async (playerId: Id<"players">) => {
    try {
      await removePlayerTag({ playerId });
      toast.success("Tag removed successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to remove tag");
    }
  };

  const handleEditExistingTag = (tag: any) => {
    setSelectedPlayerId(tag.playerId);
    setTagText(tag.tagText);
    setTagColor(tag.tagColor);
    setUsernameColor(tag.usernameColor || "");
    setActiveTab("search");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Manage Player Tags</DialogTitle>
          <DialogDescription>
            Add, edit, or remove custom tags and username colors for players.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">Add/Edit Tags</TabsTrigger>
            <TabsTrigger value="existing">Existing Tags</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            {/* Search Section */}
            <div className="space-y-2">
              <Label htmlFor="search">Search Players</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Search Results */}
            {searchQuery.trim() && (
              <ScrollArea className="h-[200px] rounded-md border p-4">
                {searchResults && searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((player: any) => (
                      <button
                        key={player._id}
                        onClick={() => handleSelectPlayer(player)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedPlayerId === player._id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{player.name}</div>
                            <div className="text-sm opacity-75">{player.email}</div>
                          </div>
                          {player.hasTag && (
                            <Badge variant="secondary" className="ml-2">
                              Has Tag
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No players found
                  </div>
                )}
              </ScrollArea>
            )}

            {/* Tag Editor */}
            {selectedPlayerId && (
              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="tagText">Tag Text</Label>
                  <Input
                    id="tagText"
                    placeholder="e.g., VIP, Staff, Beta Tester"
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    maxLength={20}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tagColor">Tag Text Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="tagColor"
                        type="color"
                        value={tagColor}
                        onChange={(e) => setTagColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <Input
                        value={tagColor}
                        onChange={(e) => setTagColor(e.target.value)}
                        placeholder="#FFFFFF"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="usernameColor">Username Color (Optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="usernameColor"
                        type="color"
                        value={usernameColor || "#000000"}
                        onChange={(e) => setUsernameColor(e.target.value)}
                        className="w-20 h-10 cursor-pointer"
                      />
                      <div className="flex-1 flex gap-1">
                        <Input
                          value={usernameColor}
                          onChange={(e) => setUsernameColor(e.target.value)}
                          placeholder="#000000 (Optional)"
                          className="flex-1"
                        />
                        {usernameColor && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setUsernameColor("")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="p-4 rounded-lg border bg-muted/50 flex items-center gap-2">
                    <span
                      style={{
                        color: usernameColor || "inherit",
                      }}
                      className="font-medium"
                    >
                      PlayerName
                    </span>
                    <span
                      style={{
                        color: tagColor,
                      }}
                      className="px-2 py-0.5 rounded border text-xs font-medium"
                    >
                      {tagText || "TAG"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={handleSaveTag} className="flex-1">
                    <Plus className="mr-2 h-4 w-4" />
                    Save Tag
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedPlayerId(null);
                      setTagText("");
                      setTagColor("#FFFFFF");
                      setUsernameColor("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="existing">
            <ScrollArea className="h-[500px]">
              {existingTags && existingTags.length > 0 ? (
                <div className="space-y-2 pr-4">
                  {existingTags.map((tag: any) => (
                    <div
                      key={tag._id}
                      className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              color: tag.usernameColor || "inherit",
                            }}
                            className="font-medium"
                          >
                            {tag.playerName}
                          </span>
                          <span
                            style={{
                              color: tag.tagColor,
                            }}
                            className="px-2 py-0.5 rounded border text-xs font-medium"
                          >
                            {tag.tagText}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditExistingTag(tag)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveTag(tag.playerId)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {tag.playerEmail}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No tags found. Create one from the "Add/Edit Tags" tab.
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
