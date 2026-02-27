const express = require("express");
const app = express.Router();

const User = require("../model/user.js");
const Friends = require("../model/friends.js");
const functions = require("../structs/functions.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");

// Inicializar variáveis globais se não existirem
if (!global.parties) {
  global.parties = {};
}

let pings = [];

// Sistema de locks para evitar race conditions
const partyLocks = {};

async function withPartyLock(partyId, callback) {
  if (!partyLocks[partyId]) {
    partyLocks[partyId] = Promise.resolve();
  }

  partyLocks[partyId] = partyLocks[partyId]
    .then(async () => {
      try {
        return await callback();
      } catch (err) {
        console.error(`[PARTY LOCK ERROR] Party ${partyId}:`, err);
        throw err;
      }
    })
    .finally(() => {
      setTimeout(() => {
        delete partyLocks[partyId];
      }, 100);
    });

  return partyLocks[partyId];
}

// Função para limpar dados expirados
function cleanupExpiredData() {
  try {
    const nowTime = Date.now();

    // Limpar pings expirados
    pings = pings.filter((ping) => {
      if (!ping || !ping.expires_at) return false;
      return new Date(ping.expires_at).getTime() > nowTime;
    });

    // Limpar invites e intentions expirados
    Object.keys(global.parties).forEach((partyId) => {
      const party = global.parties[partyId];
      if (!party) {
        delete global.parties[partyId];
        return;
      }

      if (party.invites && Array.isArray(party.invites)) {
        party.invites = party.invites.filter((invite) => {
          if (!invite || !invite.expires_at) return false;
          return new Date(invite.expires_at).getTime() > nowTime;
        });
      }

      if (party.intentions && Array.isArray(party.intentions)) {
        party.intentions = party.intentions.filter((intention) => {
          if (!intention || !intention.expires_at) return false;
          return new Date(intention.expires_at).getTime() > nowTime;
        });
      }

      // Remover party se não tiver membros
      if (
        !party.members ||
        !Array.isArray(party.members) ||
        party.members.length === 0
      ) {
        delete global.parties[partyId];
      }
    });
  } catch (err) {
    console.error("[CLEANUP ERROR]:", err);
  }
}

// Executar limpeza a cada 5 minutos
setInterval(cleanupExpiredData, 5 * 60 * 1000);
// Executar imediatamente ao iniciar
setTimeout(cleanupExpiredData, 1000);

// Função auxiliar para enviar mensagens XMPP com tratamento de erro
async function safeSendXmpp(accountId, message) {
  try {
    if (!accountId || !message) {
      console.error("[XMPP ERROR] Invalid parameters:", { accountId, message });
      return false;
    }

    if (typeof functions.sendXmppMessageToId !== "function") {
      console.error("[XMPP ERROR] sendXmppMessageToId is not a function");
      return false;
    }

    // Nesta base, a assinatura é (body, toAccountId)
    functions.sendXmppMessageToId(message, accountId);
    return true;
  } catch (error) {
    console.error(
      `[XMPP ERROR] Failed to send to ${accountId}:`,
      error.message
    );
    return false;
  }
}

// Middleware de logging para debug
app.use((req, res, next) => {
  console.log(
    `[PARTY] ${req.method} ${req.path} - User: ${
      (req.user && req.user.accountId) || "unknown"
    }`
  );
  next();
});

app.get(
  "/party/api/v1/Fortnite/user/:accountId/notifications/undelivered/count",
  verifyToken,
  async (req, res) => {
    try {
      if (!req.params.accountId) {
        return res.status(400).json({ error: "Missing accountId" });
      }

      const parties = Object.values(global.parties);
      const userParties = parties.filter(
        (p) =>
          p &&
          p.members &&
          Array.isArray(p.members) &&
          p.members.some(
            (m) => m && m.account_id === req.params.accountId
          )
      );

      let totalInvites = 0;
      userParties.forEach((party) => {
        if (party.invites && Array.isArray(party.invites)) {
          totalInvites += party.invites.filter(
            (invite) =>
              invite &&
              invite.sent_to === req.params.accountId &&
              invite.status === "SENT"
          ).length;
        }
      });

      const userPings = pings.filter(
        (ping) => ping && ping.id === req.params.accountId
      ).length;

      res.json({
        pings: userPings,
        invites: totalInvites,
      });
    } catch (err) {
      console.error("[ERROR] /notifications/undelivered/count:", err);
      res.status(500).json({
        errorCode: "errors.com.epicgames.common.server_error",
        errorMessage: "Internal server error",
        numericErrorCode: 1000,
        originatingService: "any",
        intent: "prod",
      });
    }
  }
);

