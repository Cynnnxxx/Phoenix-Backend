const XMLBuilder = require("xmlbuilder");
const uuid = require("uuid");
const bcrypt = require("bcrypt");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const profileManager = require("../structs/profile.js");
const Friends = require("../model/friends.js");
const Arena = require("../model/arena.js");
const Tournament = require("../model/tournament.js");

async function sleep(ms) {
  await new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}

function GetVersionInfo(req) {
  let memory = {
    season: 0,
    build: 0.0,
    CL: "0",
    lobby: "",
  };

  if (req.headers["user-agent"]) {
    let CL = "";

    try {
      let BuildID = req.headers["user-agent"].split("-")[3].split(",")[0];

      if (!Number.isNaN(Number(BuildID))) CL = BuildID;
      else {
        BuildID = req.headers["user-agent"].split("-")[3].split(" ")[0];

        if (!Number.isNaN(Number(BuildID))) CL = BuildID;
      }
    } catch {
      try {
        let BuildID = req.headers["user-agent"].split("-")[1].split("+")[0];

        if (!Number.isNaN(Number(BuildID))) CL = BuildID;
      } catch {}
    }

    try {
      let Build = req.headers["user-agent"].split("Release-")[1].split("-")[0];

      if (Build.split(".").length == 3) {
        let Value = Build.split(".");
        Build = Value[0] + "." + Value[1] + Value[2];
      }

      memory.season = Number(Build.split(".")[0]);
      memory.build = Number(Build);
      memory.CL = CL;
      memory.lobby = `LobbySeason${memory.season}`;

      if (Number.isNaN(memory.season)) throw new Error();
    } catch {
      if (Number(memory.CL) < 3724489) {
        memory.season = 0;
        memory.build = 0.0;
        memory.CL = CL;
        memory.lobby = "LobbySeason0";
      } else if (Number(memory.CL) <= 3790078) {
        memory.season = 1;
        memory.build = 1.0;
        memory.CL = CL;
        memory.lobby = "LobbySeason1";
      } else {
        memory.season = 2;
        memory.build = 2.0;
        memory.CL = CL;
        memory.lobby = "LobbyWinterDecor";
      }
    }
  }

  return memory;
}

