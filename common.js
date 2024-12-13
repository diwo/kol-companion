function addWikiLinkToHeadings() {
    let pathname = new URL(document.URL).pathname;
    let evaluateResult = document.evaluate(
        "//table/tbody/tr[1]/td[1][@align='center']/node()[1]",document);

    let headingNodes = [];
    let headingNode = evaluateResult.iterateNext();
    while (headingNode) {
        if (headingNode.tagName == "B") {
            headingNodes.push(headingNode);
        }
        headingNode = evaluateResult.iterateNext();
    }

    for (let i=0; i<headingNodes.length; i++) {
        let wikiNodeId = `wiki${i}`;
        if (!document.getElementById(wikiNodeId)) {
            let wikiDiv = document.createElement("div");
            wikiDiv.innerHTML = `<a id="${wikiNodeId}" href="#" style="color: lightgrey">[wiki]</a>`;
            wikiDiv.style.display = "inline";
            wikiDiv.style.marginLeft = "5px";
            wikiDiv.style.fontSize = "0.8em";
            headingNodes[i].parentElement.appendChild(wikiDiv);

            let searchTerm = headingNodes[i].innerText;
            if (pathname == "/fight.php") {
                let monnameNode = document.getElementById("monname");
                searchTerm = monnameNode.innerText.replace(/^(a|an) /, "");
            }
            document.getElementById(wikiNodeId).addEventListener("click", () => openWiki(searchTerm));
            if (i == 0 && !isPageBindKeyBlacklisted()) {
                bindKey("w", () => openWiki(searchTerm));
            }
        }
    }
}

function isPageBindKeyBlacklisted() {
    let pathname = new URL(document.URL).pathname;
    switch (pathname) {
        case "/inventory.php":
        case "/skillz.php":
        case "/craft.php":
        case "/mall.php":
        case "/town_sellflea.php":
        case "/makeoffer.php":
            return true;
    }
    return false;
}

function addPriceToAdventureRewardItems() {
    let itemIds = [];

    let match;
    do {
        let evaluateResult = document.evaluate('//table[@class="item"]', document);
        match = evaluateResult.iterateNext();
        while (match) {
            let itemId = new URLSearchParams(match.getAttribute("rel")).get("id");
            let nodeId = `item${itemId}`;
            if (!document.getElementById(nodeId)) {
                match.id = nodeId;
                itemIds.push(itemId);
                break;
            }
            match = evaluateResult.iterateNext();
        }
    } while (match);

    for (let itemId of itemIds) {
        let priceNodeId = `price${itemId}`;
        if (!document.getElementById(priceNodeId)) {
            let itemNode = document.getElementById(`item${itemId}`);
            let textNode = document.evaluate('.//td[@class="effect"]', itemNode).iterateNext();

            let nameNode = textNode.lastChild;
            nameNode.id = `itemname${itemId}`;

            let priceNode = document.createElement("span");
            priceNode.id = priceNodeId;
            priceNode.innerHTML = "(?)";
            priceNode.style.fontSize = "0.8em";
            textNode.appendChild(priceNode);
        }
    }

    redrawAdventureRewardPrices(itemIds, {cachedOnly: true}).then(() =>
        redrawAdventureRewardPrices(itemIds, {cachedOnly: false}));

    let priceUpdateListener = browser.runtime.connect({name: "priceUpdateListener"});
    priceUpdateListener.onMessage.addListener(message => redrawAdventureRewardPrices(message.itemIds));
}

async function redrawAdventureRewardPrices(itemIds, {cachedOnly} = {}) {
    return redrawPrices(itemIds, {cachedOnly},
        (itemId, tradable, average, volume, color) => {
            let itemNameNode = document.getElementById(`itemname${itemId}`);
            if (itemNameNode) {
                itemNameNode.style.color = color;
            }

            let priceNode = document.getElementById(`price${itemId}`);
            if (priceNode) {
                priceNode.innerHTML = tradable ?
                    ` (${average.toLocaleString()} x ${volume.toLocaleString()})` : "";
            }
        });
}

function bindKey(keys, action) {
    let keysMap = {};
    if (Array.isArray(keys)) {
        for (let key of keys) {
            keysMap[key] = true;
        }
    } else {
        keysMap[keys] = true;
    }

    window.addEventListener("keydown", event => {
        if (keysMap[event.key]) {
            action();
        }
    });
}

function clickButton(textPattern) {
    return _click("//input[@class='button']", elem => elem.value, textPattern);
}

function clickLink(textPattern) {
    return _click("//a", elem => elem.innerText, textPattern);
}

function _click(xpath, extractText, textPattern) {
    let mainDoc = getPane("mainpane").document;
    let elems = mainDoc.evaluate(xpath, mainDoc);
    let elem = elems.iterateNext();
    while (elem) {
        if (isVisible(elem) && extractText(elem).match(textPattern)) {
            console.log(`Clicking ${textPattern}`);
            elem.click();
            return true;
        }
        elem = elems.iterateNext();
    }
    return false;
}

