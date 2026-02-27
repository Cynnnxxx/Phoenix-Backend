const express = require("express");
const functions = require("../structs/functions.js");
const fs = require("fs");
const uuid = require("uuid");
const app = express.Router();
const log = require("../structs/log.js");
const path = require("path");
const { getAccountIdData, addEliminationHypePoints, addVictoryHypePoints, deductBusFareHypePoints, updateTournamentStats, getTournamentStats } = require("./../structs/functions.js");
const User = require("../model/user.js");
const Arena = require("../model/arena.js");
const Tournament = require("../model/tournament.js");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");

app.post("/fortnite/api/game/v2/chat/*/*/*/pc", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chat/*/*/*/pc called");
    let resp = config.chat.EnableGlobalChat ? { "GlobalChatRooms": [{ "roomName": "Project Pulseglobal" }] } : {};

    res.json(resp);
});

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/*", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/tryPlayOnPlatform/account/* called");
    res.setHeader("Content-Type", "text/plain");
    res.send(true);
});

app.get("/launcher/api/public/distributionpoints/", (req, res) => {
    log.debug("GET /launcher/api/public/distributionpoints/ called");
    res.json({
        "distributions": [
            "https://download.epicgames.com/",
            "https://download2.epicgames.com/",
            "https://download3.epicgames.com/",
            "https://download4.epicgames.com/",
            "https://epicgames-download1.akamaized.net/"
        ]
    });
});

app.get("/launcher/api/public/assets/*", async (req, res) => {
    res.json({
        "appName": "FortniteContentBuilds",
        "labelName": "Project Pulse Backend",
        "buildVersion": "++Fortnite+Release-20.00-CL-19458861-Windows",
        "catalogItemId": "5cb97847cee34581afdbc445400e2f77",
        "expires": "9999-12-31T23:59:59.999Z",
        "items": {
            "MANIFEST": {
                "signature": "Project Pulse Backend",
                "distribution": "https://Project Pulse.ol.epicgames.com/",
                "path": "Builds/Fortnite/Content/CloudDir/Project PulseBackend.manifest",
                "hash": "55bb954f5596cadbe03693e1c06ca73368d427f3",
                "additionalDistributions": []
            },
            "CHUNKS": {
                "signature": "Project Pulse Backend",
                "distribution": "https://Project Pulse.ol.epicgames.com/",
                "path": "Builds/Fortnite/Content/CloudDir/Project PulseBackend.manifest",
                "additionalDistributions": []
            }
        },
        "assetId": "FortniteContentBuilds"
    });
})

app.get("/Builds/Fortnite/Content/CloudDir/*.manifest", async (req, res) => {
    res.set("Content-Type", "application/octet-stream")

    const manifest = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Project Pulse Backend.manifest"));

    res.status(200).send(manifest).end();
})

app.get("/Builds/Fortnite/Content/CloudDir/*.chunk", async (req, res) => {
    res.set("Content-Type", "application/octet-stream")

    const chunk = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Project Pulse Backend.chunk"));

    res.status(200).send(chunk).end();
})

app.post("/fortnite/api/game/v2/grant_access/*", async (req, res) => {
    log.debug("POST /fortnite/api/game/v2/grant_access/* called");
    res.json({});
    res.status(204);
})

app.post("/api/v1/user/setting", async (req, res) => {
    log.debug("POST /api/v1/user/setting called");
    res.json([]);
})

app.get("/Builds/Fortnite/Content/CloudDir/*.ini", async (req, res) => {
    const ini = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Full.ini"));

    res.status(200).send(ini).end();
})

app.get("/waitingroom/api/waitingroom", (req, res) => {
    log.debug("GET /waitingroom/api/waitingroom called");
    res.status(204);
    res.end();
}); 

app.get("/socialban/api/public/v1/*", (req, res) => {
    log.debug("GET /socialban/api/public/v1/* called");
    res.json({
        "bans": [],
        "warnings": []
    });
});

app.get("/fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient called");
    res.json({});
});

app.get("/fortnite/api/statsv2/account/:accountId", (req, res) => {
    log.debug(`GET /fortnite/api/statsv2/account/${req.params.accountId} called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/statsproxy/api/statsv2/account/:accountId", (req, res) => {
    log.debug(`GET /statsproxy/api/statsv2/account/${req.params.accountId} called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/fortnite/api/stats/accountId/:accountId/bulk/window/alltime", (req, res) => {
    log.debug(`GET /fortnite/api/stats/accountId/${req.params.accountId}/bulk/window/alltime called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/d98eeaac-2bfa-4bf4-8a59-bdc95469c693", async (req, res) => {
    res.json({
        "playlist": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPE1QRCB4bWxucz0idXJuOm1wZWc6ZGFzaDpzY2hlbWE6bXBkOjIwMTEiIHhtbG5zOnhzaT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2UiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4c2k6c2NoZW1hTG9jYXRpb249InVybjptcGVnOkRBU0g6c2NoZW1hOk1QRDoyMDExIGh0dHA6Ly9zdGFuZGFyZHMuaXNvLm9yZy9pdHRmL1B1YmxpY2x5QXZhaWxhYmxlU3RhbmRhcmRzL01QRUctREFTSF9zY2hlbWFfZmlsZXMvREFTSC1NUEQueHNkIiBwcm9maWxlcz0idXJuOm1wZWc6ZGFzaDpwcm9maWxlOmlzb2ZmLWxpdmU6MjAxMSIgdHlwZT0ic3RhdGljIiBtZWRpYVByZXNlbnRhdGlvbkR1cmF0aW9uPSJQVDMwLjIxM1MiIG1heFNlZ21lbnREdXJhdGlvbj0iUFQyLjAwMFMiIG1pbkJ1ZmZlclRpbWU9IlBUNC4xMDZTIj4KICA8QmFzZVVSTD5odHRwczovL2ZvcnRuaXRlLXB1YmxpYy1zZXJ2aWNlLXByb2QxMS5vbC5lcGljZ2FtZXMuY29tL2F1ZGlvL0phbVRyYWNrcy9PR1JlbWl4LzwvQmFzZVVSTD4KICA8UHJvZ3JhbUluZm9ybWF0aW9uPjwvUHJvZ3JhbUluZm9ybWF0aW9uPgogIDxQZXJpb2QgaWQ9IjAiIHN0YXJ0PSJQVDBTIj4KICAgIDxBZGFwdGF0aW9uU2V0IGlkPSIwIiBjb250ZW50VHlwZT0iYXVkaW8iIHN0YXJ0V2l0aFNBUD0iMSIgc2VnbWVudEFsaWdubWVudD0idHJ1ZSIgYml0c3RyZWFtU3dpdGNoaW5nPSJ0cnVlIj4KICAgICAgPFJlcHJlc2VudGF0aW9uIGlkPSIwIiBhdWRpb1NhbXBsaW5nUmF0ZT0iNDgwMDAiIGJhbmR3aWR0aD0iMTI4MDAwIiBtaW1lVHlwZT0iYXVkaW8vbXA0IiBjb2RlY3M9Im1wNGEuNDAuMiI+CiAgICAgICAgPFNlZ21lbnRUZW1wbGF0ZSBkdXJhdGlvbj0iMjAwMDAwMCIgdGltZXNjYWxlPSIxMDAwMDAwIiBpbml0aWFsaXphdGlvbj0iaW5pdF8kUmVwcmVzZW50YXRpb25JRCQubXA0IiBtZWRpYT0ic2VnbWVudF8kUmVwcmVzZW50YXRpb25JRCRfJE51bWJlciQubTRzIiBzdGFydE51bWJlcj0iMSI+PC9TZWdtZW50VGVtcGxhdGU+CiAgICAgICAgPEF1ZGlvQ2hhbm5lbENvbmZpZ3VyYXRpb24gc2NoZW1lSWRVcmk9InVybjptcGVnOmRhc2g6MjMwMDM6MzphdWRpb19jaGFubmVsX2NvbmZpZ3VyYXRpb246MjAxMSIgdmFsdWU9IjIiPjwvQXVkaW9DaGFubmVsQ29uZmlndXJhdGlvbj4KICAgICAgPC9SZXByZXNlbnRhdGlvbj4KICAgIDwvQWRhcHRhdGlvblNldD4KICA8L1BlcmlvZD4KPC9NUEQ+",
        "playlistType": "application/dash+xml",
        "metadata": {
            "assetId": "",
            "baseUrls": [
                "https://fortnite-public-service-prod11.ol.epicgames.com/audio/JamTracks/OGRemix/"
            ],
            "supportsCaching": true,
            "ucp": "a",
            "version": "f2528fa1-5f30-42ff-8ae5-a03e3b023a0a"
        }
    })
})

app.post("/fortnite/api/feedback/*", (req, res) => {
    log.debug("POST /fortnite/api/feedback/* called");
    res.status(200);
    res.end();
});

app.post("/fortnite/api/statsv2/query", (req, res) => {
    log.debug("POST /fortnite/api/statsv2/query called");
    res.json([]);
});

app.post("/statsproxy/api/statsv2/query", (req, res) => {
    log.debug("POST /statsproxy/api/statsv2/query called");
    res.json([]);
});

app.post("/fortnite/api/game/v2/events/v2/setSubgroup/*", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/events/v2/setSubgroup/* called");
    res.status(204);
    res.end();
});

app.get("/fortnite/api/game/v2/enabled_features", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/enabled_features called");
    res.json([]);
});

app.get("/api/v1/events/Fortnite/download/:accountId", async (req, res) => {
    const accountId = req.params.accountId;

    try {
        // console.log(req.params);
       // console.log("accountId: " + accountId);
        const playerData = await Arena.findOne({ accountId: accountId });
        const hypePoints = playerData ? playerData.hype : 0;
        const division = playerData ? playerData.division : 0;

        const eventsDataPath = path.join(__dirname, "./../responses/eventlistactive.json");
        const events = JSON.parse(fs.readFileSync(eventsDataPath, 'utf-8'));
// console.log("hypePoints: " + hypePoints);
        events.player = {
            accountId: accountId,
            gameId: "Fortnite",
            persistentScores: {
                Hype: hypePoints
            },
            tokens: [`ARENA_S17_Division${division + 1}`]
        };

        res.json(events);

    } catch (error) {
        console.error("Error fetching Arena data:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get("/fortnite/api/game/v2/twitch/*", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/twitch/* called");
    res.status(200);
    res.end();
});

app.get("/fortnite/api/game/v2/world/info", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/world/info called");
    res.json({});
});

app.post("/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc called");
    res.json({});
});

app.get("/presence/api/v1/_/*/last-online", async (req, res) => {
    log.debug("GET /presence/api/v1/_/*/last-online called");
    res.json({})
})

