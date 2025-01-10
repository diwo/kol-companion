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
        (itemId, tradable, average, volume, color) => {
            let itemNameNode = document.getElementById(`i${itemId}`).firstChild;
            itemNameNode.style.color = color;

            let priceNode = document.getElementById(`price${itemId}`);
            priceNode.innerHTML = tradable ? `(${average.toLocaleString()} x ${volume.toLocaleString()})` : "";
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
            let untradable =
                tooltipNode.innerHTML.match(/Cannot be traded/) ||
                tooltipNode.innerHTML.match(/Gift Item/);
            if (untradable) {
                await browser.runtime.sendMessage({operation: "setUntradable", itemId});
            }
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
    let itemPrices = await Promise.all(itemIds.map(itemId => getPrice(itemId, {cachedOnly: true})));
    let itemPriceMap = {};
    for (let i=0; i<itemIds.length; i++) {
        let itemId = itemIds[i];
        let itemPrice = itemPrices[i] || {};
        itemPriceMap[itemId] = itemPrice;
    }

    items.sort((a, b) => {
        let priceA = itemPriceMap[getItemId(a)];
        let priceB = itemPriceMap[getItemId(b)];
        if (priceA.untradable && priceB.untradable) return 0;
        if (priceA.untradable) return -1;
        if (priceB.untradable) return 1;
        return (priceA.data?.average ?? 0) - (priceB.data?.average ?? 0);
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