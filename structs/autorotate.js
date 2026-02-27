const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../Config/config.json');
const log = require("./log.js");

const webhook = config.bItemShopWebhook; 
const fortniteapi = "https://fortnite-api.com/v2/cosmetics/br";
const catalogcfg = path.join(__dirname, "..", 'Config', 'catalog_config.json');

const chapterlimit = config.bChapterlimit; 
const seasonlimit = config.bSeasonlimit; 
const dailyItemsCount = config.bDailyItemsAmount;
const featuredItemsCount = config.bFeaturedItemsAmount;
const bundleCount = config.bBundleAmount || 2; // Number of bundles to add to shop

async function fetchitems() {
    try {
        const response = await axios.get(fortniteapi, { timeout: 10000 }); // 10 second timeout
        const cosmetics = response.data.data || [];
        const excludedItems = config.bExcludedItems || [];

        return cosmetics.filter(item => {
            const { id, introduction, rarity } = item;
            const chapter = introduction?.chapter ? parseInt(introduction.chapter, 10) : null;
            const season = introduction?.season ? introduction.season.toString() : null;
            const itemRarity = rarity?.displayValue?.toLowerCase();

            if (!chapter || !season) return false;
            if (excludedItems.includes(id)) return false;

            const maxChapter = parseInt(chapterlimit, 10);
            const maxSeason = seasonlimit.toString();

            if (maxSeason === "OG") {
                return chapter >= 1 && chapter <= maxChapter && itemRarity !== "common";
            }

            if (
                chapter < 1 || chapter > maxChapter ||
                (chapter === maxChapter && (season === "X" || parseInt(season, 10) > parseInt(maxSeason, 10)))
            ) {
                return false;
            }

            return itemRarity !== "common";
        });
    } catch (error) {
        log.error('Error fetching cosmetics:', error.message || error);
        return [];
    }
}

function pickRandomItems(items, count) {
    const itemTypeBuckets = {
        athenaCharacter: [],
        athenaDance: [],
        athenaBackpack: [],
        athenaGlider: [],
        athenaPickaxe: [],
        loadingScreen: [],
        emoji: []
    };

    items.forEach(item => {
        const type = item.type?.value.toLowerCase();
        switch (type) {
            case "outfit":
                itemTypeBuckets.athenaCharacter.push(item);
                break;
            case "emote":
                itemTypeBuckets.athenaDance.push(item);
                break;
            case "backpack":
                itemTypeBuckets.athenaBackpack.push(item);
                break;
            case "glider":
                itemTypeBuckets.athenaGlider.push(item);
                break;
            case "pickaxe":
                itemTypeBuckets.athenaPickaxe.push(item);
                break;
            case "loadingscreen":
                itemTypeBuckets.loadingScreen.push(item);
                break;
            case "emoji":
                itemTypeBuckets.emoji.push(item);
                break;
            default:
                break;
        }
    });

    const selectedItems = [];

    function addItemsFromBucket(bucket, requiredCount) {
        const availableItems = bucket.sort(() => 0.5 - Math.random()).slice(0, requiredCount);
        selectedItems.push(...availableItems);
    }

    addItemsFromBucket(itemTypeBuckets.athenaCharacter, Math.min(2, count));
    addItemsFromBucket(itemTypeBuckets.athenaDance, Math.min(1, count));
    addItemsFromBucket(itemTypeBuckets.athenaBackpack, Math.min(1, count));
    addItemsFromBucket(itemTypeBuckets.athenaGlider, Math.min(1, count));
    addItemsFromBucket(itemTypeBuckets.athenaPickaxe, Math.min(1, count));
    addItemsFromBucket(itemTypeBuckets.loadingScreen, Math.min(1, count));
    addItemsFromBucket(itemTypeBuckets.emoji, Math.min(1, count));

    const remainingCount = count - selectedItems.length;
    const remainingItems = items.filter(item => !selectedItems.includes(item));

    const extraItems = remainingItems.sort(() => 0.5 - Math.random()).slice(0, remainingCount);
    selectedItems.push(...extraItems);

    return selectedItems.slice(0, count);
}

