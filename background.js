async function displayStorage(keyMatcher, valMatcher) {
    let keyVals = await scanStorage(keyMatcher, valMatcher);
    let count = Object.keys(keyVals).length;
    console.log(`Matched ${count} entries`, keyVals);
}

async function displayItemData(valMatcher) {
    return displayStorage(k => k.startsWith(getItemDataKeyPrefix()), valMatcher);
}

async function deleteStorage(keyMatcher, valMatcher) {
    let keyVals = await scanStorage(keyMatcher, valMatcher);
    let count = Object.keys(keyVals).length;
    console.log(`Removing ${count} entries`, keyVals);
    await browser.storage.local.remove(Object.keys(keyVals));
}

async function deleteItemPriceCache(valMatcher) {
    return deleteStorage(key => key.startsWith(getItemPriceKeyPrefix()), valMatcher);
}

async function deleteItemPriceCacheErrorOrNoPrice() {
    return deleteItemPriceCache(val => {
        let hasError = val.data?.error;
        let noPrice = val.data && !val.data?.average;
        return hasError || noPrice;
    });
}

async function scanStorageItemPrice() {
    return scanStorage(k => k.startsWith(getItemPriceKeyPrefix()));
}

async function scanStorageItemData() {
    return scanStorage(k => k.startsWith(getItemDataKeyPrefix()));
}

async function scanStorageEffectData() {
    return scanStorage(k => k.startsWith(getEffectDataKeyPrefix()));
}

async function scanStorageMallLinks() {
    return scanStorage(k => k == getMallLinksKey());
}

async function scanStorageMallAlerts() {
    return scanStorage(k => k == getMallAlertsKey());
}

async function writeObjectToClipboard(obj) {
    let json = JSON.stringify(obj);
    await navigator.clipboard.writeText(json);
    console.log("Exported to clipboard");
}

async function exportCacheToClipboard() {
    let data = {
        "item_price": await scanStorageItemPrice(),
        "item_data": await scanStorageItemData(),
        "effect_data": await scanStorageEffectData(),
        "mall_links": await scanStorageMallLinks(),
        "mall_alerts": await scanStorageMallAlerts(),
    };
    return writeObjectToClipboard(data);
}

async function importCacheFromBackup() {
    let response = await fetch(browser.runtime.getURL("data/local/exported_backup.json"));
    let data = await response.json();

    for (let category of Object.keys(data)) {
        await browser.storage.local.set(data[category]);
        console.log(`Imported ${Object.keys(data[category]).length} entries from ${category}`);
    }
}

async function importDataFile(path, type, countEntries) {
    try {
        let response = await fetch(browser.runtime.getURL(path));
        let keyVals = await response.json();
        await browser.storage.local.set(keyVals);
        console.log(`Imported ${countEntries(keyVals)} ${type} entries`);
    } catch (e) {}
}

(async function() {
    let cacheFetch = await browser.storage.local.get(null);
    if (!Object.keys(cacheFetch).length) {
        importCacheFromBackup();
    }
})();

let priceCheckQueue = {};
let itemDescFetchQueue = {};

browser.runtime.onMessage.addListener(message => {
    switch (message.operation) {
        case "gotoUrl":
            return notifyGotoUrl(message.windowId, message.url);
        case "chooseIcon":
            return notifyChooseIcon(message.windowId, message.iconName);
        case "fetchPrice":
            return fetchPrice(message.itemId);
        case "queuePriceCheck":
            if (message.itemId) {
                priceCheckQueue[message.itemId] = true;
            }
            return Promise.resolve();
        case "fetchItemData":
            if (message.itemId && message.itemDescId) {
                return fetchItemData(message.itemId, message.itemDescId);
            }
            return Promise.resolve();
        case "fetchEffectData":
            if (message.effectDescId) {
                return fetchEffectData(message.effectId, message.effectDescId);
            }
            return Promise.resolve();
        case "queueItemDescriptionFetch":
            if (message.itemId && message.itemDescId) {
                itemDescFetchQueue[message.itemId] = message.itemDescId;
            }
            return Promise.resolve();
        case "setItemData":
            return setItemData(message.itemId, {...message});
        case "setEffectData":
            return setEffectData(message.effectId, {...message});
        case "checkMallAlerts":
            return checkMallAlerts(message.windowId, message.init);
    }
    return false;
});