app.get(
  "/party/api/v1/Fortnite/user/:accountId",
  verifyToken,
  async (req, res) => {
    try {
      if (!req.params.accountId) {
        return res.status(400).json({ error: "Missing accountId" });
      }

      const parties = Object.values(global.parties);
      const current = parties.filter(
        (p) =>
          p &&
          p.members &&
          Array.isArray(p.members) &&
          p.members.some(
            (m) => m && m.account_id === req.params.accountId
          )
      );

      res.json({
        current: current.length > 0 ? current : [],
        pending: [],
        invites: [],
        pings: pings.filter((x) => x && x.id === req.params.accountId),
      });
    } catch (err) {
      console.error("[ERROR] /user/:accountId:", err);
      res.status(500).json({
        errorCode: "errors.com.epicgames.common.server_error",
        errorMessage: "Internal server error",
        numericErrorCode: 1000,
        originatingService: "any",
        intent: "prod",
      });
    }
  }
);

app.post("/party/api/v1/Fortnite/parties", verifyToken, async (req, res) => {
  try {
    if (!req.body.join_info || !req.body.join_info.connection) {
      return res.status(400).json({
        errorCode: "errors.com.epicgames.common.missing_parameter",
        errorMessage: "Missing join_info or connection",
        numericErrorCode: 1008,
        originatingService: "any",
        intent: "prod",
      });
    }

    if (!req.user || !req.user.accountId) {
      return res.status(401).json({
        errorCode:
          "errors.com.epicgames.common.authorization.authorization_failed",
        errorMessage: "Authorization failed",
        numericErrorCode: 1032,
        originatingService: "any",
        intent: "prod",
      });
    }

    const id = functions.MakeID().replace(/-/gi, "");
    const accountId =
      (req.body.join_info.connection.id || "").split("@prod")[0] ||
      req.user.accountId;

    // Verificar se o usuário já está em uma party
    const existingParty = Object.values(global.parties).find(
      (p) =>
        p &&
        p.members &&
        Array.isArray(p.members) &&
        p.members.some((m) => m && m.account_id === accountId)
    );

    if (existingParty) {
      return error.createError(
        "errors.com.epicgames.party.already_in_party",
        `User ${accountId} is already in a party!`,
        undefined,
        51003,
        undefined,
        400,
        res
      );
    }

    const party = {
      id: id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      config:
        req.body.config || {
          type: "DEFAULT",
          joinability: "OPEN",
          max_size: 16,
          sub_type: "default",
        },
      members: [
        {
          account_id: accountId,
          meta: req.body.join_info.meta || {},
          connections: [
            {
              id: req.body.join_info.connection.id || "",
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              yield_leadership:
                req.body.join_info.connection.yield_leadership || false,
              meta: req.body.join_info.connection.meta || {},
            },
          ],
          revision: 0,
          updated_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
          role: "CAPTAIN",
        },
      ],
      applicants: [],
      meta: req.body.meta || {},
      invites: [],
      revision: 0,
      intentions: [],
    };

    global.parties[id] = party;
    console.log(`[PARTY CREATED] ${id} by ${accountId}`);

    res.json(party);
  } catch (err) {
    console.error("[ERROR] POST /parties:", err);
    res.status(500).json({
      errorCode: "errors.com.epicgames.common.server_error",
      errorMessage: "Internal server error",
      numericErrorCode: 1000,
      originatingService: "any",
      intent: "prod",
    });
  }
});