app.get("/fortnite/api/receipts/v1/account/*/receipts", (req, res) => {
    log.debug("GET /fortnite/api/receipts/v1/account/*/receipts called");
    res.json([]);
});

app.get("/fortnite/api/game/v2/leaderboards/cohort/*", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/leaderboards/cohort/* called");
    res.json([]);
});

app.post("/api/v1/assets/Fortnite/*/*", async (req, res) => {
    log.debug("POST /api/v1/assets/Fortnite/*/* called");
    if (req.body.hasOwnProperty("FortCreativeDiscoverySurface") && req.body.FortCreativeDiscoverySurface == 0) {
        const discovery_api_assets = require("./../responses/Discovery/discovery_api_assets.json");
        res.json(discovery_api_assets)
    } else {
        res.json({
            "FortCreativeDiscoverySurface": {
                "meta": {
                    "promotion": req.body.FortCreativeDiscoverySurface || 0
                },
                "assets": {}
            }
        })
    }
})

app.get("/region", async (req, res) => {
    log.debug("GET /region called");
    res.json({
        "continent": {
            "code": "EU",
            "geoname_id": 6255148,
            "names": {
                "de": "Europa",
                "en": "Europe",
                "es": "Europa",
                "it": "Europa",
                "fr": "Europe",
                "ja": "ヨーロッパ",
                "pt-BR": "Europa",
                "ru": "Европа",
                "zh-CN": "欧洲"
            }
        },
        "country": {
            "geoname_id": 2635167,
            "is_in_european_union": false,
            "iso_code": "GB",
            "names": {
                "de": "UK",
                "en": "United Kingdom",
                "es": "RU",
                "it": "Stati Uniti",
                "fr": "Royaume Uni",
                "ja": "英国",
                "pt-BR": "Reino Unido",
                "ru": "Британия",
                "zh-CN": "英国"
            }
        },
        "subdivisions": [
            {
                "geoname_id": 6269131,
                "iso_code": "ENG",
                "names": {
                    "de": "England",
                    "en": "England",
                    "es": "Inglaterra",
                    "it": "Inghilterra",
                    "fr": "Angleterre",
                    "ja": "イングランド",
                    "pt-BR": "Inglaterra",
                    "ru": "Англия",
                    "zh-CN": "英格兰"
                }
            },
            {
                "geoname_id": 3333157,
                "iso_code": "KEC",
                "names": {
                    "en": "Royal Kensington and Chelsea"
                }
            }
        ]
    })
})

