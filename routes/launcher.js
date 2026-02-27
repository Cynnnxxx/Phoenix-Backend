const express = require("express");
const app = express.Router();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const Arena = require("../model/arena.js");
const LauncherSessionsManager = require("../IgnisClient/Classes/LauncherSessionsManager.js");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const config = require("../Config/config.json");
const profileManager = require("../structs/profile.js");

function generateAccountSecret(accountId, discordId) {
  const combined = `${accountId}:${discordId}:${global.JWT_SECRET}`;
  const hash = crypto.createHash("sha256").update(combined).digest("base64");
  return hash;
}

function cleanUsername(username) {
  if (!username) return "";
  let cleaned = username.replace(/\./g, "").replace(/_/g, "");
  if (cleaned.length > 16) {
    cleaned = cleaned.substring(0, 12);
  }
  return cleaned;
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text ? text.replace(/[&<>"']/g, (m) => map[m]) : "";
}

function generateErrorPage(message) {
  const encodedMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Login - Error</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">

  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      background-color: #0e0e0e;
    }

    @keyframes floatRotate {
      0% {
        transform: translate(0, 0) rotate(0deg);
      }
      50% {
        transform: translate(30px, -40px) rotate(180deg);
      }
      100% {
        transform: translate(0, 0) rotate(360deg);
      }
    }

    .floating-square {
      position: absolute;
      background-color: #1c1c1c;
      opacity: 0.6;
      border-radius: 0.5rem;
      animation: floatRotate 5s ease-in-out infinite;
    }

    .square-1 { width: 30px; height: 30px; top: 10%; left: 20%; animation-delay: 0s; }
    .square-2 { width: 50px; height: 50px; top: 25%; left: 65%; animation-delay: 0.5s; }
    .square-3 { width: 20px; height: 20px; top: 55%; left: 35%; animation-delay: 1s; }
    .square-4 { width: 40px; height: 40px; top: 75%; left: 15%; animation-delay: 1.5s; }
    .square-5 { width: 60px; height: 60px; top: 45%; left: 80%; animation-delay: 2s; }
    .square-6 { width: 25px; height: 25px; top: 85%; left: 55%; animation-delay: 2.5s; }

    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .animate-fade-in {
      animation: fade-in 0.3s ease-out;
    }
  </style>
</head>
<body class="flex items-center justify-center min-h-screen p-6 relative">

  <div class="floating-square square-1"></div>
  <div class="floating-square square-2"></div>
  <div class="floating-square square-3"></div>
  <div class="floating-square square-4"></div>
  <div class="floating-square square-5"></div>
  <div class="floating-square square-6"></div>

  <div class="relative z-10 bg-gradient-to-b from-[#161616] to-[#1e1e1e] border border-neutral-800 rounded-2xl p-6 w-full max-w-md text-white animate-fade-in">
    <div class="flex items-center gap-2 mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
      <h2 class="text-xl font-semibold">Authentication Error</h2>
    </div>

    <p class="text-zinc-400 text-sm bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4">
      Unable to complete login. Please try again or contact support.
    </p>

    <div class="w-full mb-4">
        <div class="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
            <img src="https://fortnite-api.com/images/cosmetics/br/CID_A_354_Athena_Commando_F_ShatterFlyEclipse/icon.png" 
                 alt="Avatar"
                 class="w-12 h-12 rounded-full">
            <div class="flex-1 text-left">
                <div class="text-white font-semibold text-sm">ERROR</div>
                <div class="text-zinc-400 text-xs font-mono break-all">
                    ${encodedMessage}
                </div>
            </div>
        </div>
    </div>

    <button onclick="window.close()"
            class="w-full h-10 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm cursor-pointer transition-colors">
      Close Window
    </button>
  </div>
</body>
</html>`;
}

function generateSuccessPage(username, discordId, favoriteCharacter, token) {
  const encodedUsername = escapeHtml(username);
  const encodedDiscordId = escapeHtml(discordId);
  const encodedToken = escapeHtml(token);

  const avatarUrl =
    favoriteCharacter && favoriteCharacter !== "default"
      ? `https://fortnite-api.com/images/cosmetics/br/${escapeHtml(
          favoriteCharacter
        )}/icon.png`
      : "https://fortnite-api.com/images/cosmetics/br/CID_960_Athena_Commando_M_Cosmos/icon.png";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Login - Success</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">

  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      background-color: #0e0e0e;
    }

    @keyframes floatRotate {
      0% {
        transform: translate(0, 0) rotate(0deg);
      }
      50% {
        transform: translate(30px, -40px) rotate(180deg);
      }
      100% {
        transform: translate(0, 0) rotate(360deg);
      }
    }

    .floating-square {
      position: absolute;
      background-color: #1c1c1c;
      opacity: 0.6;
      border-radius: 0.5rem;
      animation: floatRotate 5s ease-in-out infinite;
    }

    .square-1 {
      width: 30px; height: 30px;
      top: 10%; left: 20%;
      animation-delay: 0s;
    }

    .square-2 {
      width: 50px; height: 50px;
      top: 25%; left: 65%;
      animation-delay: 0.5s;
    }

    .square-3 {
      width: 20px; height: 20px;
      top: 55%; left: 35%;
      animation-delay: 1s;
    }

    .square-4 {
      width: 40px; height: 40px;
      top: 75%; left: 15%;
      animation-delay: 1.5s;
    }

    .square-5 {
      width: 60px; height: 60px;
      top: 45%; left: 80%;
      animation-delay: 2s;
    }

    .square-6 {
      width: 25px; height: 25px;
      top: 85%; left: 55%;
      animation-delay: 2.5s;
    }

    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .animate-fade-in {
      animation: fade-in 0.3s ease-out;
    }
  </style>
</head>
<body class="flex items-center justify-center min-h-screen p-6 relative">

  <div class="floating-square square-1"></div>
  <div class="floating-square square-2"></div>
  <div class="floating-square square-3"></div>
  <div class="floating-square square-4"></div>
  <div class="floating-square square-5"></div>
  <div class="floating-square square-6"></div>

  <div class="relative z-10 bg-gradient-to-b from-[#161616] to-[#1e1e1e] border border-neutral-800 rounded-2xl p-6 w-full max-w-md text-white animate-fade-in">
    <div class="flex items-center gap-2 mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      <h2 class="text-xl font-semibold">Login Successful</h2>
    </div>

    <p class="text-zinc-400 text-sm bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4">
      Welcome back! Click below to log into the launcher.
    </p>

    <div class="flex items-center gap-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg mb-4">
      <div class="relative">
        <img
          src="${avatarUrl}"
          onerror="this.src = 'https://fortnite-api.com/images/cosmetics/br/CID_960_Athena_Commando_M_Cosmos/icon.png'"
          alt="Avatar"
          class="w-12 h-12 rounded-full border border-stone-700"
        />
        <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1e1e1e]"></div>
      </div>
      <div class="flex-1">
        <div class="text-white font-medium text-sm">${encodedUsername}</div>
        <div class="text-zinc-400 text-xs">${encodedDiscordId}</div>
      </div>
    </div>

    <button
      id="loginButton"
      onclick="handleLogin()"
      class="w-full h-10 bg-purple-600 hover:bg-purple-700 transition-all rounded-lg font-semibold text-white text-sm"
    >
      Login to Launcher
    </button>
  </div>

  <script>
    function handleLogin() {
      const button = document.getElementById('loginButton');
      button.textContent = 'Logged In';
      button.classList.remove('bg-purple-600', 'hover:bg-purple-700');
      button.classList.add('bg-green-500', 'cursor-default');
      button.disabled = true;
      window.location.href = 'crystal://${encodedToken}';
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  </script>
</body>
</html>`;
}

