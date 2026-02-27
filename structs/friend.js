const Friends = require("../model/friends.js");
const functions = require("../structs/functions.js");

const defaultLists = () => ({
    accepted: [],
    incoming: [],
    outgoing: [],
    blocked: []
});

function normalizeLists(doc) {
    const list = doc?.list || {};

    const normalized = {
        accepted: Array.isArray(list.accepted) ? list.accepted : [],
        incoming: Array.isArray(list.incoming) ? list.incoming : [],
        outgoing: Array.isArray(list.outgoing) ? list.outgoing : [],
        blocked: Array.isArray(list.blocked) ? list.blocked : []
    };

    // Only write if something was missing/badly typed
    if (!list.accepted || !list.incoming || !list.outgoing || !list.blocked) {
        doc.list = normalized;
    }

    return normalized;
}

async function ensureFriendDocument(accountId) {
    let doc = await Friends.findOne({ accountId });

    if (!doc) {
        const created = new Date().toISOString();
        doc = await Friends.create({ created, accountId, list: defaultLists() });
        return doc;
    }

    const normalized = normalizeLists(doc);

    // If we normalized (missing arrays), persist the correction
    if (doc.isModified && doc.isModified("list")) {
        await doc.updateOne({ $set: { list: normalized } });
    }

    return doc;
}

async function validateFriendAdd(accountId, friendId) {
    const sender = await ensureFriendDocument(accountId).catch(() => null);
    const receiver = await ensureFriendDocument(friendId).catch(() => null);
    if (!sender || !receiver) return false;

    const senderList = normalizeLists(sender);
    const receiverList = normalizeLists(receiver);

    if (senderList.accepted.find(i => i.accountId == receiver.accountId) || receiverList.accepted.find(i => i.accountId == sender.accountId)) return false;
    if (senderList.blocked.find(i => i.accountId == receiver.accountId) || receiverList.blocked.find(i => i.accountId == sender.accountId)) return false;
    if (sender.accountId == receiver.accountId) return false;

    return true;
}

async function validateFriendDelete(accountId, friendId) {
    const sender = await ensureFriendDocument(accountId).catch(() => null);
    const receiver = await ensureFriendDocument(friendId).catch(() => null);
    if (!sender || !receiver) return false;

    return true;
}

async function validateFriendBlock(accountId, friendId) {
    const sender = await ensureFriendDocument(accountId).catch(() => null);
    const receiver = await ensureFriendDocument(friendId).catch(() => null);
    if (!sender || !receiver) return false;

    const senderList = normalizeLists(sender);

    if (senderList.blocked.find(i => i.accountId == receiver.accountId)) return false;
    if (sender.accountId == receiver.accountId) return false;

    return true;
}

async function sendFriendReq(fromId, toId) {
    if (!await validateFriendAdd(fromId, toId)) return false;

    const from = await ensureFriendDocument(fromId);
    const to = await ensureFriendDocument(toId);
    const fromFriends = normalizeLists(from);
    const toFriends = normalizeLists(to);

    fromFriends.outgoing.push({ accountId: to.accountId, created: new Date().toISOString() });

    functions.sendXmppMessageToId({
        "payload": {
            "accountId": to.accountId,
            "status": "PENDING",
            "direction": "OUTBOUND",
            "created": new Date().toISOString(),
            "favorite": false
        },
        "type": "com.epicgames.friends.core.apiobjects.Friend",
        "timestamp": new Date().toISOString()
    }, from.accountId);

    toFriends.incoming.push({ accountId: from.accountId, created: new Date().toISOString() });

    functions.sendXmppMessageToId({
        "payload": {
            "accountId": from.accountId,
            "status": "PENDING",
            "direction": "INBOUND",
            "created": new Date().toISOString(),
            "favorite": false
        },
        "type": "com.epicgames.friends.core.apiobjects.Friend",
        "timestamp": new Date().toISOString()
    }, to.accountId);

    await from.updateOne({ $set: { list: fromFriends } });
    await to.updateOne({ $set: { list: toFriends } });

    return true;
}