app.all("/v1/epic-settings/public/users/*/values", async (req, res) => {
    const epicsettings = require("./../responses/epic-settings.json");
    res.json(epicsettings)
})

app.get("/fortnite/api/game/v2/br-inventory/account/*", async (req, res) => {
    log.debug(`GET /fortnite/api/game/v2/br-inventory/account/${req.params.accountId} called`);
    res.json({
        "stash": {
            "globalcash": 0
        }
    })
})

app.get("/hotconfigs/v2/livefn.json", async (req, res) => {
    log.debug("GET /hotconfigs/v2/livefn.json called");

    res.json({
        "HotConfigData": [
        {
          "AppId": "livefn",
          "EpicApp": "FortniteLivefn",
          "Modules": [
            {
              "ModuleName": "GameServiceMcp",
              "Endpoints": {
                "Android": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "DedicatedServer": "fngw-mcp-ds-livefn.ol.epicgames.com",
                "Default": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "IOS": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Linux": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Mac": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "PS4": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "PS5": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Switch": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "Windows": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "XB1": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "XSX": "fngw-mcp-gc-livefn.ol.epicgames.com",
                "XboxOneGDK": "fngw-mcp-gc-livefn.ol.epicgames.com",
              },
            },
          ],
        },
      ],
    })
})