app.get("/h/d/v1/discord/callback", async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      const redirectUri = `${req.protocol}://${req.get(
        "host"
      )}/h/d/v1/discord/callback`;
      const encodedRedirectUri = encodeURIComponent(redirectUri);
      const discordClientId =
        config.discord?.clientId || config.discord?.client_id;
      if (!discordClientId) {
        return res
          .status(500)
          .send(generateErrorPage("Discord client ID not configured"));
      }
      const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${discordClientId}&response_type=code&redirect_uri=${encodedRedirectUri}&scope=identify`;
      return res.send(discordAuthUrl);
    }

    let accessToken;
    try {
      const redirectUri = `${req.protocol}://${req.get(
        "host"
      )}/h/d/v1/discord/callback`;
      const discordClientId =
        config.discord?.clientId || config.discord?.client_id;
      const discordClientSecret =
        config.discord?.clientSecret || config.discord?.client_secret;

      if (!discordClientId || !discordClientSecret) {
        return res
          .status(500)
          .send(generateErrorPage("Discord OAuth not configured"));
      }

      const tokenResponse = await axios.post(
        "https://discord.com/api/v10/oauth2/token",
        new URLSearchParams({
          client_id: discordClientId,
          client_secret: discordClientSecret,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: redirectUri,
          scope: "identify",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (!tokenResponse.data || !tokenResponse.data.access_token) {
        if (tokenResponse.data?.error === "invalid_grant") {
          const redirectUri2 = `${req.protocol}://${req.get(
            "host"
          )}/h/d/v1/discord/callback`;
          const encodedRedirectUri2 = encodeURIComponent(redirectUri2);
          const discordAuthUrl2 = `https://discord.com/oauth2/authorize?client_id=${discordClientId}&response_type=code&redirect_uri=${encodedRedirectUri2}&scope=identify`;
          return res.redirect(discordAuthUrl2);
        }
        return res
          .status(400)
          .send(
            generateErrorPage("Authentication failed: No access token received")
          );
      }

      accessToken = tokenResponse.data.access_token;
    } catch (ex) {
      log.error(`Exception during token exchange: ${ex.message}`);
      return res
        .status(400)
        .send(generateErrorPage("Authentication failed: Token exchange error"));
    }

    let discordUser;
    try {
      const userResponse = await axios.get(
        "https://discord.com/api/v10/users/@me",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!userResponse.data) {
        return res
          .status(400)
          .send(generateErrorPage("Failed to get user information"));
      }

      discordUser = userResponse.data;
    } catch (ex) {
      log.error(`Exception getting Discord user info: ${ex.message}`);
      return res
        .status(400)
        .send(generateErrorPage("Failed to fetch user data"));
    }

    const discordUserId = discordUser.id;
    const discordUsername = discordUser.username;

    if (!discordUserId) {
      return res.status(400).send(generateErrorPage("Invalid Discord user ID"));
    }

    let user = await User.findOne({ discordId: discordUserId });

    if (!user) {
      try {
        const originalUsername = discordUser.username || "";
        const cleanedUsername = cleanUsername(originalUsername);

        const encryptedEmail = crypto
          .createHash("sha1")
          .update(cleanedUsername)
          .digest("hex");
        const hashedPassword = await bcrypt.hash(cleanedUsername, 10);

        const avatar = discordUser.avatar;
        const avatarUrl = avatar
          ? `https://cdn.discordapp.com/avatars/${discordUserId}/${avatar}`
          : null;

        const accountId = functions.MakeID().replace(/-/gi, "");
        const matchmakingId = functions.MakeID().replace(/-/gi, "");

        const newUser = await User.create({
          created: new Date(),
          discordId: discordUserId,
          accountId: accountId,
          username: cleanedUsername,
          username_lower: cleanedUsername.toLowerCase(),
          email: `${encryptedEmail}@launcher.dev`,
          password: hashedPassword,
          matchmakingId: matchmakingId,
          avatar: avatarUrl,
        });

        await Profile.create({
          created: newUser.created,
          accountId: accountId,
          profiles: profileManager.createProfiles(accountId),
        });

        await profileManager.createUserStatsProfiles(accountId);

        user = await User.findOne({ discordId: discordUserId });
        if (!user) {
          return res
            .status(400)
            .send(generateErrorPage("Failed to retrieve newly created user"));
        }
      } catch (ex) {
        log.error(`Exception creating user: ${ex.message}`);
        return res
          .status(400)
          .send(generateErrorPage("Failed to create user account"));
      }
    } else {
      try {
        const avatar = discordUser.avatar;
        const avatarUrl = avatar
          ? `https://cdn.discordapp.com/avatars/${discordUserId}/${avatar}`
          : user.avatar;

        if (user.avatar !== avatarUrl) {
          user.avatar = avatarUrl;
          await User.updateOne({ discordId: discordUserId }, user);
          log.backend(`Updated user: ${discordUsername} (${discordUserId})`);
        }
      } catch (ex) {
        log.error(`Exception updating user: ${ex.message}`);
      }
    }

    if (user.banned) {
      return res.send(generateErrorPage("You are currently banned."));
    }

    let favoriteCharacter;
    let athenaProfile;
    let commonCoreProfile;
    let userStats;

    try {
      const profiles = await Profile.findOne({ accountId: user.accountId });
      if (!profiles) {
        return res
          .status(400)
          .send(generateErrorPage("User profile not found"));
      }

      const athena = profiles.profiles["athena"];
      const commonCore = profiles.profiles["common_core"];

      let favoriteCharacterItem = null;
      const lockerKeys = Object.keys(athena.items || {}).filter(
        (k) =>
          athena.items[k]?.templateId === "CosmeticLocker:cosmeticlocker_athena"
      );

      if (lockerKeys.length > 0) {
        const locker = athena.items[lockerKeys[0]];
        favoriteCharacterItem =
          locker?.attributes?.locker_slots_data?.slots?.Character?.items?.[0];
      }

      if (!favoriteCharacterItem || favoriteCharacterItem === "") {
        favoriteCharacterItem =
          "AthenaCharacter:CID_002_Athena_Commando_F_Default";
      }

      favoriteCharacter = favoriteCharacterItem
        .replace("AthenaCharacter:", "")
        .toLowerCase();

      const levelItem = athena?.stats?.attributes?.level || 0;
      const xpItem = athena?.stats?.attributes?.xp || 0;
      const bookPurchased = athena?.stats?.attributes?.book_purchased || false;
      const bookLevel = athena?.stats?.attributes?.book_level || 0;
      const bookXp = athena?.stats?.attributes?.book_xp || 0;

      const hypeEntry = await Arena.findOne({ accountId: user.accountId });
      const hype = hypeEntry?.hype || 0;

      athenaProfile = {
        favoriteCharacterId: favoriteCharacter,
        season: {
          level: parseInt(levelItem) || 0,
          xp: parseInt(xpItem) || 0,
          battlePass: {
            purchased: bookPurchased,
            level: parseInt(bookLevel) || 0,
            xp: parseInt(bookXp) || 0,
          },
        },
        hype: hype,
      };

      const vbucks =
        commonCore?.items?.["Currency:MtxPurchased"]?.quantity || 0;
      commonCoreProfile = {
        vbucks: parseInt(vbucks) || 0,
      };

      userStats = {};
    } catch (ex) {
      log.error(`Exception getting profile data: ${ex.message}`);
      return res
        .status(400)
        .send(generateErrorPage("Failed to load profile data"));
    }

    const accountSecret = generateAccountSecret(user.accountId, user.discordId);

    const claims = {
      sub: user.accountId,
      accountId: user.accountId,
      id: user.accountId,
      secret: accountSecret,
      discord: {
        id: user.discordId,
        username: discordUsername,
        displayName: user.username,
        avatarUrl: user.avatar,
      },
      profile: {
        athena: athenaProfile,
        common_core: commonCoreProfile,
        stats: userStats,
      },
      hellowelcometocrystalfortnite: accountSecret,
    };

    const token = jwt.sign(claims, global.JWT_SECRET, { expiresIn: "1h" });

    log.backend(
      `Successfully authenticated user ${discordUsername} (${discordUserId})`
    );
    return res.send(
      generateSuccessPage(
        user.username,
        user.discordId,
        favoriteCharacter,
        token
      )
    );
  } catch (ex) {
    log.error(`Unexpected error in Discord callback: ${ex.message}`);
    return res
      .status(400)
      .send(
        generateErrorPage("An unexpected error occurred during authentication")
      );
  }
});

