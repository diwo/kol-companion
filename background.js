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
                        delayInMinutes = 5 / 60;
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
    const oneWeekTimespan = 2;
    const lifetimeTimespan = 4;

    let cacheVal = await getCachedPrice(itemId);
    let cacheAge = Date.now() - cacheVal?.timestamp;
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

    let fetched = await fetchPriceNoCache(getPriceCheckLink(itemId, oneWeekTimespan));
    if (!fetched.data?.error && !fetched.data?.average) {
        let fetchedLifetime = await fetchPriceNoCache(getPriceCheckLink(itemId, lifetimeTimespan));
        if (!fetchedLifetime.data?.error) {
            fetched = fetchedLifetime;
            fetched.data.volume = 0;
        }
    }

    let itemPriceKey = getItemPriceKey(itemId);
    await browser.storage.local.set({[itemPriceKey]: fetched});
    fetchingItemIds.delete(itemId);
    notifyItemUpdated([itemId]);

    return fetched;
}

function getPriceCheckLink(itemId, timespan) {
    return `https://kol.coldfront.net/newmarket/itemgraph.php?itemid=${itemId}&timespan=${timespan}`;
}

async function fetchPriceNoCache(url) {
    let page = await fetchUrl(url);
    let data = parsePrice(page);
    let timestamp = Date.now();
    return {timestamp, data};
}

async function fetchUrl(url) {
    let response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.text();
}

function parsePrice(page) {
    let error = page.match(/\d+ is not a valid item ID/)?.[0];
    if (error) {
        return {error: "not a valid item ID"};
    }
    try {
        let matches = page.match(/CURRENT AVG PRICE:.*?([0-9,.]+) meat.*BOUGHT THIS TIMESPAN:.*?([0-9,.]+)/);
        let average = parseFormattedInt(matches[1]);
        let volume = parseFormattedInt(matches[2]);
        return {average, volume};
    } catch (e) {
        return {error: e};
    }
}

async function fetchItemData(itemId, itemDescId) {
    let existing = await getItemData(itemId);
    if (existing) return existing;

    console.log(`Fetching item description itemDescId=${itemDescId} for itemId=${itemId}`);

    let path = "/desc_item.php?whichitem=" + itemDescId;
    let data = await fetchDescription(path, (doc, content) => {
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

    console.log(`Fetching effect description effectDescId=${effectDescId} for effectId=${effectId}`);

    let path = "/desc_effect.php?whicheffect=" + effectDescId;
    let data = await fetchDescription(path, (doc, content) => {
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

async function fetchDescription(path, extractData) {
    let page = await fetchPage(path);

    // content must be added to document for \n to be rendered
    let content = document.createElement("div");
    content.innerHTML = page;
    document.body.append(content);
    let data = extractData(document, content);
    content.remove();

    return data;
}

async function fetchPage(path) {
    const baseUrls = [
        "http://127.0.0.1:60080",
        "https://www.kingdomofloathing.com",
    ];

    let errors = [];
    for (let baseUrl of baseUrls) {
        try {
            let page = await fetchUrl(baseUrl + path);
            if (page.match(/This script is not available unless you're logged in/)) {
                errors.push(Error("not logged in"));
            } else {
                return page;
            }
        } catch (e) {
            errors.push(e);
        }
    }

    throw Error(errors);
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
