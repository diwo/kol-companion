async function clearCache(keyMatcher, valMatcher) {
    let cacheFetch = await browser.storage.local.get(null);
    let keysToRemove = {};
    for (let key of Object.keys(cacheFetch)) {
        if (!keyMatcher || keyMatcher(key)) {
            let val = cacheFetch[key];
            if (!valMatcher || valMatcher(val)) {
                keysToRemove[key] = val;
            }
        }
    }
    await browser.storage.local.remove(Object.keys(keysToRemove));
    console.log(keysToRemove);
    return keysToRemove;
}

async function clearItemPriceCache(valMatcher) {
    return clearCache(key => key.startsWith("item_price_"), valMatcher);
}

async function clearItemPriceCacheErrorOrNoPrice() {
    return clearItemPriceCache(val => {
        let hasError = val.data?.error;
        let noPrice = val.data && !val.data?.average;
        return hasError || noPrice;
    });
}

async function exportItemPrice() {
    return exportStorageToClipboard(/^item_price_/);
}

async function exportItemFlags() {
    return exportStorageToClipboard(/^item_flags_/);
}

async function exportMallLinks() {
    return exportStorageToClipboard(/^mall_links$/);
}

async function exportStorageToClipboard(keyMatcher) {
    let fetched = await browser.storage.local.get(null);
    let keyVals = {};
    for (let key of Object.keys(fetched)) {
        if (key.match(keyMatcher)) {
            keyVals[key] = fetched[key];
        }
    }
    let json = JSON.stringify(keyVals);
    navigator.clipboard.writeText(json);
    console.log("Exported to clipboard");
}

async function importCacheFromBackup() {
    await importDataFile("data/item_price.json", "item price", kv => Object.keys(kv).length);
    await importDataFile("data/item_flags.json", "item flags", kv => Object.keys(kv).length);
    await importDataFile("data/mall_links.json", "mall links", kv => Object.values(kv)[0].length);
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

browser.runtime.onMessage.addListener(message => {
    switch (message.operation) {
        case "gotoUrl":
            return notifyGotoUrl(message.windowId, message.url);
        case "chooseIcon":
            return notifyChooseIcon(message.windowId, message.iconName);
        case "fetchPrice":
            return fetchPrice(message.itemId);
        case "queuePriceCheck":
            priceCheckQueue[message.itemId] = true;
            return Promise.resolve();
        case "setItemFlags":
            return setItemFlags(message.itemId, message.flags);
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

let priceUpdateListenerPorts = {};
browser.runtime.onConnect.addListener(port => {
    if (port.name == "priceUpdateListener") {
        let portId = randomId();
        priceUpdateListenerPorts[portId] = port;
        port.onDisconnect.addListener(() => {
            delete priceUpdateListenerPorts[portId];
        });
    }
});

browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name == "priceCheckQueueWorker") {
        let itemIds = Object.keys(priceCheckQueue);
        if (itemIds.length) {
            let itemId = itemIds[Math.floor(Math.random() * itemIds.length)];
            getCachedPrice(itemId).then(cached => {
                return fetchPrice(itemId).then(fetched => {
                    delete priceCheckQueue[itemId];
                    let delayInMinutes;
                    if (fetched.timestamp == cached?.timestamp) {
                        delayInMinutes = 0;
                    } else {
                        delayInMinutes = 5/60;
                    }
                    if (delayInMinutes) {
                        console.log(`Next alarm in ${Math.floor(delayInMinutes*60)}s fetched=`, fetched);
                    }
                    browser.alarms.create("priceCheckQueueWorker", {delayInMinutes});
                });
            });
        } else {
            browser.alarms.create("priceCheckQueueWorker", {delayInMinutes: 5/60});
        }
    }
});
browser.alarms.create("priceCheckQueueWorker", {delayInMinutes: 5/60});

let fetchingItemIds = new Set();
async function fetchPrice(itemId) {
    const oneWeekTimespan = 2;
    const lifetimeTimespan = 4;

    let cacheVal = await getCachedPrice(itemId);
    if (cacheVal && (cacheVal.untradable || Date.now() - cacheVal.timestamp < 6*60*60*1000)) {
        return cacheVal;
    }

    if (fetchingItemIds.has(itemId)) {
        while (fetchingItemIds.has(itemId)) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        return getCachedPrice(itemId);
    }
    fetchingItemIds.add(itemId);

    console.log(`Fetching price for itemId=${itemId}`);
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
    notifyPriceUpdated([itemId]);

    return fetched;
}

function getPriceCheckLink(itemId, timespan) {
    return `https://kol.coldfront.net/newmarket/itemgraph.php?itemid=${itemId}&timespan=${timespan}`;
}

async function fetchPriceNoCache(url) {
    let response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    let page = await response.text();
    let data = parsePrice(page);
    let timestamp = Date.now();
    return {timestamp, data};
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

async function setItemFlags(itemId, flags) {
    let itemFlagsKey = getItemFlagsKey(itemId);
    await browser.storage.local.set({[itemFlagsKey]: flags});

    if (!isItemFlagsTradable(flags)) {
        let itemPriceKey = getItemPriceKey(itemId);
        await browser.storage.local.set({[itemPriceKey]: {untradable: true}});
    }

    notifyPriceUpdated([itemId]);
}

function notifyPriceUpdated(itemIds) {
    for (let port of Object.values(priceUpdateListenerPorts)) {
        port.postMessage({event: "priceUpdated", itemIds});
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
