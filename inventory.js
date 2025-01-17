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
    let itemUpdateListener = browser.runtime.connect({name: "itemUpdateListener"});
    itemUpdateListener.onMessage.addListener(message => redrawInventoryPrices(message.itemIds));

    let observer = new MutationObserver(() => scanToolTips());
    observer.observe(document.body, {childList: true, subtree: true});

    bindInventoryFilterEvents();
}

function redrawInventoryPrices(itemIds) {
    let relevantItemIds = itemIds.filter(itemId => document.getElementById(`i${itemId}`));

    return redrawPrices(relevantItemIds, {cachedOnly: true},
        (itemId, flags, average, volume, color, fontStyle) => {
            let itemNameNode = document.getElementById(`i${itemId}`).firstChild;
            itemNameNode.style.color = color;
            itemNameNode.style.fontStyle = fontStyle;

            let priceNode = document.getElementById(`price${itemId}`);
            if (isTradableItemFlags(flags)) {
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
            let description = document.evaluate(".//blockquote", tooltipNode).iterateNext().innerText;
            await browser.runtime.sendMessage({operation: "setItemDescription", itemId, description});
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

    let itemIds = items.map(getItemIdFromInventoryNode);
    let allItemPrices = await Promise.all(itemIds.map(itemId => getPrice(itemId, {cachedOnly: true})));
    let allItemData = await Promise.all(itemIds.map(getItemData));
    let itemPriceMap = Object.fromEntries(itemIds.map((id, i) => [id, allItemPrices[i]]));
    let itemDataMap = Object.fromEntries(itemIds.map((id, i) => [id, allItemData[i]]));

    // Reversed display order, items are popped as a stack
    items.sort((a, b) => {
        let itemIdA = getItemIdFromInventoryNode(a);
        let itemIdB = getItemIdFromInventoryNode(b);
        let priceA = itemPriceMap[itemIdA];
        let priceB = itemPriceMap[itemIdB];
        let flagsA = itemDataMap[itemIdA]?.flags;
        let flagsB = itemDataMap[itemIdB]?.flags;

        if (!priceA?.untradable && !priceB?.untradable) {
            return (priceA?.data?.average ?? 0) - (priceB?.data?.average ?? 0);
        }
        if (!priceA?.untradable) return 1;
        if (!priceB?.untradable) return -1;

        if (flagsA?.quest && flagsB?.quest) return 0;
        if (flagsA?.quest) return 1;
        if (flagsB?.quest) return -1;

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

async function bindInventoryFilterEvents() {
    if (!document.getElementById("unbind-key-events")) {
        let script = document.createElement("script");
        script.id = "unbind-key-events";
        script.text = `
            jQuery(function($) {
                //$(document).unbind('keyup');
                $(document).unbind('keypress');
                $('#filter').unbind('keyup');
                $('#filter').keyup(function (e) {
                    let text = $(this).find('[name="ftext"]').val() || '';
                    let ftextChange = new CustomEvent('ftext-change', {detail: {text}});
                    document.getElementById('filter').dispatchEvent(ftextChange);
                });
            });
        `;
        document.head.appendChild(script);
    }

    let filterNode = document.getElementById("filter");
    let ftextNode = document.getElementById("ftext");

    document.addEventListener("keypress", e => {
        if (!e.key.match(/^[a-z0-9'" .\-:!,+*?^$|(){}\[\]\\]$/i)) return;
        if (document.activeElement != ftextNode) {
            ftextNode.value += e.key;
            filterNode.dispatchEvent(
                new CustomEvent("ftext-change", {detail: {text: ftextNode.value}}));
            e.preventDefault();
        }
    });

    let inventory = getInventoryNodeTree();
    let itemDataMap;
    let refreshItemDataMap = async () => {
        let itemIds = Array.from(iterateInventoryNodeTree(inventory), node => node.itemId);
        let allItemData = await Promise.all(itemIds.map(getItemData));
        itemDataMap = Object.fromEntries(itemIds.map((id, i) => [id, allItemData[i]]));
    };
    await refreshItemDataMap();
    let itemUpdateListener = browser.runtime.connect({name: "itemUpdateListener"});
    itemUpdateListener.onMessage.addListener(refreshItemDataMap);

    filterNode.addEventListener("ftext-change", e => {
        let pattern = e.detail.text;
        let regex = new RegExp(pattern, "i");
        let show = node => node.classList.remove("filtered");
        let hide = node => node.classList.add("filtered");

        for (let stuffbox of inventory) {
            let showBox = false;
            for (let row of stuffbox.rows) {
                let showRow = false;
                for (let col of row.columns) {
                    let description = itemDataMap[col.itemId]?.description || "";
                    let showCol = !pattern.length || col.itemName.match(regex) || description.match(regex);
                    showCol ? show(col.element) : hide(col.element);
                    if (showCol) showRow = true;
                }
                showRow ? show(row.element) : hide(row.element);
                if (showRow) showBox = true;
            }
            showBox ? show(stuffbox.element) : hide(stuffbox.element);
        }
    });
}

function getInventoryNodeTree() {
    let root = [];
    for (let stuffbox of document.getElementsByClassName("stuffbox")) {
        let rowNodes = evaluateToNodesArray(".//table[@class='guts']/tbody/tr", {contextNode: stuffbox});
        let rows = rowNodes.map(rowNode => {
            let colNodes = evaluateToNodesArray("./td", {contextNode: rowNode});
            let columns = colNodes.map(colNode => {
                let itemId = getItemIdFromInventoryNode(colNode);
                let itemName = document.evaluate(".//b[@rel]", colNode).iterateNext()?.textContent;
                return { element: colNode, itemId, itemName };
            });
            return { element: rowNode, columns };
        });
        root.push({ element: stuffbox, rows });
    }
    return root;
}

function* iterateInventoryNodeTree(tree) {
    if (!tree) tree = getInventoryNodeTree();
    for (let box of tree) {
        for (let row of box.rows) {
            for (let col of row.columns) {
                yield col;
            }
        }
    }
}

function getItemIdFromInventoryNode(itemNode) {
    return parseInt(new URLSearchParams(itemNode.firstChild.getAttribute("rel")).get("id"));
}