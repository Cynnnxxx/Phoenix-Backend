// Redemption Codes Configuration
// This file loads codes from Config/redeemcodes.json
// Edit redeemcodes.json to add or modify codes

const fs = require("fs");
const path = require("path");
const RedeemCodes = require("../model/redeemcodes.js");


let codesData = [];
try {
    const codesFile = path.join(__dirname, "redeemcodes.json");
    if (fs.existsSync(codesFile)) {
        const fileContent = fs.readFileSync(codesFile, "utf8");
        const jsonData = JSON.parse(fileContent);
        codesData = jsonData.codes || [];
    }
} catch (err) {
    console.error("Error loading codes from JSON file:", err);
    codesData = [
        { code: "WELCOME100", vbucks: 100, expiresAt: null },
        { code: "FREEBUCKS", vbucks: 500, expiresAt: null },
        { code: "LAUNCH2024", vbucks: 1000, expiresAt: null }
    ];
}


const codes = codesData.map(codeData => ({
    code: codeData.code,
    vbucks: codeData.vbucks,
    expiresAt: codeData.expiresAt ? new Date(codeData.expiresAt) : null
}));


async function initializeCodes() {
    for (const codeData of codes) {
        try {
            const codeLower = codeData.code.toLowerCase();
            
            const existingCode = await RedeemCodes.findOne({ code_lower: codeLower });
            
            if (!existingCode) {
                await RedeemCodes.create({
                    code: codeData.code,
                    code_lower: codeLower,
                    vbucks: codeData.vbucks,
                    used: false,
                    expiresAt: codeData.expiresAt || null,
                    created: new Date()
                });
                console.log(`Code ${codeData.code} added to database`);
            } else {
                console.log(`Code ${codeData.code} already exists in database`);
            }
        } catch (err) {
            console.error(`Error adding code ${codeData.code}:`, err);
        }
    }
}

/**

 * @param {string} code
 * @param {number} vbucks 
 * @param {Date|null} expiresAt
 */
async function addCode(code, vbucks, expiresAt = null) {
    try {
        const codeLower = code.toLowerCase();
        
        const existingCode = await RedeemCodes.findOne({ code_lower: codeLower });
        
        if (existingCode) {
            throw new Error(`Code ${code} already exists`);
        }
        
        await RedeemCodes.create({
            code: code,
            code_lower: codeLower,
            vbucks: vbucks,
            used: false,
            expiresAt: expiresAt,
            created: new Date()
        });
        
        console.log(`Code ${code} added successfully`);
        return true;
    } catch (err) {
        console.error(`Error adding code ${code}:`, err);
        throw err;
    }
}


async function listCodes() {
    try {
        const allCodes = await RedeemCodes.find({}).lean();
        return allCodes;
    } catch (err) {
        console.error("Error listing codes:", err);
        throw err;
    }
}

module.exports = {
    codes,
    initializeCodes,
    addCode,
    listCodes
};

