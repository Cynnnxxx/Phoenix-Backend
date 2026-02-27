# Anticheat & Game Systems Documentation

This backend now includes a comprehensive anticheat system, ban management, rewards system, and fully working Battle Pass for Chapter 2 Season 2 (12.41).

## 🛡️ Anticheat System

### Features
- **Movement Detection**: Detects speed hacks, fly hacks, and teleportation
- **Kill Tracking**: Identifies aimbots, ESP/wallhacks, and rapid fire
- **Automatic Actions**: Warns, kicks, or bans players based on violation severity
- **Violation Logging**: All violations are logged to the database for review

### How It Works

The anticheat system automatically monitors:
- Player movement (position, velocity)
- Kill statistics (distance, headshot percentage, rapid kills)
- Suspicious patterns

Violations are scored 1-10 in severity:
- **1-3**: Minor violations (warning)
- **4-6**: Moderate violations (kick)
- **7-9**: Severe violations (temporary ban)
- **10**: Critical violations (permanent ban)

### Database Collections

#### `anticheat_logs`
Stores all detected violations:
```javascript
{
  accountId: String,
  username: String,
  violationType: String, // "speed_hack", "aimbot", "teleport", etc.
  severity: Number, // 1-10
  detectedAt: Date,
  gameSession: String,
  details: Object,
  actionTaken: String, // "warning", "kick", "temp_ban", "permanent_ban"
  resolved: Boolean
}
```

#### `bans`
Stores all player bans:
```javascript
{
  accountId: String,
  username: String,
  banType: String, // "matchmaking", "competitive", "permanent"
  reason: String,
  bannedBy: String,
  bannedAt: Date,
  expiresAt: Date, // null = permanent
  isActive: Boolean,
  metadata: Object
}
```

## 🎮 Ban Commands

### Discord Commands

#### `/matchmake-ban`
Ban a player from matchmaking.

**Usage:**
```
/matchmake-ban username:<player> duration:<time> reason:<optional>
```

**Duration formats:**
- `1h` - 1 hour
- `24h` - 24 hours
- `7d` - 7 days
- `30d` - 30 days
- `permanent` - Permanent ban

**Example:**
```
/matchmake-ban username:Cheater123 duration:7d reason:Speed hacking
```

#### `/competitive-ban`
Ban a player from competitive/arena modes.

**Usage:**
```
/competitive-ban username:<player> duration:<time> reason:<optional>
```

**Example:**
```
/competitive-ban username:Cheater123 duration:permanent reason:Aimbotting in Arena
```

## 💰 Rewards System

### V-Bucks Rewards
- **Per Kill**: 25 V-Bucks
- **Per Win**: 100 V-Bucks

### XP Rewards
- **Per Kill**: 50 XP
- **Per Win**: 300 XP
- **XP Per Level**: 80,000 XP (Chapter 2 Season 2 standard)

### API Endpoints

#### Report Kill
```http
POST /api/game/kill
Content-Type: application/json

{
  "killerAccountId": "account-id",
  "victimAccountId": "victim-id",
  "distance": 150,
  "headshot": true,
  "position": { "x": 0, "y": 0, "z": 0 },
  "velocity": { "x": 0, "y": 0, "z": 0 }
}
```

**Response:**
```json
{
  "success": true,
  "rewards": {
    "vbucks": 25,
    "xp": 50,
    "newLevel": 15
  }
}
```

#### Report Win
```http
POST /api/game/win
Content-Type: application/json

{
  "accountId": "account-id",
  "placement": 1,
  "eliminations": 10
}
```

**Response:**
```json
{
  "success": true,
  "rewards": {
    "vbucks": 100,
    "xp": 300,
    "newLevel": 16,
    "totalWins": 42
  }
}
```

#### Report Movement (Anticheat)
```http
POST /api/game/movement
Content-Type: application/json

{
  "accountId": "account-id",
  "position": { "x": 1000, "y": 2000, "z": 500 },
  "velocity": { "x": 10, "y": 5, "z": 0 }
}
```

#### Award XP Directly
```http
POST /api/game/xp
Content-Type: application/json

{
  "accountId": "account-id",
  "xp": 1000
}
```

## 🎖️ Battle Pass System (Season 12 - Chapter 2 Season 2)

### Features
- **Fully Functional**: All rewards grant properly
- **XP-Based Leveling**: 80,000 XP per level
- **Automatic Reward Granting**: Rewards are granted when leveling up
- **Free & Paid Tiers**: Separate rewards for free and Battle Pass owners
- **Max Level**: 1000 (Battle Pass tiers cap at 100)