app.patch(
  "/party/api/v1/Fortnite/parties/:pid",
  verifyToken,
  async (req, res) => {
    await withPartyLock(req.params.pid, async () => {
      try {
        let party = global.parties[req.params.pid];
        if (!party) {
          return error.createError(
            "errors.com.epicgames.party.not_found",
            `Party ${req.params.pid} does not exist!`,
            undefined,
            51002,
            undefined,
            404,
            res
          );
        }

        // Verificar se o usuário é o capitão
        const editingMember = party.members.find(
          (m) => m.account_id === req.user.accountId
        );
        if (!editingMember || editingMember.role !== "CAPTAIN") {
          return error.createError(
            "errors.com.epicgames.party.unauthorized",
            `User ${req.user.accountId} is not allowed to edit party ${req.params.pid}!`,
            undefined,
            51015,
            undefined,
            403,
            res
          );
        }

        // Atualizar config
        if (req.body.config) {
          Object.keys(req.body.config).forEach((prop) => {
            party.config[prop] = req.body.config[prop];
          });
        }

        // Atualizar meta
        if (req.body.meta) {
          if (req.body.meta.delete && Array.isArray(req.body.meta.delete)) {
            req.body.meta.delete.forEach((prop) => {
              delete party.meta[prop];
            });
          }

          if (req.body.meta.update) {
            Object.keys(req.body.meta.update).forEach((prop) => {
              party.meta[prop] = req.body.meta.update[prop];
            });
          }
        }

        party.revision = (party.revision || 0) + 1;
        party.updated_at = new Date().toISOString();

        global.parties[req.params.pid] = party;

        const captain = party.members.find(
          (member) => member.role === "CAPTAIN"
        );

        // Enviar notificações
        const notifications = party.members.map((member) =>
          safeSendXmpp(member.account_id, {
            captain_id: captain.account_id,
            created_at: party.created_at,
            invite_ttl_seconds: 14400,
            max_number_of_members: party.config.max_size || 16,
            ns: "Fortnite",
            party_id: party.id,
            party_privacy_type: party.config.joinability || "OPEN",
            party_state_overriden: {},
            party_state_removed: req.body.meta
              ? req.body.meta.delete || []
              : [],
            party_state_updated: req.body.meta
              ? req.body.meta.update || {}
              : {},
            party_sub_type:
              party.meta["urn:epic:cfg:party-type-id_s"] || "default",
            party_type: "DEFAULT",
            revision: party.revision,
            sent: new Date().toISOString(),
            type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
            updated_at: party.updated_at,
          })
        );

        await Promise.all(notifications);

        res.status(204).send();
      } catch (err) {
        console.error("[ERROR] PATCH /parties/:pid:", err);
        res.status(500).json({
          errorCode: "errors.com.epicgames.common.server_error",
          errorMessage: "Internal server error",
          numericErrorCode: 1000,
          originatingService: "any",
          intent: "prod",
        });
      }
    });
  }
);

app.patch(
  "/party/api/v1/Fortnite/parties/:pid/members/:accountId/meta",
  verifyToken,
  async (req, res) => {
    await withPartyLock(req.params.pid, async () => {
      try {
        let party = global.parties[req.params.pid];
        if (!party) {
          return error.createError(
            "errors.com.epicgames.party.not_found",
            `Party ${req.params.pid} does not exist!`,
            undefined,
            51002,
            undefined,
            404,
            res
          );
        }

        // Verificar se o membro existe
        const memberIndex = party.members.findIndex(
          (m) => m.account_id === req.params.accountId
        );
        if (memberIndex === -1) {
          return res.status(404).json({
            errorCode: "errors.com.epicgames.common.not_found",
            errorMessage: "Member not found",
            numericErrorCode: 1004,
            originatingService: "any",
            intent: "prod",
          });
        }

        // Verificar permissão
        if (req.user.accountId !== req.params.accountId) {
          const editingMember = party.members.find(
            (m) => m.account_id === req.user.accountId
          );
          if (!editingMember || editingMember.role !== "CAPTAIN") {
            return error.createError(
              "errors.com.epicgames.party.unauthorized",
              `User ${req.user.accountId} is not allowed to edit member ${req.params.accountId}!`,
              undefined,
              51015,
              undefined,
              403,
              res
            );
          }
        }

        const member = party.members[memberIndex];

        // Atualizar meta
        if (req.body.delete) {
          Object.keys(req.body.delete).forEach((prop) => {
            delete member.meta[prop];
          });
        }

        if (req.body.update) {
          Object.keys(req.body.update).forEach((prop) => {
            member.meta[prop] = req.body.update[prop];
          });
        }

        member.revision = (member.revision || 0) + 1;
        member.updated_at = new Date().toISOString();

        party.members[memberIndex] = member;
        party.updated_at = new Date().toISOString();
        party.revision = (party.revision || 0) + 1;

        global.parties[req.params.pid] = party;

        // Enviar notificações
        const notifications = party.members.map((member2) =>
          safeSendXmpp(member2.account_id, {
            account_id: req.params.accountId,
            account_dn: member.meta["urn:epic:member:dn_s"] || "Player",
            member_state_updated: req.body.update || {},
            member_state_removed: req.body.delete || {},
            member_state_overridden: {},
            party_id: party.id,
            updated_at: member.updated_at,
            sent: new Date().toISOString(),
            revision: member.revision,
            ns: "Fortnite",
            type: "com.epicgames.social.party.notification.v0.MEMBER_STATE_UPDATED",
          })
        );

        await Promise.all(notifications);

        res.status(204).send();
      } catch (err) {
        console.error(
          "[ERROR] PATCH /parties/:pid/members/:accountId/meta:",
          err
        );
        res.status(500).json({
          errorCode: "errors.com.epicgames.common.server_error",
          errorMessage: "Internal server error",
          numericErrorCode: 1000,
          originatingService: "any",
          intent: "prod",
        });
      }
    });
  }
);

