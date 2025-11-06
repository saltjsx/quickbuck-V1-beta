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
import { Textarea } from "~/components/ui/textarea";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import {
  Search,
  Trash2,
  Edit,
  Plus,
  X,
  Award,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";

interface BadgeManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Common icon presets for quick selection
const ICON_PRESETS = [
  { name: "Star", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-yellow-500"><path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" /></svg>' },
  { name: "Crown", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-amber-500"><path fill-rule="evenodd" d="M12 1.5a.75.75 0 01.75.75V4.5a.75.75 0 01-1.5 0V2.25A.75.75 0 0112 1.5zM5.636 4.136a.75.75 0 011.06 0l1.592 1.591a.75.75 0 01-1.061 1.06l-1.591-1.59a.75.75 0 010-1.061zm12.728 0a.75.75 0 010 1.06l-1.591 1.592a.75.75 0 01-1.06-1.061l1.59-1.591a.75.75 0 011.061 0zm-6.816 4.496a.75.75 0 01.562.813l-1.5 9a.75.75 0 01-1.478-.246l1.5-9a.75.75 0 01.916-.567zM13.5 9a.75.75 0 01.75.75v9a.75.75 0 01-1.5 0v-9A.75.75 0 0113.5 9zM9.75 9a.75.75 0 01.75.75v9a.75.75 0 01-1.5 0v-9A.75.75 0 019.75 9zm-4.5 1.5a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75zm13.5 0a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75z" clip-rule="evenodd" /></svg>' },
  { name: "Shield", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-blue-500"><path fill-rule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" /></svg>' },
  { name: "Fire", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-orange-500"><path fill-rule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177A7.547 7.547 0 016.648 6.61a.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.545 3.75 3.75 0 013.255 3.717z" clip-rule="evenodd" /></svg>' },
  { name: "Lightning", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-yellow-400"><path fill-rule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clip-rule="evenodd" /></svg>' },
  { name: "Heart", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-red-500"><path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" /></svg>' },
  { name: "Check", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-green-500"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" /></svg>' },
  { name: "Gem", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-purple-500"><path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 01-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004zM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 01-.921.42z" /><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v.816a3.836 3.836 0 00-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 01-.921-.421l-.879-.66a.75.75 0 00-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 001.5 0v-.81a4.124 4.124 0 001.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 00-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 00.933-1.175l-.415-.33a3.836 3.836 0 00-1.719-.755V6z" clip-rule="evenodd" /></svg>' },
];

export function BadgeManager({ open, onOpenChange }: BadgeManagerProps) {
  const [activeTab, setActiveTab] = useState("badges");
  
  // Badge management state
  const [editingBadge, setEditingBadge] = useState<any | null>(null);
  const [badgeName, setBadgeName] = useState("");
  const [badgeDescription, setBadgeDescription] = useState("");
  const [badgeIcon, setBadgeIcon] = useState("");
  
  // Player assignment state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [selectedBadgeForAssignment, setSelectedBadgeForAssignment] = useState<Id<"badges"> | null>(null);

  // @ts-ignore - badges API will be available after convex dev regenerates types
  const allBadges = useQuery(api.badges.getAllBadges);
  
  // @ts-ignore - badges API will be available after convex dev regenerates types
  const searchResults = useQuery(
    api.badges.searchPlayersForBadges,
    searchQuery.trim() ? { searchQuery } : "skip"
  );
  
  // @ts-ignore - badges API will be available after convex dev regenerates types
  const createBadge = useMutation(api.badges.createBadge);
  // @ts-ignore - badges API will be available after convex dev regenerates types
  const updateBadge = useMutation(api.badges.updateBadge);
  // @ts-ignore - badges API will be available after convex dev regenerates types
  const deleteBadge = useMutation(api.badges.deleteBadge);
  // @ts-ignore - badges API will be available after convex dev regenerates types
  const assignBadge = useMutation(api.badges.assignBadge);
  // @ts-ignore - badges API will be available after convex dev regenerates types
  const removeBadge = useMutation(api.badges.removeBadge);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      resetBadgeForm();
      setSearchQuery("");
      setSelectedPlayer(null);
      setSelectedBadgeForAssignment(null);
      setActiveTab("badges");
    }
  }, [open]);

  const resetBadgeForm = () => {
    setEditingBadge(null);
    setBadgeName("");
    setBadgeDescription("");
    setBadgeIcon("");
  };

  const handleEditBadge = (badge: any) => {
    setEditingBadge(badge);
    setBadgeName(badge.name);
    setBadgeDescription(badge.description);
    setBadgeIcon(badge.icon);
  };

  const handleSaveBadge = async () => {
    if (!badgeName.trim()) {
      toast.error("Badge name is required");
      return;
    }
    if (!badgeDescription.trim()) {
      toast.error("Badge description is required");
      return;
    }
    if (!badgeIcon.trim()) {
      toast.error("Badge icon is required");
      return;
    }

    try {
      if (editingBadge) {
        await updateBadge({
          badgeId: editingBadge._id,
          name: badgeName.trim(),
          description: badgeDescription.trim(),
          icon: badgeIcon.trim(),
        });
        toast.success("Badge updated successfully");
      } else {
        await createBadge({
          name: badgeName.trim(),
          description: badgeDescription.trim(),
          icon: badgeIcon.trim(),
        });
        toast.success("Badge created successfully");
      }
      resetBadgeForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save badge");
    }
  };

  const handleDeleteBadge = async (badgeId: Id<"badges">) => {
    if (!confirm("Are you sure you want to delete this badge? This will remove it from all players.")) {
      return;
    }

    try {
      await deleteBadge({ badgeId });
      toast.success("Badge deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete badge");
    }
  };

  const handleAssignBadge = async () => {
    if (!selectedPlayer || !selectedBadgeForAssignment) {
      toast.error("Please select a player and a badge");
      return;
    }

    try {
      await assignBadge({
        playerId: selectedPlayer._id,
        badgeId: selectedBadgeForAssignment,
      });
      toast.success("Badge assigned successfully");
      setSelectedPlayer(null);
      setSelectedBadgeForAssignment(null);
      setSearchQuery("");
    } catch (error: any) {
      toast.error(error.message || "Failed to assign badge");
    }
  };

  const handleRemoveBadge = async (playerId: Id<"players">, badgeId: Id<"badges">) => {
    try {
      await removeBadge({ playerId, badgeId });
      toast.success("Badge removed successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to remove badge");
    }
  };

  const selectIconPreset = (icon: string) => {
    setBadgeIcon(icon);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Badge Manager
          </DialogTitle>
          <DialogDescription>
            Create and manage badges, then assign them to players.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="badges">Badges</TabsTrigger>
            <TabsTrigger value="assign">Assign to Players</TabsTrigger>
          </TabsList>

          {/* Badge Management Tab */}
          <TabsContent value="badges" className="space-y-4">
            {/* Badge Editor */}
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <h3 className="font-semibold flex items-center gap-2">
                {editingBadge ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingBadge ? "Edit Badge" : "Create New Badge"}
              </h3>

              <div className="space-y-2">
                <Label htmlFor="badgeName">Badge Name</Label>
                <Input
                  id="badgeName"
                  placeholder="e.g., VIP, Developer, Beta Tester"
                  value={badgeName}
                  onChange={(e) => setBadgeName(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="badgeDescription">Description</Label>
                <Textarea
                  id="badgeDescription"
                  placeholder="Description shown when hovering over the badge"
                  value={badgeDescription}
                  onChange={(e) => setBadgeDescription(e.target.value)}
                  maxLength={200}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="badgeIcon">Icon (SVG/HTML)</Label>
                <Textarea
                  id="badgeIcon"
                  placeholder="Paste SVG code or HTML for the icon"
                  value={badgeIcon}
                  onChange={(e) => setBadgeIcon(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                />
                
                {/* Icon Presets */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Quick Select Icons:</Label>
                  <div className="flex flex-wrap gap-2">
                    {ICON_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => selectIconPreset(preset.icon)}
                        className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted transition-colors text-xs"
                        type="button"
                      >
                        <span dangerouslySetInnerHTML={{ __html: preset.icon }} />
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              {badgeIcon && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="p-4 rounded-lg border bg-background flex items-center gap-3">
                    <span className="text-sm font-medium">Player Name</span>
                    <span
                      className="inline-flex items-center justify-center w-5 h-5"
                      dangerouslySetInnerHTML={{ __html: badgeIcon }}
                    />
                    <span className="text-xs text-muted-foreground">
                      (hover to see: {badgeDescription || "description"})
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={handleSaveBadge} className="flex-1">
                  {editingBadge ? "Update Badge" : "Create Badge"}
                </Button>
                {editingBadge && (
                  <Button variant="outline" onClick={resetBadgeForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Existing Badges List */}
            <div className="space-y-2">
              <h3 className="font-semibold">Existing Badges</h3>
              <ScrollArea className="h-[300px] rounded-md border">
                {allBadges && allBadges.length > 0 ? (
                  <div className="space-y-2 p-4">
                    {allBadges.map((badge: any) => (
                      <div
                        key={badge._id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <span
                              className="inline-flex items-center justify-center w-6 h-6"
                              dangerouslySetInnerHTML={{ __html: badge.icon }}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{badge.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {badge.description}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditBadge(badge)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteBadge(badge._id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No badges created yet. Create one above!
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Assign to Players Tab */}
          <TabsContent value="assign" className="space-y-4">
            {/* Search Players */}
            <div className="space-y-2">
              <Label htmlFor="playerSearch">Search Players</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="playerSearch"
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
                        onClick={() => setSelectedPlayer(player)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedPlayer?._id === player._id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium flex items-center gap-2">
                              {player.name}
                              {player.badges?.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  {player.badges.map((badge: any) => (
                                    <span
                                      key={badge._id}
                                      className="inline-flex items-center justify-center w-4 h-4"
                                      dangerouslySetInnerHTML={{ __html: badge.icon }}
                                    />
                                  ))}
                                </span>
                              )}
                            </div>
                            <div className="text-sm opacity-75">{player.email}</div>
                          </div>
                          {player.badges?.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                              {player.badges.length} badge{player.badges.length !== 1 ? "s" : ""}
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

            {/* Badge Selection and Assignment */}
            {selectedPlayer && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">
                  Managing badges for: {selectedPlayer.name}
                </h3>

                {/* Current Badges */}
                {selectedPlayer.badges && selectedPlayer.badges.length > 0 && (
                  <div className="space-y-2">
                    <Label>Current Badges</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedPlayer.badges.map((badge: any) => (
                        <div
                          key={badge._id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted"
                        >
                          <span
                            className="inline-flex items-center justify-center w-5 h-5"
                            dangerouslySetInnerHTML={{ __html: badge.icon }}
                          />
                          <span className="text-sm font-medium">{badge.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 ml-1"
                            onClick={() => handleRemoveBadge(selectedPlayer._id, badge._id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assign New Badge */}
                <div className="space-y-2">
                  <Label>Assign New Badge</Label>
                  <div className="flex gap-2">
                    <select
                      value={selectedBadgeForAssignment || ""}
                      onChange={(e) => setSelectedBadgeForAssignment(e.target.value as Id<"badges">)}
                      className="flex-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Select a badge...</option>
                      {allBadges?.filter((badge: any) => 
                        !selectedPlayer.badges?.some((pb: any) => pb._id === badge._id)
                      ).map((badge: any) => (
                        <option key={badge._id} value={badge._id}>
                          {badge.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={handleAssignBadge}
                      disabled={!selectedBadgeForAssignment}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Assign
                    </Button>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedPlayer(null);
                    setSelectedBadgeForAssignment(null);
                  }}
                  className="w-full"
                >
                  Done
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