app.post("/h/d/v1/auth/exchange/create", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const validApiKey = config.Api?.bApiKey || config.Api?.apiKey;

  if (apiKey !== validApiKey) {
    return error.createError(
      "errors.com.epicgames.common.bad_request",
      "Invalid key.",
      [],
      400,
      "bad_request",
      400,
      res
    );
  }

  let requestData;
  try {
    requestData = req.body;
  } catch {
    return error.createError(
      "errors.com.epicgames.common.invalid_payload",
      "Invalid payload",
      [],
      400,
      "invalid_payload",
      400,
      res
    );
  }

  const secret = requestData.crystal;
  if (!secret || !secret.trim()) {
    return res.json({ error: "this endpoint is deprecated." });
  }

  try {
    let foundSession = null;
    if (global.launcherSessions) {
      for (const [socketId, session] of global.launcherSessions.entries()) {
        if (session.secret === secret) {
          foundSession = session;
          break;
        }
      }
    }

    if (!foundSession) {
      return res.json({ error: "this endpoint is deprecated." });
    }

    const user = await User.findOne({ accountId: foundSession.accountId });
    if (!user) {
      return res.json({ error: "this endpoint is deprecated." });
    }

    if (user.banned) {
      return error.createError(
        "errors.com.epicgames.account.account_not_active",
        "You are currently banned.",
        [],
        400,
        "account_not_active",
        400,
        res
      );
    }

    const exchangeCode = uuidv4();

    if (!global.exchangeCodes) {
      global.exchangeCodes = [];
    }

    global.exchangeCodes.push({
      accountId: user.accountId,
      exchange_code: exchangeCode,
      createdAt: new Date(),
    });

    setTimeout(() => {
      const index = global.exchangeCodes.findIndex(
        (ec) => ec.exchange_code === exchangeCode
      );
      if (index !== -1) {
        global.exchangeCodes.splice(index, 1);
      }
    }, 300000);

    return res.json({ code: exchangeCode });
  } catch (ex) {
    log.error(`Failed to create exchange code: ${ex.message}`);
    return error.createError(
      "errors.com.epicgames.common.server_error",
      "Internal server error",
      [],
      500,
      "server_error",
      500,
      res
    );
  }
});

module.exports = app;