let commandListenerPorts = {};
browser.runtime.onConnect.addListener(port => {
    if (port.name == "commandListener") {
        let portId = randomId();
        commandListenerPorts[portId] = port;
        port.onDisconnect.addListener(() => {
            delete commandListenerPorts[portId];
        });
    }
});

let itemUpdateListenerPorts = {};
browser.runtime.onConnect.addListener(port => {
    if (port.name == "itemUpdateListener") {
        let portId = randomId();
        itemUpdateListenerPorts[portId] = port;
        port.onDisconnect.addListener(() => {
            delete itemUpdateListenerPorts[portId];
        });
    }
});

browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name == "priceCheckQueueWorker") {
        let itemIds = Object.keys(priceCheckQueue);
        if (itemIds.length) {
            let itemId = itemIds[Math.floor(Math.random() * itemIds.length)];
            getCachedPrice(itemId).then(async cached => {
                let delayInMinutes;
                try {
                    let fetched = await fetchPrice(itemId);
                    delete priceCheckQueue[itemId];
                    if (fetched.timestamp == cached?.timestamp) {
                        delayInMinutes = 0;
                    } else {
                        delayInMinutes = 1 / 60;
                    }
                } catch (e) {
                    console.error("Error fetching price", e);
                    delayInMinutes = 30 / 60;
                }
                browser.alarms.create("priceCheckQueueWorker", { delayInMinutes });
            });
        } else {
            browser.alarms.create("priceCheckQueueWorker", {delayInMinutes: 5/60});
        }
    }
});
browser.alarms.create("priceCheckQueueWorker", {delayInMinutes: 5/60});

browser.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name == "itemDescFetchQueueWorker") {
        let itemIds = Object.keys(itemDescFetchQueue);
        let delayInMinutes = 5 / 60;
        if (itemIds.length) {
            let itemId = itemIds[Math.floor(Math.random() * itemIds.length)];
            try {
                let itemData = await getItemData(itemId);
                if (itemData?.description) {
                    delayInMinutes = 0;
                } else {
                    let itemDescId = itemDescFetchQueue[itemId];
                    await fetchItemData(itemId, itemDescId);
                }
                delete itemDescFetchQueue[itemId];
            } catch (e) {
                if (e.message == "not logged in") {
                    itemDescFetchQueue = {};
                } else {
                    console.error("Error fetching item description", e);
                    delayInMinutes = 30 / 60;
                }
            }
        }
        browser.alarms.create("itemDescFetchQueueWorker", {delayInMinutes});
    }
});
browser.alarms.create("itemDescFetchQueueWorker", {delayInMinutes: 5/60});

let fetchingItemIds = new Set();
async function fetchPrice(itemId) {
    let cacheVal = await getCachedPrice(itemId);
    let cacheAge = Date.now() - (cacheVal?.timestamp || 0);
    if (cacheVal && (cacheVal.untradable || cacheAge < 6*60*60*1000)) {
        return cacheVal;
    }

    if (fetchingItemIds.has(itemId)) {
        while (fetchingItemIds.has(itemId)) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        return getCachedPrice(itemId);
    }
    fetchingItemIds.add(itemId);

    console.debug(`Fetching price for itemId=${itemId}, cacheAge=${Math.floor(cacheAge/1000/60/60)}h`);
    let fetched = await fetchPriceNoCache(itemId);

    let itemPriceKey = getItemPriceKey(itemId);
    await browser.storage.local.set({[itemPriceKey]: fetched});
    fetchingItemIds.delete(itemId);
    notifyItemUpdated([itemId]);

    return fetched;
}

async function fetchPriceNoCache(itemId) {
    // const oneWeekTimespan = 2;
    // const lifetimeTimespan = 4;
    // let fetched = await fetchColdfrontPrice(getColdfrontPriceCheckLink(itemId, oneWeekTimespan));
    // if (!fetched.data.error && !fetched.data.average) {
    //     let fetchedLifetime = await fetchColdfrontPrice(getColdfrontPriceCheckLink(itemId, lifetimeTimespan));
    //     if (!fetchedLifetime.data.error) {
    //         fetched = fetchedLifetime;
    //         fetched.data.volume = 0;
    //     }
    // }
    // if (!fetched.data.error) return fetched;

    let mafiaMallPrices = await getMafiaMallPrices();
    let itemPrice = mafiaMallPrices.data[itemId]?.price;
    return {
        timestamp: Date.now(),
        data: {
            average: itemPrice,
            volumne: 0,
        }
    };
}

