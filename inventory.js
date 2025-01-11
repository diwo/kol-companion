async function handleInventoryPage() {
    let evaluateResult = document.evaluate('//table[@class="item"]', document);
    let itemIds = [];
    let it = evaluateResult.iterateNext();
    while (it) {
        let itemId = it.id.replace(/[^0-9]*/g, "");
        itemIds.push(itemId);
        it = evaluateResult.iterateNext();
    }
    for (let itemId of itemIds) {
        let priceNodeId = `price${itemId}`;
        if (!document.getElementById(priceNodeId)) {
            let textContainerNode = document.getElementById(`i${itemId}`);
            textContainerNode.firstChild.style.color = "grey";

            let bottomTextContainerNode = textContainerNode.lastChild;
            let priceNode = document.createElement("span");
            priceNode.id = priceNodeId;
            priceNode.innerHTML = "(?)";
            bottomTextContainerNode.insertBefore(priceNode, bottomTextContainerNode.firstChild?.nextSibling);
            if (priceNode.nextSibling) {
                bottomTextContainerNode.insertBefore(document.createTextNode(" "), priceNode.nextSibling);
            }
        }
    }

    await sortInventory();
    redrawInventoryPrices(itemIds);
    fetchMissingPrices(itemIds);
    itemIds.forEach(queuePriceCheck);
    let priceUpdateListener = browser.runtime.connect({name: "priceUpdateListener"});
    priceUpdateListener.onMessage.addListener(message => redrawInventoryPrices(message.itemIds));

    let observer = new MutationObserver(() => scanToolTips());
    observer.observe(document.body, {childList: true, subtree: true});
}

function redrawInventoryPrices(itemIds) {
    let relevantItemIds = itemIds.filter(itemId => document.getElementById(`i${itemId}`));

    return redrawPrices(relevantItemIds, {cachedOnly: true},
        (itemId, flags, average, volume, color, fontStyle) => {
            let itemNameNode = document.getElementById(`i${itemId}`).firstChild;
            itemNameNode.style.color = color;
            itemNameNode.style.fontStyle = fontStyle;

            let priceNode = document.getElementById(`price${itemId}`);
            if (isItemFlagsTradable(flags)) {
                priceNode.innerHTML = `(${average.toLocaleString()} x ${volume.toLocaleString()})`;
            } else {
                priceNode.innerHTML = "";
            }
        });
}

async function fetchMissingPrices(itemIds) {
    let missingPrices = [];
    for (let itemId of itemIds) {
        let cachedPrice = await getCachedPrice(itemId);
        if (!cachedPrice) {
            missingPrices.push(itemId);
        }
    }
    await Promise.all(missingPrices.map(getPrice));
}

async function scanToolTips() {
    let tooltipNode = document.evaluate('//div[@role="tooltip"]', document).iterateNext();

    if (tooltipNode) {
        let itemId = tooltipNode.innerHTML.match(/<!-- itemid: (\d+) -->/)?.[1];
        if (itemId) {
            let flags = parseItemFlagsFromDescription(tooltipNode.innerHTML);
            await browser.runtime.sendMessage({operation: "setItemFlags", itemId, flags});
        }
    }
}

async function sortInventory() {
    let mainDoc = getPane("mainpane").document;
    let path = URL.parse(mainDoc.URL).pathname;
    if (path != "/inventory.php" && path != "/closet.php") {
        return;
    }
    let sections = [];
    let eval = mainDoc.evaluate("//table[@class='guts']", mainDoc);
    let section = eval.iterateNext();
    while (section) {
        sections.push(section);
        section = eval.iterateNext();
    }
    await Promise.all(sections.map(sortInventorySection));
}

async function sortInventorySection(section) {
    let row = section.firstChild.firstChild;
    let items = [];
    while (row) {
        let item = row.firstChild;
        while (item) {
            items.push(item);
            item = item.nextSibling;
        }
        row = row.nextSibling;
    }

    let getItemId = item => parseInt(new URLSearchParams(item.firstChild.getAttribute("rel")).get("id"));

    let itemIds = items.map(getItemId);
    let allItemPrices = await Promise.all(itemIds.map(itemId => getPrice(itemId, {cachedOnly: true})));
    let allItemFlags = await Promise.all(itemIds.map(getCachedItemFlags));
    let itemPriceMap = {};
    let itemFlagsMap = {};
    for (let i=0; i<itemIds.length; i++) {
        let itemId = itemIds[i];
        itemPriceMap[itemId] = allItemPrices[i] || {};
        itemFlagsMap[itemId] = allItemFlags[i] || {};
    }

    // Reversed display order, items are popped as a stack
    items.sort((a, b) => {
        let itemIdA = getItemId(a);
        let itemIdB = getItemId(b);
        let priceA = itemPriceMap[itemIdA];
        let priceB = itemPriceMap[itemIdB];
        let flagsA = itemFlagsMap[itemIdA];
        let flagsB = itemFlagsMap[itemIdB];

        if (!priceA.untradable && !priceB.untradable) {
            return (priceA.data?.average ?? 0) - (priceB.data?.average ?? 0);
        }
        if (!priceA.untradable) return 1;
        if (!priceB.untradable) return -1;

        if (flagsA.quest && flagsB.quest) return 0;
        if (flagsA.quest) return 1;
        if (flagsB.quest) return -1;

        return 0;
    });

    items.forEach(item => item.parentElement.removeChild(item));

    row = section.firstChild.firstChild;
    while (items.length) {
        row.appendChild(items.pop());
        if (row.childNodes.length >= 3) {
            row = row.nextSibling;
        }
    }
}