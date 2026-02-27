# Phoenix Backend

![Imgur]([https://i.imgur.com/ImIwpRm.png](https://i.imgur.com/5Sw2FXF.png))

Phoenix Backend is a universal Fortnite private server backend written in [JavaScript](https://en.wikipedia.org/wiki/JavaScript)

Created by [Cynx](https://github.com/cynnnxxx), This is a modded backend, all main backend credits to [Burlone](https://github.com/burlone0)

## Features
* Locker:
    * [x] Changing items.
    * [x] Changing banner icon and banner color.
    * [x] Changing item edit styles.
    * [x] Favoriting items.
    * [x] Marking items as seen.
    * [x] Styles Working
* Friends:
    * [x] Adding friends.
    * [x] Accepting friend requests.
    * [x] Removing friends.
    * [x] Blocking friends.
    * [x] Setting nicknames.
    * [x] Removing nicknames.
    * [x] Joining Party 
* Item Shop:
    * [x] Customizable Item Shop.
    * [x] Purchasing items from the Item Shop.
    * [x] Gifting items to your friends.
    * [x] Working Auto Item Shop.
    * [x] Added Bot Command /refreshitemshop 
* Refunding:
    * [x] Working refunding stuff.
* Discord Bot:
    * [x] Being able to activate/deactivate the Discord bot.
    * [x] Commands with very useful functions.
* BattlePass (s2-s29):
    * [x] Possibility to buy the battle pass.
    * [x] Possibility to purchase battle pass levels.
    * [x] Possibility to gift the battle pass (BETA).
* Challenges (Backend Part):
    * [x] Daily missions worked.
    * [x] Working weekly missions.
    * [x] You can replace daily quests.
    * [x] You can get help from your party to complete missions.
* In-Game Events:
    * [x] You will be able to activate various events that occurred in the game such as the rift in the sky and much more!
* Winterfest Event (11.31, 19.01, 23.10, 33.11):
    * [x] The winterfest event should work with all its rewards!
* SAC (Support A Creator):
    * [x] It supports a supported creator, you can set it using the `/createsac {code} {ingame-username}` command on discord.
    * [x] Rewards in vbucks for those who support a creator.
* Matchmaker:
    * [x] An improved matchmaker.
    * [x] Added GameSessions Support
    * [x] Added Multi Region Matchmaker Support
* Multiple Gameserver Support:
    * [x] An improved multiple gameserver.
* Website:
    * [x] A simple website where you can create an account to join the game.
* XMPP:
    * [x] Parties.
    * [x] Chat (whispering, global chat, party chat).
    * [x] Friends.
* HTTPS/SSL Support:
    * [x] A working https/ssl system.
* Tournament Support:
    * [x] Tournament Support.
    * [x] Multi Tournament Support
    * [x] LeaderBoard Working!
    * [x] Working Saving Points
  * Arena Support:
     * [x] Arena Support.
     * [x] Working Saving Points.
   * Vbucks/Kill/Win:
   * [x] Working Vbucks Kill/Win. you need api key

## Discord Bot Commands
Alot of discord bot commands 30+
### How to setup multiple gameservers
1) Go to **Config/config.json** in the directory you extracted Reload Backend into.
2) Open it, you should see a **"gameServerIP"** section in the file.
3) To add more gameservers you will have to do it like this `"gameServerIP": ["127.0.0.1:7777:playlist_defaultsolo", "127.0.0.1:7777:playlist_defaultduo"],`
4) You have now added solos and duos to your matchmaking 

## How to start Phoenix Backend
1) Install [NodeJS](https://nodejs.org/en/) and [MongoDB](https://www.mongodb.com/try/download/community).
2) **Download** and **Extract** Reload Backend to a safe location.
3) Run **"install_packages.bat"** to install all the required modules.
4) Go to **Config/config.json** in the directory you extracted Reload Backend into.
5) Open it, set your discord bot token **(DO NOT SHARE THIS TOKEN)** and **save it**. The discord bot will be used for creating accounts and managing your account (You can disable the discord bot by entering "bUseDiscordBot" to false in "Config/config.json").
6) Run **"start.bat"**, if there is no errors, it should work.
7) Use something to redirect the Fortnite servers to **localhost:8080** (Which could be fiddler, ssl bypass that redirects servers, etc...)
8) When Fortnite launches and is connected to the backend, enter your email and password (or launch with an exchange code) then press login. It should let you in and everything should be working fine.

## Caldera Service
Recreates a service that is used for the startup of newer Fortnite builds.

### For login
You need to use the **FortniteLauncher.exe** and with that also the **Anti Cheat**

If you use [Fiddler](https://www.telerik.com/download/fiddler) you can use this script:

```
import Fiddler;

class Handlers
{
    static function OnBeforeRequest(oSession: Session) {

        if (oSession.PathAndQuery.Contains("/caldera/api/v1/launcher/racp"))
        {
            if (oSession.HTTPMethodIs("CONNECT"))
            {
                oSession["x-replywithtunnel"] = "ServerTunnel";
                return;
            }
            oSession.fullUrl = "http://127.0.0.1:5000" + oSession.PathAndQuery
        }
        if (oSession.hostname.Contains("epicgames"))
        {
            if (oSession.HTTPMethodIs("CONNECT"))
            {
                oSession["x-replywithtunnel"] = "ServerTunnel";
                return;
            }
            oSession.fullUrl = "http://127.0.0.1:3551" + oSession.PathAndQuery
        }
    }
}
```

if u change **Caldera Service port** modify this string on **fiddler script**: `oSession.fullUrl = "http://127.0.0.1:urport" + oSession.PathAndQuery`
if u change **Backend port** modify this string on **fiddler script**: `oSession.fullUrl = "http://127.0.0.1:urport" + oSession.PathAndQuery`

After that go to the build folder **(/FortniteGame/Binaries/Win69)** and create a file with the name **launch.bat** or whatever you prefer and insert this code inside it:

```bat
@echo off
set /p code=code: 
start "" "FortniteLauncher.exe" -obfuscationid=WXis54njnKX1MJqoH0uRwdzlbQ1uqQ -AUTH_LOGIN=unused -AUTH_PASSWORD=%code% -AUTH_TYPE=exchangecode -epicapp=Fortnite -epicenv=Prod -EpicPortal -epicsandboxid=fn -noeac -noeaceos -fromfl=be 
```

Launch it, then go to Discord and type **/exchange-code**, copy the code and paste it into the .bat file.

### Tested versions: 
14.40.27,11.29.00,24.20,19.10,17.30,18.40,19.01,12.41,9.10, Alot of more!

## License
This **project/backend** is licensed under the **BSD 3-Clause License.**

## Disclaimer
All **Fortnite OG** related projects named **Project Phoenix**, **Phoenix**, **Phoenix Backend** or using **our official images** are not owned or affiliated with us. Please do not trust and report them via discord to **cynnnxxx**. All rights are licensed to [burlone0](https://github.com/Cynnnxxx)

## Credits
Credits have been moved to the **Contributors** section of github. If I forgot to include someone, write to **cynnnxxx** on Discord

---

**Reload Backend** is under continuous development and there could be errors of any kind, if you want to give advice on what to add and how to improve the project or report any errors you can do so by writing to **cynnnxxx** on Discord