### How It Works

1. **Purchase Battle Pass**: Use `/fortnite/api/game/v2/profile/*/client/PurchaseCatalogEntry`
2. **Earn XP**: Through kills, wins, or direct XP awards
3. **Level Up**: Every 80,000 XP = 1 level
4. **Receive Rewards**: Automatically granted when reaching new tiers

### Battle Pass Purchase
- **Battle Pass**: Grants access to paid rewards for current level
- **Battle Bundle**: Battle Pass + 25 tier boost
- **Tier Purchase**: Buy individual tiers

### Reward Types
- **Cosmetics**: Skins, pickaxes, gliders, emotes, wraps
- **V-Bucks**: Currency rewards (100 V-Bucks at various tiers)
- **XP Boosts**: Season match boost and friend boost
- **Banners**: Banner tokens
- **Loading Screens**: Cosmetic loading screens

### Season 12 Highlights
- **Deadpool (Midas)**: Tier 100 reward
- **TNTina**: Tier 40 reward
- **Meowscles**: Tier 60 reward
- **Skye (Photographer)**: Tier 80 reward
- **Brutus (Henchman Tough)**: Tier 20 reward

## 🔧 Configuration

### config.json Settings

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

## 📊 Monitoring

### Check Violations
Query the `anticheat_logs` collection to see all violations:
```javascript
db.anticheat_logs.find({ accountId: "account-id" }).sort({ detectedAt: -1 })
```

### Check Bans
Query the `bans` collection:
```javascript
db.bans.find({ isActive: true })
```

### Check Player Stats
The XP and level are saved in the `athena` profile:
```javascript
{
  "stats": {
    "attributes": {
      "book_xp": 160000,
      "book_level": 3,
      "book_purchased": true,
      "lifetime_wins": 10
    }
  }
}
```

## 🚀 Integration with Game Server

### Game Server Requirements

Your game server should send HTTP requests to these endpoints:

1. **On Kill**: POST to `/api/game/kill`
2. **On Win**: POST to `/api/game/win`
3. **On Movement** (optional): POST to `/api/game/movement`

### Example Integration (Pseudo-code)

```cpp
// When a player kills another
void OnPlayerKill(Player killer, Player victim, float distance, bool headshot) {
    json data = {
        {"killerAccountId", killer.accountId},
        {"victimAccountId", victim.accountId},
        {"distance", distance},
        {"headshot", headshot},
        {"position", killer.position},
        {"velocity", killer.velocity}
    };
    
    HTTPPost("http://your-backend:3551/api/game/kill", data);
}

// When a player wins
void OnPlayerWin(Player winner, int placement, int eliminations) {
    json data = {
        {"accountId", winner.accountId},
        {"placement", placement},
        {"eliminations", eliminations}
    };
    
    HTTPPost("http://your-backend:3551/api/game/win", data);
}
```

## 🔒 Security

- All ban commands require moderator permissions (configured in `config.json`)
- Anticheat violations are logged with full details
- Bans are checked before allowing matchmaking
- Competitive bans are separate from matchmaking bans

## 📝 Notes

- The anticheat system runs automatically once the backend starts
- Expired bans are cleaned up every hour
- XP and levels are saved to the database immediately
- Battle Pass rewards are granted retroactively if purchased after leveling

## 🐛 Troubleshooting

### Battle Pass not granting rewards
- Check `bEnableBattlepass` is `true` in config.json
- Verify `bBattlePassSeason` is set to `12`
- Ensure Season12.json exists in `responses/Athena/BattlePass/`

### XP not saving
- Check MongoDB connection
- Verify profile exists for the account
- Check backend logs for errors

### Anticheat not working
- Ensure game server is sending movement/kill data
- Check `anticheat_logs` collection for violations
- Verify anticheat system initialized (check backend logs)

### Bans not working
- Check `bans` collection in MongoDB
- Verify ban is active and not expired
- Check backend logs for ban checks

## 📚 Additional Resources

- **Models**: `model/bans.js`, `model/anticheat.js`
- **Anticheat Logic**: `structs/anticheat.js`
- **Battle Pass Logic**: `structs/battlepass.js`
- **Rewards API**: `Api/gamerewards.js`
- **Ban Commands**: `DiscordBot/commands/Admin/matchmake-ban.js`, `competitive-ban.js`