function getContentPages(req) {
  const memory = GetVersionInfo(req);

  // Read file with utf8 and strip possible BOM to avoid JSON.parse errors
  const contentPath = path.join(__dirname, "..", "responses", "contentpages.json");
  let raw;
  try {
    raw = fs.readFileSync(contentPath, "utf8");
  } catch (err) {
    // If file can't be read return an empty object to avoid crashing
    return {};
  }

  // Remove BOM if present
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  let contentpages;
  try {
    contentpages = JSON.parse(raw);
  } catch (err) {
    // If parsing fails, return empty object rather than throwing
    return {};
  }

  let Language = "en";

  try {
    if (req.headers["accept-language"]) {
      if (
        req.headers["accept-language"].includes("-") &&
        req.headers["accept-language"] != "es-419"
      ) {
        Language = req.headers["accept-language"].split("-")[0];
      } else {
        Language = req.headers["accept-language"];
      }
    }
  } catch {}

  const modes = [
    "saveTheWorldUnowned",
    "battleRoyale",
    "creative",
    "saveTheWorld",
  ];
  const news = ["savetheworldnews", "battleroyalenews"];

  try {
    modes.forEach((mode) => {
      if (contentpages.subgameselectdata && contentpages.subgameselectdata[mode] && contentpages.subgameselectdata[mode].message) {
        const title = contentpages.subgameselectdata[mode].message.title;
        const body = contentpages.subgameselectdata[mode].message.body;
        contentpages.subgameselectdata[mode].message.title =
          title && typeof title === "object" && title[Language] ? title[Language] : (typeof title === "string" ? title : "");
        contentpages.subgameselectdata[mode].message.body =
          body && typeof body === "object" && body[Language] ? body[Language] : (typeof body === "string" ? body : "");
      }
    });
  } catch {}

  try {
    if (memory.build < 5.3) {
      news.forEach((mode) => {
        if (contentpages[mode] && contentpages[mode].news && Array.isArray(contentpages[mode].news.messages)) {
          if (contentpages[mode].news.messages[0]) contentpages[mode].news.messages[0].image =
            "https://cdn.discordapp.com/attachments/927739901540188200/930879507496308736/discord.png";
          if (contentpages[mode].news.messages[1]) contentpages[mode].news.messages[1].image =
            "https://i.imgur.com/ImIwpRm.png";
        }
      });
    }
  } catch {}

  try {
    if (contentpages.dynamicbackgrounds && contentpages.dynamicbackgrounds.backgrounds && Array.isArray(contentpages.dynamicbackgrounds.backgrounds.backgrounds)) {
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = `season${memory.season}`;
      contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = `season${memory.season}`;

      if (memory.season == 10) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
          "seasonx";
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage =
          "seasonx";
      }

      if (memory.build == 14.40 || memory.build == 17.30) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
          "summer";
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage =
          "summer";
      }

      if (memory.build == 13.40) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
          "winter2021";
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://raw.githubusercontent.com/CynxDEV-OGFN/image/refs/heads/main/7f6cW5.jpg";
        if (contentpages.subgameinfo && contentpages.subgameinfo.battleroyale) {
          contentpages.subgameinfo.battleroyale.image =
            "https://motionbgs.com/media/3101/fortnite-stormy-sky.960x540.mp4";
        }
        if (contentpages.specialoffervideo) contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
      }

      if (memory.season === 15 || memory.build === 15.3) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://fnggcdn.com/assets-s/baDhte.jpg";
      }

      if (memory.season == 20) {
        if (memory.build == 20.4) {
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
            "https://cdn2.unrealengine.com/t-bp20-40-armadillo-glowup-lobby-2048x2048-2048x2048-3b83b887cc7f.jpg";
        } else {
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
            "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png";
        }
      }

      if (memory.season == 21) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/s21-lobby-background-2048x1024-2e7112b25dc3.jpg";

        if (memory.build == 21.1) {
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
            "season2100";
        }
        if (memory.build == 21.3) {
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
            "https://cdn2.unrealengine.com/nss-lobbybackground-2048x1024-f74a14565061.jpg";
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
            "season2130";
        }
      }

      if (memory.season == 22) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/t-bp22-lobby-square-2048x2048-2048x2048-e4e90c6e8018.jpg";
      }

      if (memory.season == 23) {
        if (memory.build == 23.1) {
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
            "https://cdn2.unrealengine.com/t-bp23-winterfest-lobby-square-2048x2048-2048x2048-277a476e5ca6.png";
          if (contentpages.specialoffervideo) contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
        } else {
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
            "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png";
        }
      }

      if (memory.season == 24) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
          "defaultnotris";
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://fnggcdn.com/assets/cJ4jMq.png";
      }

      if (memory.season == 25) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/s25-lobby-4k-4096x2048-4a832928e11f.jpg";
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
          "https://cdn2.unrealengine.com/fn-shop-ch4s3-04-1920x1080-785ce1d90213.png";

        if (memory.build == 25.11) {
          contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage =
            "https://cdn2.unrealengine.com/t-s25-14dos-lobby-4096x2048-2be24969eee3.jpg";
        }
      }

      if (memory.season == 27) {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage =
          "https://cdn2.unrealengine.com/t-s25-14dos-lobby-4096x2048-2be24969eee3.jpg";
      }
    }
  } catch {}

  // Add Daily section to shop sections for vertical scrollable layout
  try {
    if (
      contentpages.shopSections &&
      contentpages.shopSections.sectionList &&
      contentpages.shopSections.sectionList.sections &&
      Array.isArray(contentpages.shopSections.sectionList.sections)
    ) {
      // Update Featured section to show Daily items
      const featuredSection =
        contentpages.shopSections.sectionList.sections.find(
          (s) => s.sectionId === "Featured"
        );
      if (featuredSection) {
        featuredSection.sectionDisplayName = "Featured";
      }

      // Add Daily section if it doesn't exist
      const hasDailySection =
        contentpages.shopSections.sectionList.sections.some(
          (s) => s.sectionId === "Daily"
        );
      if (!hasDailySection) {
        contentpages.shopSections.sectionList.sections.push({
          bSortOffersByOwnership: false,
          bShowIneligibleOffersIfGiftable: true,
          bEnableToastNotification: true,
          background: {
            stage: "Summer",
            _type: "Summer",
            key: "lobby",
          },
          _type: "ShopSection",
          landingPriority: 80,
          bHidden: false,
          sectionId: "Daily",
          bShowTimer: true,
          sectionDisplayName: "Daily",
          bShowIneligibleOffers: true,
        });
      }
    }
  } catch {}

  return contentpages;
}