// Fetch items from Season 1 to Season 14 for bundles
async function fetchBundleItems() {
    try {
        const response = await axios.get(fortniteapi, { timeout: 10000 }); // 10 second timeout
        const cosmetics = response.data.data || [];
        const excludedItems = config.bExcludedItems || [];

        return cosmetics.filter(item => {
            const { id, introduction, rarity } = item;
            const chapter = introduction?.chapter ? parseInt(introduction.chapter, 10) : null;
            const season = introduction?.season ? introduction.season.toString() : null;
            const itemRarity = rarity?.displayValue?.toLowerCase();

            if (!chapter || !season) return false;
            if (excludedItems.includes(id)) return false;

            // Filter for Season 1 to Season 14 (Chapter 1 Season 1 to Chapter 2 Season 4)
            // Season 1-10 = Chapter 1, Season 11-14 = Chapter 2 Season 1-4
            const seasonNum = parseInt(season, 10);
            if (chapter === 1 && seasonNum >= 1 && seasonNum <= 10) {
                return itemRarity !== "common";
            }
            if (chapter === 2 && seasonNum >= 1 && seasonNum <= 4) {
                return itemRarity !== "common";
            }

            return false;
        });
    } catch (error) {
        log.error('Error fetching bundle cosmetics:', error.message || error);
        return [];
    }
}

// Generate bundles (Character + Pickaxe + BackBling + Emote)
function generateBundles(items, count) {
    const bundles = [];
    const itemTypeBuckets = {
        outfit: [],
        pickaxe: [],
        backpack: [],
        emote: []
    };

    // Organize items by type
    items.forEach(item => {
        const type = item.type?.value?.toLowerCase();
        if (itemTypeBuckets[type]) {
            itemTypeBuckets[type].push(item);
        }
    });

    // Check if we have enough items in each category
    const minItems = Math.min(
        itemTypeBuckets.outfit.length,
        itemTypeBuckets.pickaxe.length,
        itemTypeBuckets.backpack.length,
        itemTypeBuckets.emote.length
    );

    if (minItems === 0) {
        log.error('Not enough items to generate bundles. Missing items in one or more categories.');
        return [];
    }

    // Shuffle each bucket multiple times for better randomization
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    Object.keys(itemTypeBuckets).forEach(type => {
        itemTypeBuckets[type] = shuffleArray(itemTypeBuckets[type]);
    });

    // Generate bundles with unique combinations
    const usedCombinations = new Set();
    let attempts = 0;
    const maxAttempts = count * 10;

    while (bundles.length < count && attempts < maxAttempts) {
        const outfitIndex = Math.floor(Math.random() * Math.min(itemTypeBuckets.outfit.length, minItems));
        const pickaxeIndex = Math.floor(Math.random() * Math.min(itemTypeBuckets.pickaxe.length, minItems));
        const backpackIndex = Math.floor(Math.random() * Math.min(itemTypeBuckets.backpack.length, minItems));
        const emoteIndex = Math.floor(Math.random() * Math.min(itemTypeBuckets.emote.length, minItems));

        const combinationKey = `${outfitIndex}-${pickaxeIndex}-${backpackIndex}-${emoteIndex}`;

        if (!usedCombinations.has(combinationKey)) {
            const bundle = {
                outfit: itemTypeBuckets.outfit[outfitIndex],
                pickaxe: itemTypeBuckets.pickaxe[pickaxeIndex],
                backpack: itemTypeBuckets.backpack[backpackIndex],
                emote: itemTypeBuckets.emote[emoteIndex]
            };

            // Make sure we have all required items
            if (bundle.outfit && bundle.pickaxe && bundle.backpack && bundle.emote) {
                bundles.push(bundle);
                usedCombinations.add(combinationKey);
            }
        }
        attempts++;
    }

    return bundles;
}

// Format bundle item grants
function formatBundleGrants(bundle) {
    const grants = [];
    
    if (bundle.outfit) {
        grants.push(`AthenaCharacter:${bundle.outfit.id}`);
    }
    if (bundle.pickaxe) {
        grants.push(`AthenaPickaxe:${bundle.pickaxe.id}`);
    }
    if (bundle.backpack) {
        grants.push(`AthenaBackpack:${bundle.backpack.id}`);
    }
    if (bundle.emote) {
        grants.push(`AthenaDance:${bundle.emote.id}`);
    }

    return grants;
}

// Calculate bundle price (sum of individual prices with 20% discount)
function calculateBundlePrice(bundle) {
    let totalPrice = 0;
    
    if (bundle.outfit) totalPrice += notproperpricegen(bundle.outfit);
    if (bundle.pickaxe) totalPrice += notproperpricegen(bundle.pickaxe);
    if (bundle.backpack) totalPrice += notproperpricegen(bundle.backpack);
    if (bundle.emote) totalPrice += notproperpricegen(bundle.emote);

    // Apply 20% discount (round to nearest 100)
    const discountedPrice = Math.round(totalPrice * 0.8 / 100) * 100;
    return discountedPrice;
}

