import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Skeleton } from "~/components/ui/skeleton";
import { PlayerNameWithTag } from "~/components/ui/player-name-with-tag";
import {
  Inbox,
  Send,
  Trash2,
  Mail,
  MailOpen,
  Search,
  X,
  ShieldCheck,
} from "lucide-react";
import type { Id } from "convex/_generated/dataModel";
import { getAuth } from "@clerk/react-router/ssr.server";
import { redirect } from "react-router";
import type { Route } from "./+types/messages";

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  if (!userId) {
    return redirect("/sign-in");
  }
  return {};
}

export default function MessagesPage() {
  const [toastMessage, setToastMessage] = useState<string>("");

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Queries
  // @ts-ignore - messages module exists but not yet in generated types
  const inbox = useQuery(api.messages?.getInbox);
  // @ts-ignore - messages module exists but not yet in generated types
  const sentMessages = useQuery(api.messages?.getSentMessages);
  // @ts-ignore - messages module exists but not yet in generated types
  const unreadCount = useQuery(api.messages?.getUnreadCount);

  // Mutations
  // @ts-ignore - messages module exists but not yet in generated types
  const sendMessage = useMutation(api.messages?.sendMessage);
  // @ts-ignore - messages module exists but not yet in generated types
  const markAsRead = useMutation(api.messages?.markAsRead);
  // @ts-ignore - messages module exists but not yet in generated types
  const deleteMessage = useMutation(api.messages?.deleteMessage);

  // Search query for finding players
  const [searchQuery, setSearchQuery] = useState("");
  // @ts-ignore - messages module exists but not yet in generated types
  const searchResults = useQuery(
    api.messages?.searchPlayers,
    searchQuery.length > 1 ? { searchQuery } : "skip"
  );

  // State
  const [activeTab, setActiveTab] = useState<"inbox" | "sent" | "compose">(
    "inbox"
  );
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [recipientId, setRecipientId] = useState<Id<"players"> | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Handle message selection and mark as read
  const handleSelectMessage = async (message: any) => {
    setSelectedMessage(message);
    if (!message.isRead && activeTab === "inbox") {
      try {
        await markAsRead({ messageId: message._id });
      } catch (error: any) {
        console.error("Failed to mark as read:", error);
      }
    }
  };

  // Handle delete message
  const handleDeleteMessage = async (messageId: Id<"messages">) => {
    try {
      await deleteMessage({ messageId });
      setSelectedMessage(null);
      showToast("✓ Message deleted successfully");
    } catch (error: any) {
      showToast("✗ Error: " + error.message);
    }
  };

  // Handle send message
  const handleSendMessage = async () => {
    if (!recipientId) {
      showToast("✗ Please select a recipient");
      return;
    }

    if (!messageContent.trim()) {
      showToast("✗ Please enter a message");
      return;
    }

    setIsSending(true);
    try {
      await sendMessage({
        recipientId,
        content: messageContent,
        isMod: false, // Regular player message
      });

      showToast(`✓ Message sent to ${recipientName}`);

      // Reset form
      setMessageContent("");
      setRecipientId(null);
      setRecipientName("");
      setSearchQuery("");
      setActiveTab("sent");
    } catch (error: any) {
      showToast("✗ Error: " + error.message);
    } finally {
      setIsSending(false);
    }
  };

  // Select recipient from search
  const handleSelectRecipient = (player: any) => {
    setRecipientId(player.playerId);
    setRecipientName(player.playerName);
    setSearchQuery("");
  };

  const formatDate = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      const now = Date.now();
      const diff = now - timestamp;
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return "just now";
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return "Unknown date";
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
              <p className="text-muted-foreground">
                Communicate with other players
              </p>
            </div>
            {unreadCount !== undefined && unreadCount > 0 && (
              <Badge variant="default" className="text-lg px-3 py-1">
                {unreadCount} unread
              </Badge>
            )}
          </div>

          {/* Main Content */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Message List */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) =>
                      setActiveTab(v as "inbox" | "sent" | "compose")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="inbox" className="gap-2">
                        <Inbox className="h-4 w-4" />
                        Inbox
                      </TabsTrigger>
                      <TabsTrigger value="sent" className="gap-2">
                        <Send className="h-4 w-4" />
                        Sent
                      </TabsTrigger>
                      <TabsTrigger value="compose" className="gap-2">
                        <Mail className="h-4 w-4" />
                        Compose
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent className="p-0">
                  {activeTab === "inbox" && (
                    <div className="max-h-[600px] overflow-y-auto">
                      {inbox === undefined ? (
                        <div className="space-y-2 p-4">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-20 w-full" />
                          ))}
                        </div>
                      ) : inbox.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                          <Inbox className="h-12 w-12 text-muted-foreground mb-2" />
                          <p className="text-muted-foreground">
                            No messages in inbox
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {inbox.map((message: any) => (
                            <button
                              key={message._id}
                              onClick={() => handleSelectMessage(message)}
                              className={`w-full text-left p-4 hover:bg-accent transition-colors ${
                                selectedMessage?._id === message._id
                                  ? "bg-accent"
                                  : ""
                              } ${!message.isRead ? "font-semibold" : ""}`}
                            >
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  {message.isRead ? (
                                    <MailOpen className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <Mail className="h-4 w-4 text-primary" />
                                  )}
                                  {message.senderTag ? (
                                    <span className="inline-flex items-center gap-2">
                                      <span
                                        style={{
                                          color: message.senderTag.usernameColor || "inherit",
                                        }}
                                        className="text-sm font-medium"
                                      >
                                        {message.senderName}
                                      </span>
                                      <span
                                        style={{
                                          color: message.senderTag.tagColor,
                                          borderColor: message.senderTag.tagColor,
                                        }}
                                        className="px-2 py-0.5 rounded border text-xs font-medium"
                                      >
                                        {message.senderTag.tagText}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-sm">
                                      {message.senderName}
                                    </span>
                                  )}
                                  {message.isMod && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      <ShieldCheck className="h-3 w-3 mr-1" />
                                      MOD
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(message.sentAt)}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {message.content}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "sent" && (
                    <div className="max-h-[600px] overflow-y-auto">
                      {sentMessages === undefined ? (
                        <div className="space-y-2 p-4">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-20 w-full" />
                          ))}
                        </div>
                      ) : sentMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                          <Send className="h-12 w-12 text-muted-foreground mb-2" />
                          <p className="text-muted-foreground">
                            No sent messages
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {sentMessages.map((message: any) => (
                            <button
                              key={message._id}
                              onClick={() => setSelectedMessage(message)}
                              className={`w-full text-left p-4 hover:bg-accent transition-colors ${
                                selectedMessage?._id === message._id
                                  ? "bg-accent"
                                  : ""
                              }`}
                            >
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <Send className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">To: </span>
                                  {message.recipientTag ? (
                                    <span className="inline-flex items-center gap-2">
                                      <span
                                        style={{
                                          color: message.recipientTag.usernameColor || "inherit",
                                        }}
                                        className="text-sm font-medium"
                                      >
                                        {message.recipientName}
                                      </span>
                                      <span
                                        style={{
                                          color: message.recipientTag.tagColor,
                                          borderColor: message.recipientTag.tagColor,
                                        }}
                                        className="px-2 py-0.5 rounded border text-xs font-medium"
                                      >
                                        {message.recipientTag.tagText}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-sm">
                                      {message.recipientName}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(message.sentAt)}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {message.content}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "compose" && (
                    <div className="p-4 space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          To:
                        </label>
                        {recipientId ? (
                          <div className="flex items-center gap-2 p-2 bg-accent rounded-md">
                            <span className="text-sm flex-1">
                              {recipientName}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRecipientId(null);
                                setRecipientName("");
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search for players..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                              />
                            </div>
                            {searchQuery.length > 1 && (
                              <div className="mt-2 border rounded-md max-h-48 overflow-y-auto">
                                {searchResults === undefined ? (
                                  <div className="p-4 text-sm text-muted-foreground">
                                    Searching...
                                  </div>
                                ) : searchResults.length === 0 ? (
                                  <div className="p-4 text-sm text-muted-foreground">
                                    No players found
                                  </div>
                                ) : (
                                  <div className="divide-y">
                                    {searchResults.map((player: any) => (
                                      <button
                                        key={player.playerId}
                                        onClick={() =>
                                          handleSelectRecipient(player)
                                        }
                                        className="w-full text-left p-3 hover:bg-accent transition-colors"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            {player.playerTag ? (
                                              <span className="inline-flex items-center gap-2">
                                                <span
                                                  style={{
                                                    color: player.playerTag.usernameColor || "inherit",
                                                  }}
                                                  className="text-sm font-medium"
                                                >
                                                  {player.playerName}
                                                </span>
                                                <span
                                                  style={{
                                                    color: player.playerTag.tagColor,
                                                    borderColor: player.playerTag.tagColor,
                                                  }}
                                                  className="px-2 py-0.5 rounded border text-xs font-medium"
                                                >
                                                  {player.playerTag.tagText}
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="text-sm">
                                                {player.playerName}
                                              </span>
                                            )}
                                          </div>
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            {player.role}
                                          </Badge>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Message:
                        </label>
                        <Textarea
                          placeholder="Type your message..."
                          value={messageContent}
                          onChange={(e) => setMessageContent(e.target.value)}
                          rows={10}
                          maxLength={2000}
                        />
                        <div className="text-xs text-muted-foreground mt-1 text-right">
                          {messageContent.length} / 2000
                        </div>
                      </div>

                      <Button
                        onClick={handleSendMessage}
                        disabled={!recipientId || !messageContent.trim() || isSending}
                        className="w-full"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {isSending ? "Sending..." : "Send Message"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Message Details */}
            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    {selectedMessage
                      ? activeTab === "inbox"
                        ? "Message Details"
                        : "Sent Message"
                      : "Select a message"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedMessage ? (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between pb-4 border-b">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {activeTab === "inbox" ? "From:" : "To:"}
                            </span>
                            {activeTab === "inbox" ? (
                              selectedMessage.senderTag ? (
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    style={{
                                      color: selectedMessage.senderTag.usernameColor || "inherit",
                                    }}
                                    className="font-medium"
                                  >
                                    {selectedMessage.senderName}
                                  </span>
                                  <span
                                    style={{
                                      color: selectedMessage.senderTag.tagColor,
                                      borderColor: selectedMessage.senderTag.tagColor,
                                    }}
                                    className="px-2 py-0.5 rounded border text-xs font-medium"
                                  >
                                    {selectedMessage.senderTag.tagText}
                                  </span>
                                </span>
                              ) : (
                                <span>{selectedMessage.senderName}</span>
                              )
                            ) : (
                              selectedMessage.recipientTag ? (
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    style={{
                                      color: selectedMessage.recipientTag.usernameColor || "inherit",
                                    }}
                                    className="font-medium"
                                  >
                                    {selectedMessage.recipientName}
                                  </span>
                                  <span
                                    style={{
                                      color: selectedMessage.recipientTag.tagColor,
                                      borderColor: selectedMessage.recipientTag.tagColor,
                                    }}
                                    className="px-2 py-0.5 rounded border text-xs font-medium"
                                  >
                                    {selectedMessage.recipientTag.tagText}
                                  </span>
                                </span>
                              ) : (
                                <span>{selectedMessage.recipientName}</span>
                              )
                            )}
                            {selectedMessage.isMod && (
                              <Badge variant="secondary">
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                MODERATOR
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(selectedMessage.sentAt)}
                          </div>
                        </div>
                        {activeTab === "inbox" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              handleDeleteMessage(selectedMessage._id)
                            }
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        )}
                      </div>
                      <div className="prose dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap">
                          {selectedMessage.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <Mail className="h-16 w-16 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        {activeTab === "compose"
                          ? "Compose a new message"
                          : "Select a message to view its contents"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-lg p-4 min-w-[300px]">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
