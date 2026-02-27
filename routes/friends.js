const express = require("express");
const app = express.Router();

const functions = require("../structs/functions.js");
const log = require("../structs/log.js");

const Friends = require("../model/friends.js");
const friendManager = require("../structs/friend.js");

const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");

/**
 * Simple error helper to replace missing error.createError usage.
 * Adjust structure if you have a different error format in your project.
 */
function createErrorResponse(res, code, message, fields = [], numericCode = 0, httpStatus = 404) {
    return res.status(httpStatus).json({
        errorCode: code,
        message,
        fields,
        numericCode
    });
}

app.get("/friends/api/v1/*/settings", (req, res) => {
    log.debug("GET /friends/api/v1/*/settings called");
    res.json({});
});

app.get("/friends/api/v1/*/blocklist", (req, res) => {
    log.debug("GET /friends/api/v1/*/blocklist called");
    res.json([]);
});

app.get("/friends/api/public/list/fortnite/*/recentPlayers", (req, res) => {
    log.debug("GET /friends/api/public/list/fortnite/*/recentPlayers called");
    res.json([]);
});

app.all("/friends/api/v1/*/friends/:friendId/alias", verifyToken, getRawBody, async (req, res) => {
    log.debug(`ALL /friends/api/v1/*/friends/${req.params.friendId}/alias called with method ${req.method}`);

    let friends;
    try {
        friends = await friendManager.ensureFriendDocument(req.user.accountId);
    } catch (err) {
        return createErrorResponse(res, "errors.com.epicgames.internal", "Database error", [], 0, 500);
    }

    if (!friends || !friends.list) {
        return createErrorResponse(res, "errors.com.epicgames.friends.friendship_not_found", `No friends record found for ${req.user.accountId}`, [], 14004, 404);
    }

    const validationFail = () => createErrorResponse(
        res,
        "errors.com.epicgames.validation.validation_failed",
        "Validation Failed. Invalid fields were [alias]",
        ["[alias]"],
        1040,
        400
    );

    const allowedCharacters = (" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~").split("");

    // Ensure req.rawBody is a string
    const aliasBody = typeof req.rawBody === "string" ? req.rawBody : (req.rawBody ? String(req.rawBody) : "");

    for (let character of aliasBody) {
        if (!allowedCharacters.includes(character)) return validationFail();
    }

    if (!Array.isArray(friends.list.accepted) || !friends.list.accepted.find(i => i.accountId == req.params.friendId)) {
        return createErrorResponse(
            res,
            "errors.com.epicgames.friends.friendship_not_found",
            `Friendship between ${req.user.accountId} and ${req.params.friendId} does not exist`,
            [req.user.accountId, req.params.friendId],
            14004,
            404
        );
    }

    const friendIndex = friends.list.accepted.findIndex(i => i.accountId == req.params.friendId);

    switch (req.method) {
        case "PUT":
            if ((aliasBody.length < 3) || (aliasBody.length > 16)) return validationFail();

            friends.list.accepted[friendIndex].alias = aliasBody;

            await friends.updateOne({ $set: { list: friends.list } });
            break;

        case "DELETE":
            friends.list.accepted[friendIndex].alias = "";

            await friends.updateOne({ $set: { list: friends.list } });
            break;

        default:
            return res.status(405).end();
    }

    res.status(204).end();
});

app.get("/friends/api/public/friends/:accountId", verifyToken, async (req, res) => {
    log.debug(`GET /friends/api/public/friends/${req.params.accountId} called`);
    let response = [];

    const friendsDoc = await friendManager.ensureFriendDocument(req.user.accountId).catch(() => null);
    const friends = friendsDoc ? friendsDoc.list : null;
    if (!friends) return res.json(response);

    (friends.accepted || []).forEach(acceptedFriend => {
        response.push({
            "accountId": acceptedFriend.accountId,
            "status": "ACCEPTED",
            "direction": "OUTBOUND",
            "created": acceptedFriend.created,
            "favorite": false
        });
    });

    (friends.incoming || []).forEach(incomingFriend => {
        response.push({
            "accountId": incomingFriend.accountId,
            "status": "PENDING",
            "direction": "INBOUND",
            "created": incomingFriend.created,
            "favorite": false
        });
    });

    (friends.outgoing || []).forEach(outgoingFriend => {
        response.push({
            "accountId": outgoingFriend.accountId,
            "status": "PENDING",
            "direction": "OUTBOUND",
            "created": outgoingFriend.created,
            "favorite": false
        });
    });

    res.json(response);
});

app.post("/friends/api/*/friends*/:receiverId", verifyToken, async (req, res) => {
    log.debug(`POST /friends/api/*/friends*/${req.params.receiverId} called`);

    // Ensure both documents exist and have normalized lists
    const sender = await friendManager.ensureFriendDocument(req.user.accountId).catch(() => null);
    const receiver = await friendManager.ensureFriendDocument(req.params.receiverId).catch(() => null);
    if (!sender || !receiver) return res.status(403).json({ error: "Friend data not found" });

    const senderList = sender.list || { incoming: [], outgoing: [] };

    if (senderList.incoming.find(i => i.accountId == receiver.accountId)) {
        if (!await friendManager.acceptFriendReq(sender.accountId, receiver.accountId)) return res.status(403).json({ error: "Failed to accept friend request" });

        functions.getPresenceFromUser(sender.accountId, receiver.accountId, false);
        functions.getPresenceFromUser(receiver.accountId, sender.accountId, false);
    } else if (!senderList.outgoing.find(i => i.accountId == receiver.accountId)) {
        if (!await friendManager.sendFriendReq(sender.accountId, receiver.accountId)) return res.status(403).json({ error: "Failed to send friend request" });
    }

    res.status(204).end();
});

