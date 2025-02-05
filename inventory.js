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

    let itemUpdateListener = browser.runtime.connect({name: "itemUpdateListener"});
    itemUpdateListener.onMessage.addListener(message => redrawInventoryPrices(message.itemIds));

    fetchMissingPrices(itemIds);
    itemIds.forEach(queuePriceCheck);
    queueAllInventoryItemDescriptionFetch();

    let observer = new MutationObserver(() => scanToolTips());
    observer.observe(document.body, {childList: true, subtree: true});

    bindInventoryFilterEvents();
    addInventoryFilterPresets();
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

function queueAllInventoryItemDescriptionFetch() {
    for (let node of iterateInventoryNodeTree()) {
        let itemId = node.itemId;
        let itemDescId = getItemDescIdFromItemNode(node.element);
        queueItemDescriptionFetch(itemId, itemDescId);
    }
}

async function scanToolTips() {
    let tooltipNode = document.evaluate('//div[@role="tooltip"]', document).iterateNext();

    if (tooltipNode) {
        let itemId = tooltipNode.innerHTML.match(/<!-- itemid: (\d+) -->/)?.[1];
        if (itemId) {
            let name = document.evaluate(".//div[@id='description']/center/b", tooltipNode).iterateNext()?.innerText;
            let description = document.evaluate(".//blockquote", tooltipNode).iterateNext()?.innerText;
            await browser.runtime.sendMessage({operation: "setItemData", itemId, name, description});
        }
    }
}

async function sortInventory() {
    return Promise.all(getInventoryNodeTree().map(sortStuffbox));
}

