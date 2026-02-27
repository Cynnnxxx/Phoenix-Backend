# Installation & Setup Guide

## New Features Added

This backend now includes:
1. ✅ **Fully Working Anticheat System** with violation detection
2. ✅ **Ban Commands** (`/matchmake-ban` and `/competitive-ban`)
3. ✅ **V-Bucks Rewards** (25 per kill, 100 per win)
4. ✅ **XP & Leveling System** that saves to database
5. ✅ **Fully Working Battle Pass** for Chapter 2 Season 2 (12.41)

## Installation Steps

### 1. Install Dependencies

If you haven't already, install the required packages:

```bash
npm install
```

or

```bash
bun install
```

### 2. MongoDB Setup

Make sure MongoDB is running and the connection string in `Config/config.json` is correct:

```json
{
  "mongodb": {
    "database": "mongodb://127.0.0.1/c2s2PULSEC2s2"
  }
}
```

The following collections will be created automatically:
- `users` - Player accounts
- `profiles` - Player profiles (athena, common_core, etc.)
- `bans` - Ban records
- `anticheat_logs` - Anticheat violation logs

### 3. Configure Settings

Edit `Config/config.json`:

```json
{
  "bEnableBattlepass": true,
  "bBattlePassSeason": 12,
  "Api": {
    "reasons": {
      "Kill": 25,
      "Win": 100
    }
  }
}
```

### 4. Discord Bot Setup

The ban commands require Discord bot permissions. Make sure:
1. Bot token is set in `config.json`
2. Your Discord ID is in the `moderators` array
3. Bot has proper permissions in your server

### 5. Start the Backend

```bash
npm start
```

or

```bash
node index.js
```

You should see:
```
[astris-backend] booting
[astris-log] TYPE: regular: Backend started listening on port 3551
[astris-log] TYPE: anticheat: Anticheat system initialized
```

## Testing the Features

### Test Anticheat

Send a test request to report movement:

```bash
curl -X POST http://localhost:3551/api/game/movement \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "test-account-id",
    "position": {"x": 1000, "y": 2000, "z": 500},
    "velocity": {"x": 10, "y": 5, "z": 0}
  }'
```

### Test Kill Rewards

```bash
curl -X POST http://localhost:3551/api/game/kill \
  -H "Content-Type: application/json" \
  -d '{
    "killerAccountId": "test-account-id",
    "victimAccountId": "victim-id",
    "distance": 150,
    "headshot": true
  }'
```

Expected response:
```json
{
  "success": true,
  "rewards": {
    "vbucks": 25,
    "xp": 50,
    "newLevel": 1
  }
}
```

### Test Win Rewards

```bash
curl -X POST http://localhost:3551/api/game/win \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "test-account-id",
    "placement": 1,
    "eliminations": 10
  }'
```

Expected response:
```json
{
  "success": true,
  "rewards": {
    "vbucks": 100,
    "xp": 300,
    "newLevel": 1,
    "totalWins": 1
  }
}
```

### Test Ban Commands (Discord)

In your Discord server:

1. Ban from matchmaking:
```
/matchmake-ban username:PlayerName duration:24h reason:Cheating
```

2. Ban from competitive:
```
/competitive-ban username:PlayerName duration:7d reason:Teaming in Arena
```

### Test Battle Pass

1. Create an account and log in
2. Purchase Battle Pass via the in-game store
3. Earn XP through kills/wins or use:
```bash
curl -X POST http://localhost:3551/api/game/xp \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "your-account-id",
    "xp": 80000
  }'
```
4. Check your profile - you should receive rewards for each tier

## Verify Installation

### Check MongoDB Collections

```javascript
// Connect to MongoDB
mongo

// Switch to your database
use c2s2PULSEC2s2

// Check collections
show collections

// Should show:
// - users
// - profiles
// - bans
// - anticheat_logs
```

### Check Backend Logs

Look for these messages on startup:
- `[astris-backend] booting`
- `Backend started listening on port 3551`
- `Bot is up and running!` (if Discord bot enabled)
- `Ignis WebSocket Server started` (if Ignis enabled)