function getItemShop() {
  const catalogPath = path.join(__dirname, "..", "responses", "catalog.json");
  const catalogRaw = fs.readFileSync(catalogPath, "utf8");
  const catalog = JSON.parse(catalogRaw);

  const catalogConfigPath = path.join(__dirname, "..", "Config", "catalog_config.json");
  const CatalogConfigRaw = fs.readFileSync(catalogConfigPath, "utf8");
  const CatalogConfig = JSON.parse(CatalogConfigRaw);

  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(24, 0, 0, 0);
  const todayOneMinuteBeforeMidnight = new Date(
    todayAtMidnight.getTime() - 60000
  );
  const isoDate = todayOneMinuteBeforeMidnight.toISOString();

  try {
    for (let value in CatalogConfig) {
      if (!Array.isArray(CatalogConfig[value].itemGrants)) continue;
      if (CatalogConfig[value].itemGrants.length == 0) continue;

      const CatalogEntry = {
        devName: "",
        offerId: "",
        fulfillmentIds: [],
        dailyLimit: -1,
        weeklyLimit: -1,
        monthlyLimit: -1,
        categories: [],
        prices: [
          {
            currencyType: "MtxCurrency",
            currencySubType: "",
            regularPrice: 0,
            finalPrice: 0,
            saleExpiration: "9999-12-02T01:12:00Z",
            basePrice: 0,
          },
        ],
        meta: {
          SectionId: "Daily",
          TileSize: "Small",
        },
        matchFilter: "",
        filterWeight: 0,
        appStoreId: [],
        requirements: [],
        offerType: "StaticPrice",
        giftInfo: {
          bIsEnabled: true,
          forcedGiftBoxTemplateId: "",
          purchaseRequirements: [],
          giftRecordIds: [],
        },
        refundable: false,
        metaInfo: [
          { Key: "SectionId", Value: "Daily" },
          { Key: "TileSize", Value: "Small" },
        ],
        displayAssetPath: "",
        itemGrants: [],
        sortPriority: 0,
        catalogGroupPriority: 0,
      };

      if (CatalogConfig[value].SectionId) {
        CatalogEntry.meta.SectionId = CatalogConfig[value].SectionId;
        const sectionMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "SectionId"
        );
        if (sectionMeta) sectionMeta.Value = CatalogConfig[value].SectionId;
      }
      if (CatalogConfig[value].TileSize) {
        CatalogEntry.meta.TileSize = CatalogConfig[value].TileSize;
        const tileMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "TileSize"
        );
        if (tileMeta) tileMeta.Value = CatalogConfig[value].TileSize;
      }
      if (typeof CatalogConfig[value].refundable === "boolean") {
        CatalogEntry.refundable = CatalogConfig[value].refundable;
      }

      let storefrontName = "BRDailyStorefront";

      if (value.toLowerCase().startsWith("daily")) {
        storefrontName = "BRDailyStorefront";
        CatalogEntry.sortPriority = -1;
        CatalogEntry.meta.SectionId = "Daily";
        CatalogEntry.meta.TileSize = "Small";
        const sectionMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "SectionId"
        );
        if (sectionMeta) sectionMeta.Value = "Daily";
        const tileMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "TileSize"
        );
        if (tileMeta) tileMeta.Value = "Small";
      } else if (value.toLowerCase().startsWith("featured")) {
        storefrontName = "BRWeeklyStorefront";
        CatalogEntry.meta.SectionId = "Featured";
        CatalogEntry.meta.TileSize = "Small";
        const sectionMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "SectionId"
        );
        if (sectionMeta) sectionMeta.Value = "Featured";
        const tileMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "TileSize"
        );
        if (tileMeta) tileMeta.Value = "Small";
      } else if (value.toLowerCase().startsWith("bundle")) {
        storefrontName = "BRWeeklyStorefront";
        CatalogEntry.meta.SectionId =
          CatalogConfig[value].SectionId || "Featured";
        CatalogEntry.meta.TileSize = CatalogConfig[value].TileSize || "Small";
        const sectionMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "SectionId"
        );
        if (sectionMeta)
          sectionMeta.Value = CatalogConfig[value].SectionId || "Featured";
        const tileMeta = CatalogEntry.metaInfo.find(
          (m) => m.Key === "TileSize"
        );
        if (tileMeta) tileMeta.Value = CatalogConfig[value].TileSize || "Small";
      }

      let i = catalog.storefronts.findIndex((p) => p.name == storefrontName);
      if (i == -1) {
        catalog.storefronts.push({ name: storefrontName, catalogEntries: [] });
        i = catalog.storefronts.length - 1;
      }

      if (typeof CatalogConfig[value].bIsGiftable === "boolean") {
        CatalogEntry.giftInfo.bIsEnabled = CatalogConfig[value].bIsGiftable;
      }

      for (let itemGrant of CatalogConfig[value].itemGrants) {
        if (typeof itemGrant != "string") continue;
        if (itemGrant.length == 0) continue;

        CatalogEntry.requirements.push({
          requirementType: "DenyOnItemOwnership",
          requiredId: itemGrant,
          minQuantity: 1,
        });
        CatalogEntry.itemGrants.push({ templateId: itemGrant, quantity: 1 });
      }

      if (Array.isArray(CatalogConfig[value].additionalGrants)) {
        for (let additionalGrant of CatalogConfig[value].additionalGrants) {
          if (
            typeof additionalGrant !== "string" ||
            additionalGrant.length === 0
          )
            continue;
          CatalogEntry.itemGrants.push({
            templateId: additionalGrant,
            quantity: 1,
          });
        }
      }

      CatalogEntry.prices = [
        {
          currencyType: "MtxCurrency",
          currencySubType: "",
          regularPrice: CatalogConfig[value].price,
          finalPrice: CatalogConfig[value].price,
          saleExpiration: isoDate,
          basePrice: CatalogConfig[value].price,
        },
      ];

      if (CatalogEntry.itemGrants.length > 0) {
        let uniqueIdentifier = crypto
          .createHash("sha1")
          .update(
            `${JSON.stringify(CatalogConfig[value].itemGrants)}_${
              CatalogConfig[value].price
            }`
          )
          .digest("hex");

        CatalogEntry.devName = uniqueIdentifier;
        CatalogEntry.offerId = uniqueIdentifier;

        catalog.storefronts[i].catalogEntries.push(CatalogEntry);
      }
    }
  } catch {}

  return catalog;
}

