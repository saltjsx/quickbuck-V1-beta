// Example: How to integrate PlayerNameWithTag in other components

import { PlayerNameWithTag } from "~/components/ui/player-name-with-tag";
import type { Id } from "convex/_generated/dataModel";

// Example 1: In a message list
function MessageItem({ message }: { message: any }) {
  return (
    <div className="message">
      <PlayerNameWithTag
        playerId={message.senderId}
        playerName={message.senderName}
        className="font-semibold"
      />
      <p>{message.content}</p>
    </div>
  );
}

// Example 2: In a transaction history
function TransactionRow({ transaction }: { transaction: any }) {
  return (
    <tr>
      <td>
        <PlayerNameWithTag
          playerId={transaction.fromPlayerId}
          playerName={transaction.fromPlayerName}
        />
      </td>
      <td>→</td>
      <td>
        <PlayerNameWithTag
          playerId={transaction.toPlayerId}
          playerName={transaction.toPlayerName}
        />
      </td>
      <td>{transaction.amount}</td>
    </tr>
  );
}

// Example 3: In a company owner display
function CompanyCard({ company }: { company: any }) {
  return (
    <div className="company-card">
      <h3>{company.name}</h3>
      <div className="owner-info">
        <span className="text-muted-foreground">Owner:</span>
        <PlayerNameWithTag
          playerId={company.ownerId}
          playerName={company.ownerName}
          className="ml-2"
        />
      </div>
    </div>
  );
}

// Example 4: In a mod panel player list
function PlayerListItem({ player }: { player: any }) {
  return (
    <div className="flex items-center justify-between p-3 border rounded">
      <div className="flex items-center gap-3">
        <img src={player.avatar} alt="" className="w-8 h-8 rounded-full" />
        <PlayerNameWithTag
          playerId={player._id}
          playerName={player.name}
        />
      </div>
      <div className="actions">
        <button>Warn</button>
        <button>Ban</button>
      </div>
    </div>
  );
}

// Example 5: In a chat interface
function ChatMessage({ msg }: { msg: any }) {
  return (
    <div className="chat-message">
      <div className="message-header">
        <PlayerNameWithTag
          playerId={msg.authorId}
          playerName={msg.authorName}
          className="text-sm"
        />
        <span className="text-xs text-muted-foreground">{msg.timestamp}</span>
      </div>
      <div className="message-body">{msg.text}</div>
    </div>
  );
}

// Example 6: Simple inline usage
function ProfileHeader({ playerId, playerName }: { playerId: Id<"players">, playerName: string }) {
  return (
    <h1>
      <PlayerNameWithTag playerId={playerId} playerName={playerName} />
    </h1>
  );
}

// The component automatically:
// - Fetches the player's tag from the database
// - Applies custom username color if set
// - Displays the tag with custom color if it exists
// - Falls back to just the username if no tag exists