### Check Discord Commands

In Discord, type `/` and you should see:
- `matchmake-ban`
- `competitive-ban`
- All other existing commands

## File Structure

New files added:
```
├── model/
│   ├── bans.js                    # Ban database model
│   └── anticheat.js               # Anticheat log model
├── structs/
│   ├── anticheat.js               # Anticheat system logic
│   └── battlepass.js              # Battle Pass & XP system
├── Api/
│   └── gamerewards.js             # Kill/Win rewards API
├── middleware/
│   └── anticheat.js               # Ban check middleware
├── DiscordBot/commands/Admin/
│   ├── matchmake-ban.js           # Matchmaking ban command
│   └── competitive-ban.js         # Competitive ban command
├── ANTICHEAT_README.md            # Detailed documentation
└── INSTALLATION_GUIDE.md          # This file
```

Modified files:
```
├── index.js                       # Added global variables for rewards
├── routes/
│   ├── mcp.js                     # Integrated battlepass system
│   └── matchmaking.js             # Added ban checks
├── matchmaker/matchmaker.js       # Added ban checks in queue
└── structs/log.js                 # Added anticheat logging
```

## Troubleshooting

### "Cannot find module" errors
Run `npm install` or `bun install` again.

### MongoDB connection errors
1. Make sure MongoDB is running: `mongod`
2. Check connection string in config.json
3. Verify database name matches

### Discord commands not showing
1. Wait a few minutes for Discord to sync
2. Restart the bot
3. Check bot token and permissions

### XP not saving
1. Check MongoDB connection
2. Verify profile exists for the account
3. Check backend logs for errors

### Battle Pass not granting rewards
1. Ensure `bEnableBattlepass: true` in config.json
2. Verify `bBattlePassSeason: 12`
3. Check `responses/Athena/BattlePass/Season12.json` exists

### Anticheat not detecting violations
1. Ensure game server is sending data to the API endpoints
2. Check `anticheat_logs` collection in MongoDB
3. Review backend logs for anticheat messages

## Game Server Integration

To integrate with your game server, you need to send HTTP requests to the backend:

### Required Endpoints

1. **On Kill**: `POST /api/game/kill`
2. **On Win**: `POST /api/game/win`
3. **On Movement** (optional): `POST /api/game/movement`

### Example (C++ with libcurl)

```cpp
#include <curl/curl.h>
#include <json/json.h>

void ReportKill(const std::string& killerAccountId, const std::string& victimAccountId, float distance, bool headshot) {
    CURL* curl = curl_easy_init();
    if (curl) {
        Json::Value data;
        data["killerAccountId"] = killerAccountId;
        data["victimAccountId"] = victimAccountId;
        data["distance"] = distance;
        data["headshot"] = headshot;
        
        Json::StreamWriterBuilder writer;
        std::string jsonStr = Json::writeString(writer, data);
        
        curl_easy_setopt(curl, CURLOPT_URL, "http://localhost:3551/api/game/kill");
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonStr.c_str());
        
        struct curl_slist* headers = NULL;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        
        curl_easy_perform(curl);
        curl_easy_cleanup(curl);
    }
}
```

## Support

For issues or questions:
1. Check `ANTICHEAT_README.md` for detailed documentation
2. Review backend logs for errors
3. Check MongoDB for data consistency
4. Verify all configuration settings

## Notes

- The anticheat system runs automatically once started
- Bans are checked before allowing matchmaking
- XP and levels save immediately to the database
- Battle Pass rewards are granted retroactively if purchased after leveling
- All systems are designed for Chapter 2 Season 2 (12.41)

## Next Steps

1. Configure your game server to send kill/win data
2. Test the ban commands with moderators
3. Monitor the anticheat logs for violations
4. Adjust anticheat thresholds if needed (in `structs/anticheat.js`)
5. Customize rewards in `Api/gamerewards.js` if desired

Enjoy your fully functional backend with anticheat, bans, rewards, and Battle Pass! 🎮