function getOfferID(offerId) {
  const catalog = getItemShop();

  for (let storefront of catalog.storefronts) {
    let findOfferId = storefront.catalogEntries.find(
      (i) => i.offerId == offerId
    );

    if (findOfferId)
      return {
        name: storefront.name,
        offerId: findOfferId,
      };
  }
}

function MakeID() {
  return uuid.v4();
}

function sendXmppMessageToAll(body) {
  if (!global.Clients) return;
  if (typeof body == "object") body = JSON.stringify(body);

  global.Clients.forEach((ClientData) => {
    ClientData.client.send(
      XMLBuilder.create("message")
        .attribute("from", `xmpp-admin@${global.xmppDomain}`)
        .attribute("xmlns", "jabber:client")
        .attribute("to", ClientData.jid)
        .element("body", `${body}`)
        .up()
        .toString()
    );
  });
}

function sendXmppMessageToId(body, toAccountId) {
  if (!global.Clients) return;
  if (typeof body == "object") body = JSON.stringify(body);

  let receiver = global.Clients.find((i) => i.accountId == toAccountId);
  if (!receiver) return;

  receiver.client.send(
    XMLBuilder.create("message")
      .attribute("from", `xmpp-admin@${global.xmppDomain}`)
      .attribute("to", receiver.jid)
      .attribute("xmlns", "jabber:client")
      .element("body", `${body}`)
      .up()
      .toString()
  );
}

function getPresenceFromUser(fromId, toId, offline) {
  if (!global.Clients) return;

  let SenderData = global.Clients.find((i) => i.accountId == fromId);
  let ClientData = global.Clients.find((i) => i.accountId == toId);

  if (!SenderData || !ClientData) return;

  let xml = XMLBuilder.create("presence")
    .attribute("to", ClientData.jid)
    .attribute("xmlns", "jabber:client")
    .attribute("from", SenderData.jid)
    .attribute("type", offline ? "unavailable" : "available");

  // Ensure lastPresenceUpdate has sane defaults
  const lastPresence = SenderData.lastPresenceUpdate || { away: false, status: "{}" };
  const statusString = typeof lastPresence.status === "string" ? lastPresence.status : JSON.stringify(lastPresence.status || {});

  if (lastPresence.away)
    xml = xml
      .element("show", "away")
      .up()
      .element("status", statusString)
      .up();
  else xml = xml.element("status", statusString).up();

  ClientData.client.send(xml.toString());
}