app.get(
  "/party/api/v1/Fortnite/parties/:pid",
  verifyToken,
  async (req, res) => {
    try {
      const party = global.parties[req.params.pid];
      if (!party) {
        return error.createError(
          "errors.com.epicgames.party.not_found",
          `Party ${req.params.pid} does not exist!`,
          undefined,
          51002,
          undefined,
          404,
          res
        );
      }
      res.json(party);
    } catch (err) {
      console.error("[ERROR] GET /parties/:pid:", err);
      res.status(500).json({
        errorCode: "errors.com.epicgames.common.server_error",
        errorMessage: "Internal server error",
        numericErrorCode: 1000,
        originatingService: "any",
        intent: "prod",
      });
    }
  }
);

// Remover membro da party
app.delete(
  "/party/api/v1/Fortnite/parties/:pid/members/:accountId",
  verifyToken,
  async (req, res) => {
    await withPartyLock(req.params.pid, async () => {
      try {
        let party = global.parties[req.params.pid];
        if (!party) {
          return error.createError(
            "errors.com.epicgames.party.not_found",
            `Party ${req.params.pid} does not exist!`,
            undefined,
            51002,
            undefined,
            404,
            res
          );
        }

        const memberIndex = party.members.findIndex(
          (m) => m.account_id === req.params.accountId
        );
        if (memberIndex === -1) {
          return res.status(404).json({
            errorCode: "errors.com.epicgames.common.not_found",
            errorMessage: "Member not found",
            numericErrorCode: 1004,
            originatingService: "any",
            intent: "prod",
          });
        }

        const member = party.members[memberIndex];
        const requestingMember = party.members.find(
          (m) => m.account_id === req.user.accountId
        );

        // Permissão: o próprio usuário ou o capitão pode remover
        if (
          req.user.accountId !== req.params.accountId &&
          (!requestingMember || requestingMember.role !== "CAPTAIN")
        ) {
          return error.createError(
            "errors.com.epicgames.party.unauthorized",
            `User ${req.user.accountId} is not allowed to delete member ${req.params.accountId}!`,
            undefined,
            51015,
            undefined,
            403,
            res
          );
        }

        // Remover membro
        party.members.splice(memberIndex, 1);

        // Atualizar RawSquadAssignments se existir
        const squadKey = party.meta["Default:RawSquadAssignments_j"]
          ? "Default:RawSquadAssignments_j"
          : "RawSquadAssignments_j";

        if (party.meta && party.meta[squadKey]) {
          try {
            const rsa = JSON.parse(party.meta[squadKey]);
            if (rsa.RawSquadAssignments && Array.isArray(rsa.RawSquadAssignments)) {
              const assignmentIndex = rsa.RawSquadAssignments.findIndex(
                (a) => a.memberId === req.params.accountId
              );
              if (assignmentIndex !== -1) {
                rsa.RawSquadAssignments.splice(assignmentIndex, 1);
                party.meta[squadKey] = JSON.stringify(rsa);
              }
            }
          } catch (e) {
            console.error("[ERROR] Parsing RawSquadAssignments:", e);
          }
        }

        // Definir novo capitão se necessário
        if (member.role === "CAPTAIN" && party.members.length > 0) {
          party.members[0].role = "CAPTAIN";
        }

        party.revision = (party.revision || 0) + 1;
        party.updated_at = new Date().toISOString();

        // Notificar saída do membro
        const notifications = party.members.map((m) =>
          safeSendXmpp(m.account_id, {
            account_id: req.params.accountId,
            member_state_update: {},
            ns: "Fortnite",
            party_id: party.id,
            revision: party.revision,
            sent: new Date().toISOString(),
            type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT",
          })
        );
        await Promise.all(notifications);

        if (party.members.length === 0) {
          delete global.parties[req.params.pid];
          console.log(
            `[PARTY DELETED] ${req.params.pid} - No members left`
          );
        } else {
          global.parties[req.params.pid] = party;

          // Atualização de party após remoção
          const captain = party.members.find((m) => m.role === "CAPTAIN");
          const updateNotifications = party.members.map((m) =>
            safeSendXmpp(m.account_id, {
              captain_id: captain.account_id,
              created_at: party.created_at,
              invite_ttl_seconds: 14400,
              max_number_of_members: party.config.max_size || 16,
              ns: "Fortnite",
              party_id: party.id,
              party_privacy_type: party.config.joinability || "OPEN",
              party_state_overriden: {},
              party_state_removed: [],
              party_state_updated: {},
              party_sub_type:
                party.meta["urn:epic:cfg:party-type-id_s"] || "default",
              party_type: "DEFAULT",
              revision: party.revision,
              sent: new Date().toISOString(),
              type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
              updated_at: party.updated_at,
            })
          );
          await Promise.all(updateNotifications);
        }

        res.status(204).end();
      } catch (err) {
        console.error(
          "[ERROR] DELETE /party/api/v1/Fortnite/parties/:pid/members/:accountId:",
          err
        );
        res.status(500).json({
          errorCode: "errors.com.epicgames.common.server_error",
          errorMessage: "Internal server error",
          numericErrorCode: 1000,
          originatingService: "any",
          intent: "prod",
        });
      }
    });
  }
);

