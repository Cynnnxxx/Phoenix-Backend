// Script to initialize redemption codes in the database
// Usage: node scripts/initCodes.js

const mongoose = require("mongoose");
const config = require("../Config/config.json");
const { initializeCodes } = require("../Config/codes.js");

async function main() {
    try {
        // Connect to MongoDB
        await mongoose.connect(config.mongodb.database);
        console.log("Connected to MongoDB");

        // Initialize codes
        await initializeCodes();
        console.log("Codes initialization complete!");

        // Close connection
        await mongoose.connection.close();
        console.log("Database connection closed");
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

main();