async function registerUser(discordId, username, email, plainPassword) {
  email = email.toLowerCase();

  if (!username || !email || !plainPassword) {
    return {
      message: "Username, email, or password is required.",
      status: 400,
    };
  }

  if (username.length > 12) {
    username = username.substring(0, 12);
  }

  if (discordId && (await User.findOne({ discordId }))) {
    return { message: "You already created an account!", status: 400 };
  }

  if (!discordId || !/^\d{17,20}$/.test(discordId)) {
    return { message: "Error, Retry.", status: 400 };
  }

  if (/[@]projectreboot\\.dev$/i.test(email)) {
    return { message: "You can't use this email.", status: 400 };
  }

  if (await User.findOne({ email })) {
    return { message: "Email is already in use.", status: 400 };
  }

  const accountId = MakeID().replace(/-/gi, "");
  const matchmakingId = MakeID().replace(/-/gi, "");

  const emailFilter =
    /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
  if (!emailFilter.test(email)) {
    return {
      message: "You did not provide a valid email address.",
      status: 400,
    };
  }
  if (username.length >= 25) {
    return {
      message: "Your username must be less than 25 characters long.",
      status: 400,
    };
  }
  if (username.length < 3) {
    return {
      message: "Your username must be at least 3 characters long.",
      status: 400,
    };
  }
  if (plainPassword.length >= 128) {
    return {
      message: "Your password must be less than 128 characters long.",
      status: 400,
    };
  }
  if (plainPassword.length < 4) {
    return {
      message: "Your password must be at least 4 characters long.",
      status: 400,
    };
  }

  const allowedCharacters =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~".split(
      ""
    );
  for (let character of username) {
    if (!allowedCharacters.includes(character)) {
      return {
        message:
          "Your username has special characters, please remove them and try again.",
        status: 400,
      };
    }
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  try {
    await User.create({
      created: new Date().toISOString(),
      discordId: discordId || null,
      accountId,
      username,
      username_lower: username.toLowerCase(),
      email,
      password: hashedPassword,
      matchmakingId,
    }).then(async (i) => {
      await Profile.create({
        created: i.created,
        accountId: i.accountId,
        profiles: profileManager.createProfiles(i.accountId),
      });
      await Friends.create({ created: i.created, accountId: i.accountId });
    });
  } catch (err) {
    if (err.code == 11000) {
      return { message: `Username or email is already in use.`, status: 400 };
    }

    return {
      message: "An unknown error has occurred, please try again later.",
      status: 400,
    };
  }

  return {
    message: `Successfully created an account with the username **${username}**`,
    status: 200,
  };
}

function DecodeBase64(str) {
  return Buffer.from(str, "base64").toString();
}

function UpdateTokens() {
  fs.writeFileSync(
    "./tokenManager/tokens.json",
    JSON.stringify(
      {
        accessTokens: global.accessTokens,
        refreshTokens: global.refreshTokens,
        clientTokens: global.clientTokens,
      },
      null,
      2
    )
  );
}

async function getDivisionPoints(accountId, statType) {
  const eventListPath = path.join(
    __dirname,
    "./../responses/eventlistactive.json"
  );
  const eventListRaw = fs.readFileSync(eventListPath, "utf8");
  const eventList = JSON.parse(eventListRaw);
  const playerData = await Arena.findOne({ accountId });
  const playerDivision = playerData ? playerData.division : 0;

  const eventWindow = eventList.events[0].eventWindows.find(
    (window) => window.metadata.divisionRank === playerDivision
  );

  if (!eventWindow) {
    console.log("Division non trouvée dans la liste des événements.");
    throw new Error("Division non trouvée dans la liste des événements.");
  }

  const scoringRule = eventList.templates
    .find(
      (template) => template.eventTemplateId === eventWindow.eventTemplateId
    )
    .scoringRules.find((rule) => rule.trackedStat === statType);

  if (scoringRule) {
    const pointsEarned = scoringRule.rewardTiers[0].pointsEarned;
    return pointsEarned;
  }

  return 0;
}

async function getTournamentPoints(statType) {
  const eventListPath = path.join(
    __dirname,
    "./../responses/eventlistactive.json"
  );
  const eventListRaw = fs.readFileSync(eventListPath, "utf8");
  const eventList = JSON.parse(eventListRaw);

  // Find the tournament event (corelg_cup)
  const tournamentEvent = eventList.events.find(
    (event) => event.eventId === "corelg_cup"
  );

  if (!tournamentEvent) {
    console.log("Tournament event not found in event list.");
    return 0;
  }

  // Find the tournament template (corelg_cups)
  const tournamentTemplate = eventList.templates.find(
    (template) => template.eventTemplateId === "corelg_cups"
  );

  if (!tournamentTemplate) {
    console.log("Tournament template not found in event list.");
    return 0;
  }

  // Find the scoring rule for the stat type
  const scoringRule = tournamentTemplate.scoringRules.find(
    (rule) => rule.trackedStat === statType
  );

  if (scoringRule && scoringRule.rewardTiers && scoringRule.rewardTiers.length > 0) {
    // Get points from the first reward tier
    const pointsEarned = scoringRule.rewardTiers[0].pointsEarned;
    const isMultiplicative = scoringRule.rewardTiers[0].multiplicative || false;
    
    // If multiplicative, return the multiplier value, otherwise return points
    return { points: pointsEarned, multiplicative: isMultiplicative };
  }

  return { points: 0, multiplicative: false };
}

async function addEliminationHypePoints(user) {
  const points = await getDivisionPoints(
    user.account_id,
    "TEAM_ELIMS_STAT_INDEX"
  );
  return await updateHypePoints(user, points);
}