function getColdfrontPriceCheckLink(itemId, timespan) {
    return `https://kol.coldfront.net/newmarket/itemgraph.php?itemid=${itemId}&timespan=${timespan}`;
}

async function fetchColdfrontPrice(url) {
    let data;
    try {
        let page = await fetchUrl(url);
        data = parseColdfrontPrice(page);
    } catch (e) {
        data = {error: e};
    }
    let timestamp = Date.now();
    return {timestamp, data};
}

function parseColdfrontPrice(page) {
    let error = page.match(/\d+ is not a valid item ID/)?.[0];
    if (error) {
        return {error: "not a valid item ID"};
    }
    try {
        let matches = page.match(/CURRENT AVG PRICE:.*?([0-9,.]+) meat.*BOUGHT THIS TIMESPAN:.*?([0-9,.]+)/);
        let average = parseFormattedNum(matches[1]);
        let volume = parseFormattedNum(matches[2]);
        return {average, volume};
    } catch (e) {
        return {error: e};
    }
}

let isUpdatingMafiaMallPrices = false;

async function getMafiaMallPrices() {
    const storageKey = "mafia_mall_prices";
    let storageFetch = await browser.storage.local.get(storageKey);
    let mafiaMallPrices = storageFetch[storageKey];
    if (!mafiaMallPrices || Date.now() - mafiaMallPrices.timestamp > 30*60*1000/*30min*/) {
        if (isUpdatingMafiaMallPrices) {
            return new Promise(resolve => setTimeout(() => resolve(getMafiaMallPrices())), Math.random()*1000);
        }
        isUpdatingMafiaMallPrices = true;
        console.debug("Refreshing mall prices from mafia");
        try {
            mafiaMallPrices = {
                data: await fetchMafiaMallPrices(),
                timestamp: Date.now(),
            };
            await browser.storage.local.set({[storageKey]: mafiaMallPrices});
        } finally {
            isUpdatingMafiaMallPrices = false;
        }
    }
    return mafiaMallPrices;
}

async function fetchMafiaMallPrices() {
    let page = await fetchUrl("https://kolmafia.us/scripts/updateprices.php?action=getmap");
    let lines = page.split("\n");
    let mallPricesVersion = parseInt(lines[0]);
    if (!mallPricesVersion) throw Error("Unexpected data format");
    let data = {};
    for (let i=1; i<lines.length; i++) {
        let row = lines[i].split("\t");
        let itemId = parseInt(row[0]);
        let timestamp = parseInt(row[1]) * 1000;
        let price = parseInt(row[2]);
        if (itemId && timestamp && price) {
            data[itemId] = {price, timestamp: new Date(timestamp)};
        }
    }
    return data;
}

async function fetchItemData(itemId, itemDescId) {
    let existing = await getItemData(itemId);
    if (existing) return existing;

    console.debug(`Fetching item description itemDescId=${itemDescId} for itemId=${itemId}`);

    let {page} = await fetchPage("/desc_item.php?whichitem=" + itemDescId);
    let data = extractDataFromHtml(page, (doc, content) => {
        let name = doc.evaluate(".//div[@id='description']/center/b", content).iterateNext()?.innerText;
        let description = doc.evaluate(".//blockquote", content).iterateNext()?.innerText;
        return {name, description};
    });

    return setItemData(itemId, data);
}

async function setItemData(itemId, {name, description}) {
    if (!name || !description) return;

    let itemDataKey = getItemDataKey(itemId);

    let {[itemDataKey]: existingItemData} = await browser.storage.local.get(itemDataKey);
    if (existingItemData?.lastModified && Date.now() - existingItemData.lastModified < 5_000) return;

    let flags = parseItemFlagsFromDescription(description);
    let itemData = { itemId, name, description, flags, lastModified: Date.now() };

    await browser.storage.local.set({[itemDataKey]: itemData});

    if (!isTradableItemFlags(flags)) {
        let itemPriceKey = getItemPriceKey(itemId);
        await browser.storage.local.set({[itemPriceKey]: {untradable: true}});
    }

    notifyItemUpdated([itemId]);

    return itemData;
}