app.post("/publickey/v2/publickey", async (req, res) => {
    const body = req.body || {};
    return res.json({
        "key": body.key,
        "accountId": req.query.accountId,
        "key_guid": uuid.v4(),
        //"kid": "20230621",
        "expiration": "9999-12-31T23:59:59.999Z",
        "jwt": "Interlude",
        "type2": "legacy",
    });
})

app.post("/publickey/v2/publickey/", async (req, res) => {
    const body = req.body || {};
    return res.json({
        "key": body.key,
        "accountId": req.query.accountId || "Havoc",
        "key_guid": uuid.v4(),
        //"kid": "20230621",
        "expiration": "9999-12-31T23:59:59.999Z",
        "jwt": "Interlude",
        "type": "legacy",
    });
})

app.post("/datarouter/api/v1/public/data", async (req, res) => {
    try {
        const accountId = getAccountIdData(req.query.UserID);
        const data = req.body.Events;

        if (Array.isArray(data) && data.length > 0) {
            const findUser = await User.findOne({accountId});

            if (findUser) {
                for (const event of data) {
                    const { EventName, ProviderType, PlayerKilledPlayerEventCount } = event;

                    if (EventName && ProviderType === "Client") {
                        const playerKills = Number(PlayerKilledPlayerEventCount) || 0;

                        switch (EventName) {
                            case "Athena.ClientWonMatch": // When a player wins a match

                                await addVictoryHypePoints(findUser);

                                console.log(`Added victory hype points for user: ${accountId}`);

                                // Mark player to receive V-Bucks when returning to lobby
                                global.gameFinishedReward[accountId] = true;

                                // Track win reward: 150 V-Bucks
                                if (!global.gameRewards[accountId]) {
                                    global.gameRewards[accountId] = { eliminations: 0, won: false, matchCompleted: false, matchesCompleted: 0, xpEarned: 0 };
                                }
                                global.gameRewards[accountId].won = true;
                                global.gameRewards[accountId].matchCompleted = true;
                                // Increment match completion counter for level up rewards (1 match = 1 level up)
                                global.gameRewards[accountId].matchesCompleted = (global.gameRewards[accountId].matchesCompleted || 0) + 1;
                                
                                // Track XP from win (typically 10,000-15,000 XP for a win)
                                const winXP = event.TotalXp || event.totalXp || event.XP || event.xp || 12000;
                                global.gameRewards[accountId].xpEarned = (global.gameRewards[accountId].xpEarned || 0) + winXP;

                                // Update tournament stats (win + eliminations from this match)
                                try {
                                    const tournamentData = await getTournamentStats(accountId);
                                    const currentWins = tournamentData ? tournamentData.wins : 0;
                                    const currentEliminations = tournamentData ? tournamentData.eliminations : 0;
                                    const currentMatchesPlayed = tournamentData ? tournamentData.matchesPlayed : 0;
                                    const matchEliminations = global.gameRewards[accountId] ? global.gameRewards[accountId].eliminations : 0;
                                    
                                    await updateTournamentStats(accountId, {
                                        wins: currentWins + 1,
                                        eliminations: currentEliminations + matchEliminations,
                                        matchesPlayed: currentMatchesPlayed + 1
                                    });
                                } catch (err) {
                                    console.error("Error updating tournament stats for win:", err);
                                }

                                break;
                            case "Combat.AthenaClientEngagement": // When a player kill someone

                                for (let i = 0; i < playerKills; i++) {
                                    await addEliminationHypePoints(findUser);
                                    console.log(`Added elimination hype points for user: ${accountId}`);
                                }

                                // Track elimination rewards: 25 V-Bucks per kill
                                if (!global.gameRewards[accountId]) {
                                    global.gameRewards[accountId] = { eliminations: 0, won: false, matchCompleted: false, matchesCompleted: 0, xpEarned: 0 };
                                }
                                global.gameRewards[accountId].eliminations += playerKills;
                                
                                // Track XP from eliminations (typically 50 XP per elimination)
                                const killXP = (event.TotalXp || event.totalXp || event.XP || event.xp || 0) + (playerKills * 50);
                                global.gameRewards[accountId].xpEarned = (global.gameRewards[accountId].xpEarned || 0) + (playerKills * 50);

                                break;

                            case "Combat.ClientPlayerDeath": // When a player dies

                                // await deductBusFareHypePoints(findUser);

                               // console.log(`Deducted bus fare hype points for user: ${accountId}`);

                                // Mark player to receive V-Bucks when returning to lobby
                                global.gameFinishedReward[accountId] = true;

                                // Track match completion reward: 25 V-Bucks for completing match
                                if (!global.gameRewards[accountId]) {
                                    global.gameRewards[accountId] = { eliminations: 0, won: false, matchCompleted: false, matchesCompleted: 0, xpEarned: 0 };
                                }
                                global.gameRewards[accountId].matchCompleted = true;
                                // Increment match completion counter for level up rewards (1 match = 1 level up)
                                global.gameRewards[accountId].matchesCompleted = (global.gameRewards[accountId].matchesCompleted || 0) + 1;
                                
                                // Track XP from match completion (base XP for finishing match, typically 5,000-8,000 XP)
                                const matchXP = event.TotalXp || event.totalXp || event.XP || event.xp || 6000;
                                if (!global.gameRewards[accountId].won) {
                                    // Only add match completion XP if they didn't win (win already includes this)
                                    global.gameRewards[accountId].xpEarned = (global.gameRewards[accountId].xpEarned || 0) + matchXP;
                                }

                                // Update tournament stats (match completed + eliminations from this match)
                                try {
                                    // Only update if player didn't win (wins are already tracked above)
                                    if (!global.gameRewards[accountId].won) {
                                        const tournamentData = await getTournamentStats(accountId);
                                        const currentWins = tournamentData ? tournamentData.wins : 0;
                                        const currentEliminations = tournamentData ? tournamentData.eliminations : 0;
                                        const currentMatchesPlayed = tournamentData ? tournamentData.matchesPlayed : 0;
                                        const matchEliminations = global.gameRewards[accountId] ? global.gameRewards[accountId].eliminations : 0;
                                        
                                        await updateTournamentStats(accountId, {
                                            wins: currentWins,
                                            eliminations: currentEliminations + matchEliminations,
                                            matchesPlayed: currentMatchesPlayed + 1
                                        });
                                    }
                                } catch (err) {
                                    console.error("Error updating tournament stats for match completion:", err);
                                }

                                break;
                            default:
                                // Track XP from other events (chests, challenges, etc.)
                                if (event.TotalXp || event.totalXp || event.XP || event.xp) {
                                    const eventXP = event.TotalXp || event.totalXp || event.XP || event.xp;
                                    if (!global.gameRewards[accountId]) {
                                        global.gameRewards[accountId] = { eliminations: 0, won: false, matchCompleted: false, matchesCompleted: 0, xpEarned: 0 };
                                    }
                                    global.gameRewards[accountId].xpEarned = (global.gameRewards[accountId].xpEarned || 0) + eventXP;
                                }
                                log.debug(`Event List: ${EventName}`); // If you want to get all the events, remove the comment from here
                                break;
                        }
                    }
                }
            } else {
                // console.log(`User not found: ${accountId}`);
            }
        }

        res.status(204).end();
    } catch (error) {
        log.error("Error processing data:", error);
        console.log("Error processing data:", error);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = app;