async function addTournamentEliminationPoints(user) {
  try {
    const accountId = user.account_id || user.accountId;

    // Atomic update to avoid lost increments under concurrency:
    // - +1 elimination
    // - +2 tournamentPoints
    const userData = await User.findOne({ accountId }).lean();

    const result = await Tournament.findOneAndUpdate(
      { accountId },
      {
        $inc: { eliminations: 1, tournamentPoints: 2 },
        $set: { lastUpdated: new Date() },
        $setOnInsert: {
          username: userData ? userData.username : "Unknown",
          wins: 0,
          matchesPlayed: 0,
          season: "Chapter 3 Season 1",
          version: "19.10",
        },
      },
      { upsert: true, new: true }
    ).lean();

    console.log(
      `[Tournament Kill] +2 for ${accountId}: ${result?.eliminations || 0} elims, ${result?.tournamentPoints || 0} points`
    );
    return { success: true, points: result?.tournamentPoints, eliminations: result?.eliminations };
  } catch (error) {
    console.error("Error adding tournament elimination points:", error);
    return { success: false, error: error.message };
  }
}

async function addVictoryTournamentPoints(user) {
  try {
    const accountId = user.account_id || user.accountId;

    // Atomic update to avoid lost increments:
    // - +1 win
    // - +1 matchesPlayed
    // - +60 tournamentPoints (core cup top 1 = 60 pts, per event list)
    const userData = await User.findOne({ accountId }).lean();

    const result = await Tournament.findOneAndUpdate(
      { accountId },
      {
        $inc: { wins: 1, matchesPlayed: 1, tournamentPoints: 60 },
        $set: { lastUpdated: new Date() },
        $setOnInsert: {
          username: userData ? userData.username : "Unknown",
          eliminations: 0,
          season: "Chapter 3 Season 1",
          version: "19.10",
        },
      },
      { upsert: true, new: true }
    ).lean();

    console.log(
      `[Tournament Win] +60 for ${accountId}: ${result?.wins || 0} wins, ${result?.tournamentPoints || 0} points`
    );
    return { success: true, points: result?.tournamentPoints, wins: result?.wins };
  } catch (error) {
    console.error("Error adding tournament victory points:", error);
    return { success: false, error: error.message };
  }
}

async function addTournamentMatchPlayed(user) {
  try {
    const accountId = user.account_id || user.accountId;

    const userData = await User.findOne({ accountId }).lean();

    const result = await Tournament.findOneAndUpdate(
      { accountId },
      {
        $inc: { matchesPlayed: 1 },
        $set: { lastUpdated: new Date() },
        $setOnInsert: {
          username: userData ? userData.username : "Unknown",
          tournamentPoints: 0,
          wins: 0,
          eliminations: 0,
          season: "Chapter 3 Season 1",
          version: "19.10",
        },
      },
      { upsert: true, new: true }
    ).lean();

    return { success: true, matchesPlayed: result?.matchesPlayed };
  } catch (error) {
    console.error("Error adding tournament match played:", error);
    return { success: false, error: error.message };
  }
}

async function addVictoryHypePoints(user) {
  const points = await getDivisionPoints(
    user.account_id,
    "PLACEMENT_STAT_INDEX"
  );
  return await updateHypePoints(user, points);
}

async function deductBusFareHypePoints(user) {
  const points = await getDivisionPoints(user.account_id, "MATCH_PLAYED_STAT");
  return await updateHypePoints(user, -points);
}

async function calculateTotalHypePoints(user) {
  const accountId = user.account_id || user.accountId;

  const playerData = await Arena.findOne({ accountId });
  const currentHype = playerData?.hype ?? 0;

  return currentHype;
}

async function deductHypePoints(user) {
  const points = await getDivisionPoints(
    user.account_id,
    "TEAM_ELIMS_STAT_INDEX"
  );
  return await deductPoints(user, points);
}

async function updateHypePoints(user, points) {
  const accountId = user.account_id || user.accountId;

  let playerData = await Arena.findOne({ accountId });
  let currentHype = playerData ? playerData.hype : 0;
  let currentDivision = playerData ? playerData.division : 0;

  currentHype += points;

  const nextDivision = getNextDivision(currentHype, currentDivision);
  currentDivision = nextDivision;

  await Arena.updateOne(
    { accountId },
    {
      $set: {
        accountId: accountId,
        hype: currentHype,
        division: currentDivision,
      },
    },
    { upsert: true }
  );

  return {
    success: true,
    data: `Points mis à jour à ${currentHype}, Division actuelle : ${currentDivision}`,
  };
}