async function sortStuffbox(stuffbox) {
    let nodes = Array.from(iterateStuffboxNodes(stuffbox));
    let itemIds = nodes.map(node => node.itemId);
    let allItemPrices = await Promise.all(itemIds.map(itemId => getPrice(itemId, {cachedOnly: true})));
    let allItemData = await Promise.all(itemIds.map(getItemData));
    let itemPriceMap = Object.fromEntries(itemIds.map((id, i) => [id, allItemPrices[i]]));
    let itemDataMap = Object.fromEntries(itemIds.map((id, i) => [id, allItemData[i]]));

    // Reversed display order, items are popped as a stack
    nodes.sort((a, b) => {
        let priceA = itemPriceMap[a.itemId];
        let priceB = itemPriceMap[b.itemId];
        let flagsA = itemDataMap[a.itemId]?.flags;
        let flagsB = itemDataMap[b.itemId]?.flags;

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

    nodes.forEach(node => node.element.parentElement.removeChild(node.element));

    if (stuffbox.rows.length) {
        let row = stuffbox.rows[0].element;
        while (nodes.length) {
            row.appendChild(nodes.pop().element);
            if (row.childNodes.length >= 3) {
                row = row.nextSibling;
            }
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
                $('#filter').keyup(function (e) { // manually triggered by page script
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
    let inventory = getInventoryNodeTree();
    let itemDataMap = await getInventoryItemDataMap(inventory);

    ftextNode.style.minWidth = getComputedStyle(ftextNode).width;
    ftextNode.style.width = null;
    resizeInventoryFtextNode();

    let itemUpdateListener = browser.runtime.connect({name: "itemUpdateListener"});
    itemUpdateListener.onMessage.addListener(async () => itemDataMap = await refreshItemDataMap());

    document.addEventListener("keypress", e => {
        if (!e.key.match(/^[a-z0-9'" .\-:!,+*?^$|(){}\[\]\\]$/i)) return;
        if (document.activeElement.tagName != "INPUT" || document.activeElement.type != "text") {
            ftextNode.value += e.key;
            filterNode.dispatchEvent(new CustomEvent("ftext-change", {detail: {text: ftextNode.value}}));
            e.preventDefault();
        }
    });

    filterNode.addEventListener("ftext-change", e => {
        filterInventory(e.detail.text, {inventory, itemDataMap});
        resizeInventoryFtextNode();
    });
}

function resizeInventoryFtextNode() {
    let ftextNode = document.getElementById("ftext");

    let hidden = document.createElement("span");
    hidden.style.position = "absolute";
    hidden.style.height = 0;
    hidden.style.overflow = "hidden";
    hidden.style.font = getComputedStyle(ftextNode).font;
    hidden.textContent = ftextNode.value;

    ftextNode.parentNode.insertBefore(hidden, ftextNode);
    ftextNode.style.width = (hidden.offsetWidth + 10) + "px";
    hidden.remove();
}

async function getInventoryItemDataMap(inventory) {
    if (!inventory) inventory = getInventoryNodeTree();
    let itemIds = Array.from(iterateInventoryNodeTree(inventory), node => node.itemId);
    let allItemData = await Promise.all(itemIds.map(getItemData));
    return Object.fromEntries(itemIds.map((id, i) => [id, allItemData[i]]));
}

async function filterInventory(pattern, {inventory, itemDataMap} = {}) {
    if (!inventory) inventory = getInventoryNodeTree();
    if (!itemDataMap) itemDataMap = await getInventoryItemDataMap(inventory);

    let regex = new RegExp(pattern, "i");
    let show = node => node.classList.remove("filtered");
    let hide = node => node.classList.add("filtered");

    for (let stuffbox of inventory) {
        if (stuffbox.element.id == "curequip") continue;
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
}

function getInventoryNodeTree() {
    let root = [];
    for (let stuffbox of document.getElementsByClassName("stuffbox")) {
        let rowNodes = evaluateToNodesArray(".//table[@class='guts']/tbody/tr", {contextNode: stuffbox});
        let rows = rowNodes.map(rowNode => {
            let colNodes = evaluateToNodesArray("./td", {contextNode: rowNode});
            let columns = colNodes.map(colNode => {
                let itemId = getItemIdFromItemNode(colNode.firstChild);
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
    for (let stuffbox of tree) {
        yield* iterateStuffboxNodes(stuffbox);
    }
}

function* iterateStuffboxNodes(stuffbox) {
    for (let row of stuffbox.rows) {
        for (let col of row.columns) {
            yield col;
        }
    }
}

function addInventoryFilterPresets() {
    let filterNode = document.getElementById("filter");

    const allFilters = {
        "-Combat": "less attract",
        "+Combat": "more attract",
        "Item": "\\+.*item drop",
        "Meat": "\\+.*meat",
        "+ML": "\\+.*monster level",
        "-ML": "-.*monster level",
        "Init": "combat init.*\\+|\\+.*combat init",
        "Fam": "\\+.*familiar weight",
        "Heal": {
            "HP": "(heal|restore).*(hp|hit point)",
            "MP": "restore.*mp",
        },
        "Regen": {
            "HP": "regen.*hp",
            "MP": "regen.*mp",
        },
        "Stats": {
            "HP": "max.*hp.*\\+",
            "MP": "max.*mp.*\\+",
            "Mus": "muscle.*\\+",
            "Mus%": "muscle.*\\+.*%",
            "Mox": "moxie.*\\+",
            "Mox%": "moxie.*\\+.*%",
            "Mys": "mystic.*\\+",
            "Mys%": "mystic.*\\+.*%",
        },
        "Res": {
            "All": "resist.*all elem",
            "Hot": "hot resist|resist.*all elem",
            "Cold": "cold resist|resist.*all elem",
            "Stench": "stench resist|resist.*all elem",
            "Spooky": "spooky resist|resist.*all elem",
            "Sleaze": "sleaze resist|resist.*all elem",
        },
        "Elem": {
            "Hot": "hot (damage|spell)",
            "Cold": "cold (damage|spell)",
            "Stench": "stench (damage|spell)",
            "Spooky": "spooky (damage|spell)",
            "Sleaze": "sleaze (damage|spell)",
        },
        "Spell%": "spell.*\\+.*%",
        "Adv": "adv.*per day",
    };

    let div = document.createElement("div");
    div.style.fontSize = "0.7em";

    let allHideGroup = [];
    const hideAllGroups = () => allHideGroup.forEach(fn => fn());

    const toNodes = (filters, onFilterClick) => {
        let nodes = [];
        for (let [key, val] of Object.entries(filters)) {
            if (nodes.length) {
                let separator = document.createElement("span");
                separator.innerText = "|";
                separator.style.margin = "0 2px";
                nodes.push(separator);
            }

            if (typeof val == "object") {
                let group = document.createElement("span");
                group.style.display = "none";

                let heading = document.createElement("a");
                heading.innerText = `[${key}]`;
                heading.href = "#";

                let showGroup = _ => {
                    group.style.display = "inline";
                    heading.innerText = `{${key}:`;
                    heading.style.fontWeight = "bold";
                    heading.style.textDecoration = "none";
                    heading.style.marginRight = "2px";
                };
                let hideGroup = _ => {
                    group.style.display = "none";
                    heading.innerText = `[${key}]`;
                    heading.style.fontWeight = "normal";
                    heading.style.textDecoration = null;
                    heading.style.marginRight = null;
                };
                allHideGroup.push(hideGroup);

                heading.onclick = e => {
                    e.preventDefault();
                    let wasHidden = group.style.display == "none";
                    hideAllGroups();
                    if (wasHidden) showGroup();
                };

                toNodes(val, showGroup).forEach(n => group.append(n));
                let closeBrace = document.createElement("span");
                closeBrace.innerText = "}";
                closeBrace.style.fontWeight = "bold";
                group.append(closeBrace);

                nodes.push(heading);
                nodes.push(group);
            } else {
                let anchor = document.createElement("a");
                anchor.innerText = key;
                anchor.href = "#";
                anchor.onclick = e => {
                    e.preventDefault();
                    let ftextNode = document.getElementById("ftext");
                    ftextNode.value = val;
                    filterNode.dispatchEvent(new CustomEvent("ftext-change", {detail: {text: val}}));
                    hideAllGroups();
                    if (onFilterClick) onFilterClick();
                };
                nodes.push(anchor);
            }
        }
        return nodes;
    };

    toNodes(allFilters).forEach(n => div.append(n));
    filterNode.parentElement.append(div);
}