function formatitemgrantsyk(item) {
    const { id, backendValue, type } = item;
    let itemType;

    switch (type.value.toLowerCase()) {
        case "outfit":
            itemType = "AthenaCharacter";  
            break;
        case "emote":
            itemType = "AthenaDance";  
            break;
        default:
            itemType = backendValue || `Athena${capitalizeomg(type.value)}`;
            break;
    }

    return [`${itemType}:${id}`];
}

function capitalizeomg(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function notproperpricegen(item) {
    const rarity = item.rarity?.displayValue?.toLowerCase();
    const type = item.type?.value?.toLowerCase();
    const series = item.series?.value?.toLowerCase();

    if (series) {
        switch (series) {
            case 'gaming legends series':
            case 'marvel series':
            case 'star wars series':
            case 'dc series':
            case 'icon series':
                switch (type) {
                    case 'outfit':
                        return 1500;
                    case 'pickaxe':
                        return 1200;
                    case 'backpack':
                        return 1200;
                    case 'emote':
                        return 500;
                    case 'glider':
                        return 1200;
                    case 'wrap':
                        return 700;
                    case 'loadingscreen':
                        return 500;
                    case 'music':
                        return 200;
                    case 'emoji':
                        return 200;
                    default:
                        return 999999;
                }
            case 'lava series':
                switch (type) {
                    case 'outfit':
                    case 'glider':
                    case 'backpack':
                        return 2000;
                    case 'pickaxe':
                        return 1200;
                    case 'loadingscreen':
                        return 500;
                    case 'music':
                        return 200;
                    case 'emoji':
                        return 200;
                    default:
                        return 999999;
                }
            case 'shadow series':
            case 'frozen series':
            case 'slurp series':
            case 'dark series':
                switch (type) {
                    case 'outfit':
                        return 1500;
                    case 'pickaxe':
                        return 1200;
                    case 'backpack':
                        return 1200;
                    case 'glider':
                        return 1200;
                    case 'wrap':
                        return 700;
                    case 'loadingscreen':
                        return 500;
                    case 'music':
                        return 200;
                    case 'emoji':
                        return 200;
                    default:
                        return 999999;
                }
            default:
                return 999999;
        }
    }

    switch (type) {
        case 'outfit':
            switch (rarity) {
                case 'legendary':
                    return 2000;
                case 'epic':
                    return 1500;
                case 'rare':
                    return 1200;
                case 'uncommon':
                    return 800;
                default:
                    return 999999;
            }
        case 'pickaxe':
            switch (rarity) {
                case 'epic':
                    return 1200;
                case 'rare':
                    return 800;
                case 'uncommon':
                    return 500;
                default:
                    return 999999;
            }
        case 'backpack':
            switch (rarity) {
                case 'legendary':
                    return 2000;
                case 'epic':
                    return 1500;
                case 'rare':
                    return 1200;
                case 'uncommon':
                    return 200;
                default:
                    return 999999;
            }
        case 'emote':
        case 'spray':
        case 'emoji':
            switch (rarity) {
                case 'legendary':
                    return 2000;
                case 'epic':
                    return 800;
                case 'rare':
                    return 500;
                case 'uncommon':
                    return 200;
                default:
                    return 999999;
            }
        case 'glider':
            switch (rarity) {
                case 'legendary':
                    return 2000;
                case 'epic':
                    return 1200;
                case 'rare':
                    return 800;
                case 'uncommon':
                    return 500;
                default:
                    return 999999;
            }
        case 'wrap':
            switch (rarity) {
                case 'legendary':
                    return 1200;
                case 'epic':
                    return 700;
                case 'rare':
                    return 500;
                case 'uncommon':
                    return 300;
                default:
                    return 999999;
            }
        case 'loadingscreen':
            switch (rarity) {
                case 'legendary':
                case 'epic':
                case 'rare':
                    return 500;
                case 'uncommon':
                    return 200;
                default:
                    return 999999;
            }
        case 'music':
            switch (rarity) {
                case 'legendary':
                case 'epic':
                    return 500;
                case 'rare':
                case 'uncommon':
                    return 200;
                default:
                    return 999999;
            }
        default:
            return 999999;
    }
}

function updatecfgomg(dailyItems, featuredItems, bundles = []) {
    const catalogConfig = { "//": "BR Item Shop Config" };

    dailyItems.forEach((item, index) => {
        catalogConfig[`daily${index + 1}`] = {
            itemGrants: formatitemgrantsyk(item),
            price: notproperpricegen(item)
        };
    });

    featuredItems.forEach((item, index) => {
        catalogConfig[`featured${index + 1}`] = {
            itemGrants: formatitemgrantsyk(item),
            price: notproperpricegen(item)
        };
    });

    // Add bundles to featured section
    bundles.forEach((bundle, index) => {
        catalogConfig[`bundle${index + 1}`] = {
            itemGrants: formatBundleGrants(bundle),
            price: calculateBundlePrice(bundle),
            SectionId: "Featured",
            TileSize: "Small"
        };
    });

    fs.writeFileSync(catalogcfg, JSON.stringify(catalogConfig, null, 2), 'utf-8');
    log.AutoRotation("The item shop has rotated!");
}

async function fetchItemIcon(itemName) {
    try {
        const response = await axios.get(`https://fortnite-api.com/v2/cosmetics/br/search?name=${encodeURIComponent(itemName)}`);
        if (response.data && response.data.data && response.data.data.images && response.data.data.images.smallIcon) {
            return response.data.data.images.smallIcon;
        } else {
            log.error(`No small icon found for ${itemName}`);
            return null;
        }
    } catch (error) {
        log.error(`Error fetching icon for ${itemName}:`, error.message || error);
        return null;
    }
}

async function discordpost(itemShop) {
    const embeds = [];

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
    }

    async function formatItemEmbed(item, authorTitle = null) {
        const itemName = `**${capitalizeFirstLetter(item.name || "Unknown Item")}**`;
        const itemRarity = `Rarity: **${capitalizeFirstLetter(item.rarity?.displayValue || "Unknown")}**`;
        const itemPrice = `Price: **${notproperpricegen(item)} V-Bucks**`;
        const itemIcon = await fetchItemIcon(item.name);

        const embed = {
            title: itemName,
            color: 0x00FF7F,
            description: `${itemRarity}\n${itemPrice}`,
            thumbnail: {
                url: itemIcon || 'https://via.placeholder.com/150' // prevents crash with placeholder images
            }
        };

        if (authorTitle) {
            embed.author = { name: authorTitle };
        }

        return embed;
    }

    function getNextRotationTime() {
        const now = new Date();
        const [localHour, localMinute] = config.bRotateTime.split(':').map(Number);
        const nextRotation = new Date(now);

        nextRotation.setHours(localHour, localMinute, 0, 0);

        if (now >= nextRotation) {
            nextRotation.setDate(nextRotation.getDate() + 1);
        }

        return Math.floor(nextRotation.getTime() / 1000);
    }

    embeds.push({
        title: "[astris-backend] Item Shop",
        description: `These are the cosmetics for today!`,
        color: 0x00FF7F,
        fields: [],
    });

    if (itemShop.featured.length > 0) {
        for (const [index, item] of itemShop.featured.entries()) {
            const embed = await formatItemEmbed(item, index === 0 ? "Feature Item" : null);
            embeds.push(embed);
        }
    }

    if (itemShop.daily.length > 0) {
        for (const [index, item] of itemShop.daily.entries()) {
            const embed = await formatItemEmbed(item, index === 0 ? "Daily Item" : null);
            embeds.push(embed);
        }
    }

    if (itemShop.bundles && itemShop.bundles.length > 0) {
        for (const [index, bundle] of itemShop.bundles.entries()) {
            const bundlePrice = calculateBundlePrice(bundle);
            const bundleItems = [];
            if (bundle.outfit) bundleItems.push(`**${bundle.outfit.name}** (Outfit)`);
            if (bundle.pickaxe) bundleItems.push(`**${bundle.pickaxe.name}** (Pickaxe)`);
            if (bundle.backpack) bundleItems.push(`**${bundle.backpack.name}** (Back Bling)`);
            if (bundle.emote) bundleItems.push(`**${bundle.emote.name}** (Emote)`);
            
            const bundleIcon = bundle.outfit ? await fetchItemIcon(bundle.outfit.name) : null;
            
            embeds.push({
                title: `**Bundle ${index + 1}**`,
                description: `**Price:** ${bundlePrice} V-Bucks\n**Items:**\n${bundleItems.join('\n')}`,
                color: 0x00FF7F,
                thumbnail: {
                    url: bundleIcon || 'https://via.placeholder.com/150'
                },
                author: index === 0 ? { name: "Bundle" } : null
            });
        }
    }

    const nextRotationTimestamp = getNextRotationTime();
    embeds.push({
        description: `The next shop will be updated at <t:${nextRotationTimestamp}:t>.`,
        color: 0x00FF7F
    });

    try {
        if (config.bEnableDiscordWebhook === true) {
            const chunkSize = 10;
            for (let i = 0; i < embeds.length; i += chunkSize) {
                const embedChunk = embeds.slice(i, i + chunkSize);
                const response = await axios.post(webhook, { embeds: embedChunk });
                log.AutoRotation(`Item shop posted successfully to Discord (chunk ${i / chunkSize + 1}):`, response.status);
            }
        }
    } catch (error) {
        log.error(`Error sending item shop to Discord: ${error.message}`);
        if (error.response && error.response.data) {
            log.error(`Discord API response: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
}


async function rotateshop() {
    try {
        const cosmetics = await fetchitems();
        if (cosmetics.length === 0) {
            log.error('No cosmetics found?'); // target was here!
            return;
        }

        const dailyItems = pickRandomItems(cosmetics, dailyItemsCount);
        const featuredItems = pickRandomItems(cosmetics, featuredItemsCount);

        // Fetch and generate bundles from Season 1-14
        const bundleItems = await fetchBundleItems();
        const bundles = generateBundles(bundleItems, bundleCount);

        updatecfgomg(dailyItems, featuredItems, bundles);
        await discordpost({ daily: dailyItems, featured: featuredItems, bundles });

        const nextRotationTime = milisecstillnextrotation();
        log.AutoRotation(`Scheduling next rotation in: ${nextRotationTime} milliseconds`);
        
        setTimeout(rotateshop, nextRotationTime);

    } catch (error) {
        log.error('Error while rotating:', error.message || error);
    }
}

// Manual refresh function for Discord command (without scheduling)
async function manualRefreshShop() {
    try {
        log.AutoRotation('Manual shop refresh initiated...');
        
        const cosmetics = await fetchitems();
        if (cosmetics.length === 0) {
            throw new Error('No cosmetics found');
        }
        log.AutoRotation(`Fetched ${cosmetics.length} cosmetics`);

        const dailyItems = pickRandomItems(cosmetics, dailyItemsCount);
        const featuredItems = pickRandomItems(cosmetics, featuredItemsCount);
        log.AutoRotation(`Selected ${dailyItems.length} daily items and ${featuredItems.length} featured items`);

        // Fetch and generate bundles from Season 1-14
        let bundles = [];
        try {
            const bundleItems = await fetchBundleItems();
            log.AutoRotation(`Fetched ${bundleItems.length} bundle items from Season 1-14`);
            
            if (bundleItems.length > 0) {
                bundles = generateBundles(bundleItems, bundleCount);
                log.AutoRotation(`Generated ${bundles.length} bundles`);
            } else {
                log.AutoRotation('Warning: No bundle items found, skipping bundles');
            }
        } catch (bundleError) {
            log.error('Error generating bundles (continuing without bundles):', bundleError.message || bundleError);
            // Continue without bundles if there's an error
            bundles = [];
        }

        updatecfgomg(dailyItems, featuredItems, bundles);
        log.AutoRotation('Catalog config updated');
        
        // Post to Discord webhook asynchronously (don't wait for it)
        discordpost({ daily: dailyItems, featured: featuredItems, bundles }).catch(discordError => {
            log.error('Error posting to Discord webhook (shop still refreshed):', discordError.message || discordError);
        });

        log.AutoRotation('Manual shop refresh completed successfully');
        return { success: true, dailyItems, featuredItems, bundles };
    } catch (error) {
        log.error('Error while manually refreshing shop:', error.message || error);
        throw error;
    }
}

function getUTCTimeFromLocal(hour, minute) {
    const now = new Date();
    const localTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    return new Date(localTime.toUTCString());
}

function milisecstillnextrotation() {
    const now = new Date();
    const [localHour, localMinute] = config.bRotateTime.toString().split(':').map(Number);
    const nextRotation = getUTCTimeFromLocal(localHour, localMinute);

    if (now.getTime() >= nextRotation.getTime()) {
        nextRotation.setUTCDate(nextRotation.getUTCDate() + 1);
    }

    const millisUntilNextRotation = nextRotation.getTime() - now.getTime();
    log.AutoRotation(`Current time: ${now.toUTCString()}`);
    log.AutoRotation(`Next rotation time (UTC): ${nextRotation.toUTCString()}`);
    log.AutoRotation(`Milliseconds until next rotation: ${millisUntilNextRotation}`);

    return millisUntilNextRotation;
}

setTimeout(rotateshop, milisecstillnextrotation());

module.exports = { manualRefreshShop };