async function deductPoints(user, points) {
  const accountId = user.account_id || user.accountId;

  let playerData = await Arena.findOne({ accountId });
  let currentHype = playerData ? playerData.hype : 0;
  let currentDivision = playerData ? playerData.division : 0;

  currentHype -= points;

  const nextDivision = getNextDivision(currentHype, currentDivision);
  currentDivision = nextDivision;

  await Arena.updateOne(
    { accountId },
    {
      $set: {
        accountId: accountId,
        hype: currentHype,
        division: currentDivision,
      },
    },
    { upsert: true }
  );

  return {
    success: true,
    data: `Points mis à jour à ${currentHype}, Division actuelle : ${currentDivision}`,
  };
}

function getNextDivision(hypePoints, currentDivision) {
  const thresholds = [400, 800, 1200, 2000, 3000, 5000, 7500, 10000, 15000];
  for (let i = 0; i < thresholds.length; i++) {
    if (hypePoints < thresholds[i]) return i;
  }
  return currentDivision;
}

function getAccountIdData(UserID) {
  if (!UserID || typeof UserID !== "string") return "";
  // Some clients send "prefix|accountId", others send just "accountId"
  if (UserID.includes("|")) {
    const parts = UserID.split("|");
    return parts[1] || "";
  }
  return UserID;
}

function PlaylistNames(playlist) {
  const p = (playlist || "").toLowerCase();
  if (/^arena_s17_division\d+_duos$/.test(p)) return "Playlist_ShowdownAlt_Duos";
  if (/^arena_s17_division\d+$/.test(p)) return "Playlist_ShowdownAlt_Solo";
  switch (playlist) {
    case "2":
      return "Playlist_DefaultSolo";
    case "10":
      return "Playlist_DefaultDuo";
    case "9":
      return "Playlist_DefaultSquad";
    case "50":
      return "Playlist_50v50";
    case "11":
      return "Playlist_50v50";
    case "13":
      return "Playlist_HighExplosives_Squads";
    case "22":
      return "Playlist_5x20";
    case "36":
      return "Playlist_Blitz_Solo";
    case "37":
      return "Playlist_Blitz_Duos";
    case "19":
      return "Playlist_Blitz_Squad";
    case "33":
      return "Playlist_Carmine";
    case "32":
      return "Playlist_Fortnite";
    case "23":
      return "Playlist_HighExplosives_Solo";
    case "24":
      return "Playlist_HighExplosives_Squads";
    case "44":
      return "Playlist_Impact_Solo";
    case "45":
      return "Playlist_Impact_Duos";
    case "46":
      return "Playlist_Impact_Squads";
    case "35":
      return "Playlist_Playground";
    case "30":
      return "Playlist_SkySupply";
    case "42":
      return "Playlist_SkySupply_Duos";
    case "43":
      return "Playlist_SkySupply_Squads";
    case "41":
      return "Playlist_Snipers";
    case "39":
      return "Playlist_Snipers_Solo";
    case "40":
      return "Playlist_Snipers_Duos";
    case "26":
      return "Playlist_SolidGold_Solo";
    case "27":
      return "Playlist_SolidGold_Squads";
    case "28":
      return "Playlist_ShowdownAlt_Solo";
    case "29":
      return "Playlist_ShowdownAlt_Duos";
    case "solo":
      return "2";
    case "duo":
      return "10";
    case "squad":
      return "9";
    default:
      return playlist;
  }
}

// Tournament functions
async function updateTournamentStats(accountId, stats) {
  try {
    const user = await User.findOne({ accountId });
    if (!user) {
      console.log(`[updateTournamentStats] User not found for accountId: ${accountId}`);
      return;
    }

    const { wins = 0, eliminations = 0, matchesPlayed = 0 } = stats;

    // Calculate tournament points: 10 points per win, 2 points per elimination
    const tournamentPoints = wins * 10 + eliminations * 2;

    console.log(`[updateTournamentStats] Updating stats for ${accountId}: ${wins} wins, ${eliminations} elims, ${matchesPlayed} matches, ${tournamentPoints} points`);

    const tournamentData = await Tournament.findOne({ accountId });

    if (tournamentData) {
      // Update existing tournament data
      const result = await Tournament.updateOne(
        { accountId },
        {
          $set: {
            tournamentPoints: tournamentPoints,
            wins: wins,
            eliminations: eliminations,
            matchesPlayed: matchesPlayed,
            lastUpdated: new Date(),
          },
        }
      );
      console.log(`[updateTournamentStats] Updated existing tournament data. Modified: ${result.modifiedCount}`);
    } else {
      // Create new tournament entry
      const newEntry = await Tournament.create({
        accountId: accountId,
        username: user.username,
        tournamentPoints: tournamentPoints,
        wins: wins,
        eliminations: eliminations,
        matchesPlayed: matchesPlayed,
        season: "Chapter 3 Season 1",
        version: "19.10",
        lastUpdated: new Date(),
      });
      console.log(`[updateTournamentStats] Created new tournament entry for ${accountId}`);
    }

    // Verify the update
    const verifyData = await Tournament.findOne({ accountId });
    if (verifyData) {
      console.log(`[updateTournamentStats] Verification - Saved: ${verifyData.wins} wins, ${verifyData.eliminations} elims, ${verifyData.tournamentPoints} points`);
    }

    // Check if player is now #1 and award vbucks if they haven't received it yet
    // DISABLED: Tournament should not give V-Bucks rewards
    // await checkAndAwardTopPlayer(accountId);
  } catch (error) {
    console.error("Error updating tournament stats:", error);
  }
}