function select(selectName, optionTextPattern) {
    let mainDoc = getPane("mainpane").document;
    let selectElem = mainDoc.evaluate(`//select[@name='${selectName}']`, mainDoc).iterateNext();
    if (selectElem && isVisible(selectElem)) {
        for (let option of selectElem.options) {
            if (option.innerText.match(optionTextPattern)) {
                console.log(`Selecting ${selectName} option: ${optionTextPattern}`);
                selectElem.value = option.value;
                return true;
            }
        }
    }
    return false;
}

async function redrawPrices(itemIds, {cachedOnly}, redrawFunc, errorFunc) {
    for (let itemId of itemIds) {
        let priceData = await getPrice(itemId, {cachedOnly});
        if (priceData) {
            let error = !!priceData.data?.error;
            if (error) {
                if (errorFunc) errorFunc(itemId);
                continue;
            }

            let tradable = !priceData.untradable;
            let average = priceData.data?.average || 0;
            let volume = priceData.data?.volume || 0;
            let color = getPriceColor(tradable, average, volume);

            redrawFunc(itemId, tradable, average, volume, color);
        }
    }
}

function openUrl(url) {
    window.open(url, "_blank");
}

function openWiki(searchTerm) {
    const wikiSearchPrefix = "https://kol.coldfront.net/thekolwiki/index.php?search=";
    let url = wikiSearchPrefix + encodeURI(searchTerm);
    open(url);
}

function openMall(searchTerm) {
    // https://www.kingdomofloathing.com/mall.php?pudnuggler=one-day+ticket+to+Spring+Break+Beach
}

function openPriceCheck(itemId) {
    open(`https://api.aventuristo.net/itemgraph?itemid=${itemId}&timespan=2`);
}

async function getPrice(itemId, {cachedOnly} = {}) {
    if (cachedOnly) {
        await queuePriceCheck(itemId);
        return getCachedPrice(itemId);
    }

    return browser.runtime.sendMessage({operation: "fetchPrice", itemId});
}

async function queuePriceCheck(itemId) {
    return browser.runtime.sendMessage({operation: "queuePriceCheck", itemId});
}

async function getCachedPrice(itemId) {
    let cacheKey = getCachedPriceKey(itemId);
    let cacheFetch = await browser.storage.local.get(cacheKey);
    return cacheFetch[cacheKey];
}

function getCachedPriceKey(itemId) {
    return `item_price_${itemId}`;
}

function getPriceColor(tradable, price, volume) {
    if (!tradable) {
        return "darkblue";
    }
    if (price >= 1_000_000) {
        return "red";
    } else if (price >= 100_000) {
        return "orange";
    } else if (price >= 10_000) {
        return "dodgerblue";
    } else if (price >= 1000 || (price >= 300 && volume >= 1000)) {
        return "green";
    }
    return "black";
}

function parseFormattedInt(str) {
    return parseInt(str.replace(/,/g, ""));
}

function getPane(name, {id, returnFrame} = {}) {
    let topDoc = window.top.document;
    let frame = topDoc.evaluate(`//frame[@name='${name}']`, topDoc).iterateNext();
    if (returnFrame) return frame;
    let win = frame.contentWindow;
    return id ? win.document.getElementById(id) : win;
}

function isVisible(elem) {
    return elem.checkVisibility({visibilityProperty: true});
}

function getTurns() {
    let charDoc = getPane("charpane").document;
    let hourglass = charDoc.evaluate("//img[@title='Adventures Remaining']", charDoc).iterateNext();
    return parseInt(hourglass.parentNode.nextSibling.firstChild.innerText);
}

function getMp() {
    let mpText = getMpTextNode().innerText;
    let match = mpText.match(/(\d+)\s\/\s(\d+)/);
    let current = parseInt(match[1]);
    let total = parseInt(match[2]);
    let ratio = current / total;
    return { current, total, ratio };
}

function getMpTextNode() {
    let charDoc = getPane("charpane").document;
    let mpIcon = charDoc.evaluate("//img[@title='Mojo Points' or @title='Mana Points' or @title='Muscularity Points']", charDoc).iterateNext();
    return mpIcon.parentNode.nextSibling.firstChild;
}

function isMpAlmostFull() {
    return getMp().ratio >= 0.85;
}

async function sendCommand(command) {
    if (!command.startsWith("/")) {
        command = "/" + command;
    }

    let chatDoc = getPane("chatpane").document;
    let enterChat = chatDoc.evaluate("//a[@href='mchat.php']/b[text()='Enter the Chat']", chatDoc).iterateNext();
    if (enterChat) {
        enterChat.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        chatDoc = getPane("chatpane").document;
    }

    let inputForm = chatDoc.getElementById("InputForm");
    chatDoc.evaluate(".//input[@name='graf']", inputForm).iterateNext().value = command;
    chatDoc.evaluate(".//input[@type='submit']", inputForm).iterateNext().click();
}