async function fetchEffectData(effectId, effectDescId) {
    if (effectId) {
        let existing = await getEffectData(effectId);
        if (existing) return existing;
    }

    console.debug(`Fetching effect description effectDescId=${effectDescId} for effectId=${effectId}`);

    let {page} = await fetchPage("/desc_effect.php?whicheffect=" + effectDescId);
    let data = extractDataFromHtml(page, (doc, content) => {
        let name = doc.evaluate(".//div[@id='description']//center[1]//b", content).iterateNext()?.innerText;
        let effectId = content.innerHTML.match(/<!-- effectid: (\d+) -->/)?.[1];
        let description = doc.evaluate(".//blockquote", content).iterateNext()?.innerText;
        let modifierText = doc.evaluate(".//blockquote/following-sibling::center/font[@color='blue']/b", content).iterateNext()?.innerText;
        return {effectId, name, description, modifierText};
    });

    return setEffectData(data.effectId, data);
}

async function setEffectData(effectId, {name, description, modifierText}) {
    let modifiers = parseModifiersFromText(modifierText);
    if (modifiers.unknown.length) {
        console.log(`Unknown modifiers on effect "${name}":`,
            modifiers.unknown.map(modText => `"${modText}"`).join(", "));
    }
    let effectData = { effectId, name, description, modifierText, modifiers: modifiers.mods, unknownModifiers: modifiers.unknown };

    let effectDataKey = getEffectDataKey(effectId);
    await browser.storage.local.set({[effectDataKey]: effectData});

    return effectData;
}

let mallAlertsState = {
    windowId: 0,
    init: false,
    running: 0,
    prevChecks: {},
};

async function checkMallAlerts(windowId, init) {
    if (init) {
        mallAlertsState.windowId = windowId;
        mallAlertsState.init = true;
    }

    if (mallAlertsState.windowId != windowId) {
        return {error: "Alerts subscribed from a different window"};
    }
    const maxRunTime = 5 * 60 * 1000;
    if (Date.now() - mallAlertsState.running < maxRunTime) return;
    mallAlertsState.running = Date.now();
    mallAlertsState.init = false;

    let result = await doCheckMallAlerts();
    mallAlertsState.running = 0;
    return result;
}

async function doCheckMallAlerts() {
    const recheckDelay = 2 * 60 * 1000;
    const requestDelay = 500;
    const resendAlertDelay = 6 * 60 * 60 * 1000;

    const mallAlertsKey = getMallAlertsKey();
    let cacheFetch = await browser.storage.local.get(mallAlertsKey);
    let entries = cacheFetch[mallAlertsKey];
    mallAlertsState.prevChecks = Object.fromEntries(entries.map(entry => [entry, mallAlertsState.prevChecks[entry]]));

    for (let i=0; i<entries.length; i++) {
        if (mallAlertsState.init) return;

        let prevCheck = mallAlertsState.prevChecks[entries[i]];
        let prevCheckTimestamp = prevCheck?.prevCheckTimestamp || 0;
        let now = Date.now();
        if (now - prevCheckTimestamp < recheckDelay) continue;

        let parts = entries[i].split("@");
        let searchTerm = parts[0];
        let targetPrice = parseFormattedNum(parts[1]);
        if (parts.length != 2 || !searchTerm || !targetPrice) {
            return {error: `Parse error: ${entries[i]}`};
        }

        if (i > 0) await new Promise(resolve => setTimeout(resolve, requestDelay));
        let mallSearchResult = await fetchMallSearch(searchTerm);
        if (mallSearchResult.error) return {error: `Error searching for ${searchTerm}: ${mallSearchResult.error}`};

        let firstListing = mallSearchResult.listings.filter(listing => !listing.limitReached)[0];
        let lowestPrice = firstListing?.price || 0;
        let prevLowestPrice = prevCheck?.lowestPrice;
        let wasActive = prevLowestPrice && prevLowestPrice <= targetPrice;
        let isActive = lowestPrice && lowestPrice <= targetPrice;
        let lastAlertTimestamp = prevCheck?.lastAlertTimestamp;
        if ((!wasActive && isActive) || (isActive && lowestPrice < prevLowestPrice) || (isActive && now - lastAlertTimestamp  > resendAlertDelay)) {
            let diff = targetPrice - lowestPrice;
            let diffPercent = Math.floor((diff / targetPrice) * 100);
            browser.notifications.create(entries[i], {
                type: "basic", title: searchTerm,
                message: `Now: ${lowestPrice.toLocaleString()} Meat\n` +
                            `Target: -${diff.toLocaleString()} Meat (-${diffPercent}%)`
            });
            lastAlertTimestamp = now;
        }

        mallAlertsState.prevChecks[entries[i]] = {
            lowestPrice,
            prevCheckTimestamp: now,
            lastAlertTimestamp
        };
    }
}