async function checkAndAwardTopPlayer(accountId) {
  try {
    const playerData = await Tournament.findOne({ accountId });
    if (!playerData || playerData.hasReceivedTopReward) return;

    // Get the top player
    const topPlayer = await Tournament.findOne({}).sort({
      tournamentPoints: -1,
      lastUpdated: 1,
    });

    if (!topPlayer || topPlayer.accountId !== accountId) return;

    // Check if this player is truly #1 (no ties)
    const playersWithMorePoints = await Tournament.countDocuments({
      tournamentPoints: { $gt: topPlayer.tournamentPoints },
    });

    if (playersWithMorePoints > 0) return;

    // Award 10k vbucks
    const filter = { accountId: accountId };
    const vbucksAmount = 10000;
    const updateCommonCore = {
      $inc: {
        "profiles.common_core.items.Currency:MtxPurchased.quantity":
          vbucksAmount,
      },
    };
    const updateProfile0 = {
      $inc: {
        "profiles.profile0.items.Currency:MtxPurchased.quantity": vbucksAmount,
      },
    };
    const options = { new: true };

    const updatedProfile = await Profile.findOneAndUpdate(
      filter,
      updateCommonCore,
      options
    );

    if (updatedProfile) {
      await Profile.updateOne(filter, updateProfile0);

      const common_core = updatedProfile.profiles.common_core;
      const profile0 = updatedProfile.profiles.profile0;
      const newQuantityProfile0 =
        profile0.items["Currency:MtxPurchased"].quantity + vbucksAmount;

      const purchaseId = uuid.v4();
      const lootList = [
        {
          itemType: "Currency:MtxGiveaway",
          itemGuid: "Currency:MtxGiveaway",
          quantity: vbucksAmount,
        },
      ];

      common_core.items[purchaseId] = {
        templateId: `GiftBox:GB_MakeGood`,
        attributes: {
          fromAccountId: `[Tournament Reward]`,
          lootList: lootList,
          params: {
            userMessage: `Congratulations! You reached #1 in the Tournament!`,
          },
          giftedOn: new Date().toISOString(),
        },
        quantity: 1,
      };

      common_core.rvn += 1;
      common_core.commandRevision += 1;
      await Profile.updateOne(filter, {
        $set: {
          "profiles.common_core": common_core,
          "profiles.profile0.items.Currency:MtxPurchased.quantity":
            newQuantityProfile0,
        },
      });

      // Mark as received
      await Tournament.updateOne(
        { accountId: accountId },
        { $set: { hasReceivedTopReward: true } }
      );

      console.log(
        `[Tournament] Awarded ${vbucksAmount} V-Bucks to ${playerData.username} for reaching #1`
      );
    }
  } catch (error) {
    console.error("Error checking and awarding top player:", error);
  }
}

async function getTournamentStats(accountId) {
  try {
    const tournamentData = await Tournament.findOne({ accountId });
    if (!tournamentData) return null;

    // Calculate current rank
    const rank =
      (await Tournament.countDocuments({
        tournamentPoints: { $gt: tournamentData.tournamentPoints },
      })) +
      (await Tournament.countDocuments({
        tournamentPoints: tournamentData.tournamentPoints,
        lastUpdated: { $lt: tournamentData.lastUpdated },
      })) +
      1;

    return {
      ...tournamentData.toObject(),
      rank: rank,
    };
  } catch (error) {
    console.error("Error getting tournament stats:", error);
    return null;
  }
}

module.exports = {
  sleep,
  GetVersionInfo,
  getContentPages,
  getItemShop,
  getOfferID,
  MakeID,
  sendXmppMessageToAll,
  sendXmppMessageToId,
  getPresenceFromUser,
  registerUser,
  DecodeBase64,
  UpdateTokens,
  getAccountIdData,
  addEliminationHypePoints,
  addVictoryHypePoints,
  deductBusFareHypePoints,
  calculateTotalHypePoints,
  deductHypePoints,
  updateTournamentStats,
  checkAndAwardTopPlayer,
  getTournamentStats,
  addTournamentEliminationPoints,
  addVictoryTournamentPoints,
  addTournamentMatchPlayed,
  PlaylistNames,
};