app.delete("/friends/api/*/friends*/:receiverId", verifyToken, async (req, res) => {
    log.debug(`DELETE /friends/api/*/friends*/${req.params.receiverId} called`);
    const sender = await friendManager.ensureFriendDocument(req.user.accountId).catch(() => null);
    const receiver = await friendManager.ensureFriendDocument(req.params.receiverId).catch(() => null);
    if (!sender || !receiver) return res.status(403).json({ error: "Friend data not found" });

    if (!await friendManager.deleteFriend(sender.accountId, receiver.accountId)) return res.status(403).json({ error: "Failed to delete friend" });

    functions.getPresenceFromUser(sender.accountId, receiver.accountId, true);
    functions.getPresenceFromUser(receiver.accountId, sender.accountId, true);

    res.status(204).end();
});

app.post("/friends/api/*/blocklist*/:receiverId", verifyToken, async (req, res) => {
    log.debug(`POST /friends/api/*/blocklist*/${req.params.receiverId} called`);
    const sender = await friendManager.ensureFriendDocument(req.user.accountId).catch(() => null);
    const receiver = await friendManager.ensureFriendDocument(req.params.receiverId).catch(() => null);
    if (!sender || !receiver) return res.status(403).json({ error: "Friend data not found" });

    if (!await friendManager.blockFriend(sender.accountId, receiver.accountId)) return res.status(403).json({ error: "Failed to block friend" });

    functions.getPresenceFromUser(sender.accountId, receiver.accountId, true);
    functions.getPresenceFromUser(receiver.accountId, sender.accountId, true);

    res.status(204).end();
});

app.delete("/friends/api/*/blocklist*/:receiverId", verifyToken, async (req, res) => {
    log.debug(`DELETE /friends/api/*/blocklist*/${req.params.receiverId} called`);
    const sender = await friendManager.ensureFriendDocument(req.user.accountId).catch(() => null);
    const receiver = await friendManager.ensureFriendDocument(req.params.receiverId).catch(() => null);
    if (!sender || !receiver) return res.status(403).json({ error: "Friend data not found" });

    if (!await friendManager.deleteFriend(sender.accountId, receiver.accountId)) return res.status(403).json({ error: "Failed to unblock/delete friend" });

    res.status(204).end();
});

app.get("/friends/api/v1/:accountId/summary", verifyToken, async (req, res) => {
    log.debug(`GET /friends/api/v1/${req.params.accountId}/summary called`);
    let response = {
        "friends": [],
        "incoming": [],
        "outgoing": [],
        "suggested": [],
        "blocklist": [],
        "settings": {
            "acceptInvites": "public"
        }
    }

    const friendsDoc = await friendManager.ensureFriendDocument(req.user.accountId).catch(() => null);
    const friends = friendsDoc ? friendsDoc.list : null;
    if (!friends) return res.json(response);

    (friends.accepted || []).forEach(acceptedFriend => {
        response.friends.push({
            "accountId": acceptedFriend.accountId,
            "groups": [],
            "mutual": 0,
            "alias": acceptedFriend.alias ? acceptedFriend.alias : "",
            "note": "",
            "favorite": false,
            "created": acceptedFriend.created
        });
    });

    (friends.incoming || []).forEach(incomingFriend => {
        response.incoming.push({
            "accountId": incomingFriend.accountId,
            "mutual": 0,
            "favorite": false,
            "created": incomingFriend.created
        });
    });

    (friends.outgoing || []).forEach(outgoingFriend => {
        response.outgoing.push({
            "accountId": outgoingFriend.accountId,
            "favorite": false
        });
    });

    (friends.blocked || []).forEach(blockedFriend => {
        response.blocklist.push({
            "accountId": blockedFriend.accountId
        });
    });

    res.json(response);
});

app.get("/friends/api/public/blocklist/*", verifyToken, async (req, res) => {
    log.debug("GET /friends/api/public/blocklist/* called");
    const friendsDoc = await friendManager.ensureFriendDocument(req.user.accountId).catch(() => null);
    const friends = friendsDoc ? friendsDoc.list : null;
    if (!friends) return res.json({ "blockedUsers": [] });

    res.json({
        "blockedUsers": (friends.blocked || []).map(i => i.accountId)
    });
});

function getRawBody(req, res, next) {
    if (req.headers["content-length"]) {
        if (Number(req.headers["content-length"]) > 16) return res.status(403).json({ "error": "File size must be 16 bytes or less." });
    }

    try {
        req.rawBody = "";
        req.on("data", (chunk) => req.rawBody += chunk.toString());
        req.on("end", () => next());
    } catch (err) {
        res.status(400).json({ "error": "Something went wrong while trying to access the request body." });
    }
}

module.exports = app;