async function acceptFriendReq(fromId, toId) {
    if (!await validateFriendAdd(fromId, toId)) return false;

    const from = await ensureFriendDocument(fromId);
    const to = await ensureFriendDocument(toId);
    const fromFriends = normalizeLists(from);
    const toFriends = normalizeLists(to);

    let incomingIndex = fromFriends.incoming.findIndex(i => i.accountId == to.accountId);

    if (incomingIndex != -1) {
        fromFriends.incoming.splice(incomingIndex, 1);
        fromFriends.accepted.push({ accountId: to.accountId, created: new Date().toISOString() });

        functions.sendXmppMessageToId({
            "payload": {
                "accountId": to.accountId,
                "status": "ACCEPTED",
                "direction": "OUTBOUND",
                "created": new Date().toISOString(),
                "favorite": false
            },
            "type": "com.epicgames.friends.core.apiobjects.Friend",
            "timestamp": new Date().toISOString()
        }, from.accountId);

        toFriends.outgoing.splice(toFriends.outgoing.findIndex(i => i.accountId == from.accountId), 1);
        toFriends.accepted.push({ accountId: from.accountId, created: new Date().toISOString() });

        functions.sendXmppMessageToId({
            "payload": {
                "accountId": from.accountId,
                "status": "ACCEPTED",
                "direction": "OUTBOUND",
                "created": new Date().toISOString(),
                "favorite": false
            },
            "type": "com.epicgames.friends.core.apiobjects.Friend",
            "timestamp": new Date().toISOString()
        }, to.accountId);

        await from.updateOne({ $set: { list: fromFriends } });
        await to.updateOne({ $set: { list: toFriends } });
    }

    return true;
}

async function deleteFriend(fromId, toId) {
    if (!await validateFriendDelete(fromId, toId)) return false;

    const from = await ensureFriendDocument(fromId);
    const to = await ensureFriendDocument(toId);
    const fromFriends = normalizeLists(from);
    const toFriends = normalizeLists(to);

    let removed = false;

    for (let listType in fromFriends) {
        let findFriend = fromFriends[listType].findIndex(i => i.accountId == to.accountId);
        let findToFriend = toFriends[listType].findIndex(i => i.accountId == from.accountId);

        if (findFriend != -1) {
            fromFriends[listType].splice(findFriend, 1);
            removed = true;
        }

        if (listType == "blocked") continue;

        if (findToFriend != -1) toFriends[listType].splice(findToFriend, 1);
    }

    if (removed == true) {
        functions.sendXmppMessageToId({
            "payload": {
                "accountId": to.accountId,
                "reason": "DELETED"
            },
            "type": "com.epicgames.friends.core.apiobjects.FriendRemoval",
            "timestamp": new Date().toISOString()
        }, from.accountId);

        functions.sendXmppMessageToId({
            "payload": {
                "accountId": from.accountId,
                "reason": "DELETED"
            },
            "type": "com.epicgames.friends.core.apiobjects.FriendRemoval",
            "timestamp": new Date().toISOString()
        }, to.accountId);

        await from.updateOne({ $set: { list: fromFriends } });
        await to.updateOne({ $set: { list: toFriends } });
    }

    return true;
}

async function blockFriend(fromId, toId) {
    if (!await validateFriendDelete(fromId, toId)) return false;
    if (!await validateFriendBlock(fromId, toId)) return false;
    await deleteFriend(fromId, toId);

    const from = await ensureFriendDocument(fromId);
    const to = await ensureFriendDocument(toId);
    const fromFriends = normalizeLists(from);
    
    fromFriends.blocked.push({ accountId: to.accountId, created: new Date().toISOString() });

    await from.updateOne({ $set: { list: fromFriends } });

    return true;
}

module.exports = {
    validateFriendAdd,
    validateFriendDelete,
    sendFriendReq,
    acceptFriendReq,
    blockFriend,
    deleteFriend,
    ensureFriendDocument
}