// Entrar em uma party existente
app.post(
  "/party/api/v1/Fortnite/parties/:pid/members/:accountId/join",
  verifyToken,
  async (req, res) => {
    await withPartyLock(req.params.pid, async () => {
      try {
        let party = global.parties[req.params.pid];
        if (!party) {
          return error.createError(
            "errors.com.epicgames.party.not_found",
            `Party ${req.params.pid} does not exist!`,
            undefined,
            51002,
            undefined,
            404,
            res
          );
        }

        // Já está na party
        const existingMemberIndex = party.members.findIndex(
          (m) => m.account_id === req.params.accountId
        );
        if (existingMemberIndex !== -1) {
          return res.status(200).json({
            status: "JOINED",
            party_id: party.id,
          });
        }

        // Party cheia
        if (party.members.length >= (party.config.max_size || 16)) {
          return error.createError(
            "errors.com.epicgames.party.party_full",
            `Party ${req.params.pid} is full!`,
            undefined,
            51010,
            undefined,
            403,
            res
          );
        }

        // Verificar se é OPEN ou se tem invite
        if (party.config.joinability !== "OPEN") {
          const hasInvite =
            party.invites &&
            party.invites.find(
              (i) =>
                i.sent_to === req.params.accountId && i.status === "SENT"
            );
          if (!hasInvite) {
            return error.createError(
              "errors.com.epicgames.party.not_invited",
              `User ${req.params.accountId} is not invited to party ${req.params.pid}!`,
              undefined,
              51011,
              undefined,
              403,
              res
            );
          }
        }

        // Verificar se já está em outra party
        const userInOtherParty = Object.values(global.parties).some(
          (p) =>
            p.id !== party.id &&
            p.members &&
            p.members.some((m) => m.account_id === req.params.accountId)
        );
        if (userInOtherParty) {
          return error.createError(
            "errors.com.epicgames.party.already_in_party",
            `User ${req.params.accountId} is already in another party!`,
            undefined,
            51003,
            undefined,
            400,
            res
          );
        }

        const conn = req.body.connection || {};
        const accountId =
          (conn.id || "").split("@prod")[0] || req.params.accountId;
        const connectionId = conn.id || "";

        const newMember = {
          account_id: accountId,
          meta: req.body.meta || {},
          connections: [
            {
              id: connectionId,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              yield_leadership: conn.yield_leadership || false,
              meta: conn.meta || {},
            },
          ],
          revision: 0,
          updated_at: new Date().toISOString(),
          joined_at: new Date().toISOString(),
          role: conn.yield_leadership ? "CAPTAIN" : "MEMBER",
        };

        party.members.push(newMember);

        // Atualizar RawSquadAssignments
        const squadKey = party.meta["Default:RawSquadAssignments_j"]
          ? "Default:RawSquadAssignments_j"
          : "RawSquadAssignments_j";

        if (party.meta && party.meta[squadKey]) {
          try {
            const rsa = JSON.parse(party.meta[squadKey]);
            if (rsa.RawSquadAssignments && Array.isArray(rsa.RawSquadAssignments)) {
              rsa.RawSquadAssignments.push({
                memberId: accountId,
                absoluteMemberIdx: party.members.length - 1,
              });
              party.meta[squadKey] = JSON.stringify(rsa);
            }
          } catch (e) {
            console.error("[ERROR] Parsing RawSquadAssignments:", e);
          }
        }

        party.revision = (party.revision || 0) + 1;
        party.updated_at = new Date().toISOString();

        // Remover invite se existir
        if (party.invites && Array.isArray(party.invites)) {
          party.invites = party.invites.filter(
            (i) =>
              !(
                i.sent_to === req.params.accountId && i.status === "SENT"
              )
          );
        }

        global.parties[req.params.pid] = party;

        const captain = party.members.find((m) => m.role === "CAPTAIN");

        // Notificar JOIN
        const joinNotifications = party.members.map((member) =>
          safeSendXmpp(member.account_id, {
            account_dn:
              (conn.meta && conn.meta["urn:epic:member:dn_s"]) || "Player",
            account_id: accountId,
            connection: {
              connected_at: new Date().toISOString(),
              id: connectionId,
              meta: conn.meta || {},
              updated_at: new Date().toISOString(),
            },
            joined_at: newMember.joined_at,
            member_state_updated: req.body.meta || {},
            ns: "Fortnite",
            party_id: party.id,
            revision: 0,
            sent: new Date().toISOString(),
            type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
            updated_at: newMember.updated_at,
          })
        );
        await Promise.all(joinNotifications);

        // Atualização de party após JOIN
        const updateNotifications = party.members.map((member) =>
          safeSendXmpp(member.account_id, {
            captain_id: captain.account_id,
            created_at: party.created_at,
            invite_ttl_seconds: 14400,
            max_number_of_members: party.config.max_size || 16,
            ns: "Fortnite",
            party_id: party.id,
            party_privacy_type: party.config.joinability || "OPEN",
            party_state_overriden: {},
            party_state_removed: [],
            party_state_updated: {},
            party_sub_type:
              party.meta["urn:epic:cfg:party-type-id_s"] || "default",
            party_type: "DEFAULT",
            revision: party.revision,
            sent: new Date().toISOString(),
            type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
            updated_at: party.updated_at,
          })
        );
        await Promise.all(updateNotifications);

        res.json({
          status: "JOINED",
          party_id: party.id,
        });
      } catch (err) {
        console.error(
          "[ERROR] POST /party/api/v1/Fortnite/parties/:pid/members/:accountId/join:",
          err
        );
        res.status(500).json({
          errorCode: "errors.com.epicgames.common.server_error",
          errorMessage: "Internal server error",
          numericErrorCode: 1000,
          originatingService: "any",
          intent: "prod",
        });
      }
    });
  }
);

module.exports = app;