browser.notifications.onClicked.addListener(alertText => {
    if (!mallAlertsState.prevChecks[alertText]) return;
    if (!mallAlertsState.windowId) return;
    let searchTerm = alertText.split("@")[0];
    notifyGotoUrl(mallAlertsState.windowId, `/mall.php?pudnuggler=${encodeURIComponent(searchTerm)}`);
});

async function fetchMallSearch(searchTerm) {
    let {page, baseUrl} = await fetchPage(`/mall.php?pudnuggler=${encodeURIComponent(searchTerm)}`);
    return extractDataFromHtml(page, (_, content) => {
        let itemTables = evaluateToNodesArray(".//div[@id='searchresults']/table[@class='itemtable']", {contextNode: content});
        if (itemTables.length > 1) return {error: `Multiple results found for search term: ${searchTerm}`};

        let rows = itemTables.length ? evaluateToNodesArray(".//tr[starts-with(@id, 'stock_')]", {contextNode: itemTables[0]}) : [];
        let listings = rows.map(tr => {
            let storeLink = evaluateToNodesArray("./td[contains(@class, 'store')]/a", {contextNode: tr})[0];
            let storeName = storeLink.innerText;
            let storeHref = storeLink.attributes.href.value;
            let stockColumn = evaluateToNodesArray("./td[contains(@class, 'stock')]", {contextNode: tr})[0];
            let stock = parseFormattedNum(stockColumn.innerText);
            let limitText = stockColumn.nextElementSibling.innerText;
            let limitMatch = limitText.match(/([\d,]+)\s*\/\s*day/);
            let limit = limitMatch ? parseFormattedNum(limitMatch[1]) : 0;
            let limitReached = tr.classList.contains("limited");
            let priceText = evaluateToNodesArray("./td[contains(@class, 'price')]//text()", {contextNode: tr})[0].textContent;
            let price = parseFormattedNum(priceText.replace(/\s+Meat$/, ""));
            return {price, stock, limit, limitReached, storeName, storeUrl: `${baseUrl}/${storeHref}`};
        });
        return {listings};
    });
}

async function fetchPage(path) {
    const baseUrls = [
        "http://127.0.0.1:60080",
        "https://www.kingdomofloathing.com",
    ];

    let errors = [];
    for (let baseUrl of baseUrls) {
        try {
            let url = baseUrl + path;
            let page = await fetchUrl(url);
            if (page.match(/This script is not available unless you're logged in/)) {
                errors.push(Error("not logged in"));
            } else {
                return {page, baseUrl, url};
            }
        } catch (e) {
            errors.push(e);
        }
    }

    throw Error(errors);
}

async function fetchUrl(url) {
    let response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.text();
}

function extractDataFromHtml(html, extractData) {
    let noscriptHtml =
        html.replaceAll(/<script\b/g, "<!--script").replaceAll(/<\/script>/g, "</script-->")
            .replaceAll(/\bonclick\b/gi, "_onclick");

    // content must be added to document for \n to be rendered
    let content = document.createElement("div");
    content.innerHTML = noscriptHtml;
    document.body.append(content);
    let data = extractData(document, content);
    content.remove();

    return data;
}

function notifyItemUpdated(itemIds) {
    for (let port of Object.values(itemUpdateListenerPorts)) {
        port.postMessage({event: "itemUpdated", itemIds});
    }
}

function notifyGotoUrl(windowId, url) {
    for (let port of Object.values(commandListenerPorts)) {
        port.postMessage({ command: "gotoUrl", windowId, url });
    }
}

function notifyChooseIcon(windowId, iconName) {
    for (let port of Object.values(commandListenerPorts)) {
        port.postMessage({ command: "chooseIcon", windowId, iconName });
    }
}
