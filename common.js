async function registerCommandReceiver() {
    if (URL.parse(window.top.document.URL).pathname != "/game.php") {
        return;
    }

    let selfId = null;
    let registerWindow = async () => selfId = await browser.runtime.sendMessage({operation: "registerWindow"});
    if (document.hasFocus()) registerWindow();
    window.addEventListener("focus", () => document.hasFocus() && registerWindow());

    let commandListener = browser.runtime.connect({name: "commandListener"});
    commandListener.onMessage.addListener(message => {
        if (message.windowId != selfId) return;
        if (message.command == "gotoUrl") {
            getPane("mainpane").location = message.url;
        } else if (message.command == "chooseIcon") {
            let editForm = getPane("menupane", {id: "edit"});
            if (editForm) {
                let imgElem = editForm.ownerDocument.evaluate(".//img", editForm).iterateNext();
                imgElem.src = `https://d2uyhvukfffg5a.cloudfront.net/itemimages/${message.iconName}.gif`;
                editForm.icon.value = message.iconName;
            }
        }
    });
}

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
            if (searchTerm.endsWith(":")) {
                searchTerm = searchTerm.replace(/:$/, "");
            }
            if (searchTerm.match(/Adventure Results/)) {
                let sectionBody = headingNodes[i].parentElement.parentElement.nextSibling;
                searchTerm = sectionBody.innerText.split('\n')[0];
            }
            if (pathname == "/fight.php") {
                searchTerm = getEnemyName();
            }
            document.getElementById(wikiNodeId).addEventListener("click", () => openWiki(searchTerm));
        }
    }
}

function getEnemyName() {
    let monnameNode = getPane("mainpane", {id: "monname"});
    return monnameNode.innerText.replace(/^(a|an) /, "");
}

function addPriceToAdventureRewardItems() {
    let itemContainers = [];
    let itemIds = new Set();

    const getItemIdFromContainer = itemContainer => new URLSearchParams(itemContainer.getAttribute("rel")).get("id");
    const getItemNameClass = itemId => `itemName${itemId}`;
    const getItemPriceClass = itemId => `itemPrice${itemId}`;

    let evaluateResult = document.evaluate('//table[@class="item"]', document);
    let itemContainer = evaluateResult.iterateNext();
    while (itemContainer) {
        itemIds.add(getItemIdFromContainer(itemContainer));
        itemContainers.push(itemContainer);
        itemContainer = evaluateResult.iterateNext();
    }

    for (let itemContainer of itemContainers) {
        let itemId = getItemIdFromContainer(itemContainer);
        let textNode = document.evaluate('.//td[@class="effect"]', itemContainer).iterateNext();

        let nameNode = document.evaluate('./b', textNode).iterateNext();
        nameNode.classList.add(getItemNameClass(itemId));

        let itemPriceClass = getItemPriceClass(itemId);
        let priceNode = document.evaluate(`./span[@class="${itemPriceClass}"]`, textNode).iterateNext();
        if (!priceNode) {
            priceNode = document.createElement("span");
            priceNode.className = itemPriceClass;
            priceNode.innerHTML = "(?)";
            priceNode.style.fontSize = "0.8em";
            priceNode.style.paddingLeft = "3px";
            textNode.appendChild(priceNode);
        }
    }

    redrawAdventureRewardPrices(itemIds.keys(), {cachedOnly: true}).then(() =>
        redrawAdventureRewardPrices(itemIds.keys(), {cachedOnly: false}));

    let priceUpdateListener = browser.runtime.connect({name: "priceUpdateListener"});
    priceUpdateListener.onMessage.addListener(message => redrawAdventureRewardPrices(message.itemIds));
}

async function redrawAdventureRewardPrices(itemIds, {cachedOnly} = {}) {
    return redrawPrices(itemIds, {cachedOnly},
        (itemId, tradable, average, volume, color) => {
            let itemNameNodes = document.getElementsByClassName(`itemName${itemId}`);
            for (let itemNameNode of itemNameNodes) {
                itemNameNode.style.color = color;
            }

            let priceNodes = document.getElementsByClassName(`itemPrice${itemId}`);
            for (let priceNode of priceNodes) {
                priceNode.innerHTML = tradable ? `(${average.toLocaleString()} x ${volume.toLocaleString()})` : "";
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

async function searchMall(searchTerm, {exactMatch} = {}) {
    if (exactMatch) searchTerm = `"${searchTerm}"`;
    let searchParams = new URLSearchParams();
    searchParams.set("pudnuggler", searchTerm);
    let url = `https://www.kingdomofloathing.com/mall.php?${searchParams.toString()}`;
    return browser.runtime.sendMessage({operation: "gotoUrl", url});
}

async function searchInventory(searchTerm) {
    let searchTermStripped = searchTerm.replace(/[^\x00-\x7F]+/g, "*").replace(/"/g, "*");
    let searchParams = new URLSearchParams();
    searchParams.set("ftext", searchTermStripped);
    let url = `https://www.kingdomofloathing.com/inventory.php?${searchParams.toString()}`;
    return browser.runtime.sendMessage({operation: "gotoUrl", url});
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

function getHp() {
    return parseHpMpText(getHpTextNode().innerText);
}

function getMp() {
    return parseHpMpText(getMpTextNode().innerText);
}

function getHpTextNode() {
    let charDoc = getPane("charpane").document;
    let hpIcon = charDoc.evaluate("//img[@title='Hit Points']", charDoc).iterateNext();
    return hpIcon.parentNode.nextSibling.firstChild;
}

function getMpTextNode() {
    let charDoc = getPane("charpane").document;
    let mpIcon = charDoc.evaluate("//img[@title='Mojo Points' or @title='Mana Points' or @title='Muscularity Points']", charDoc).iterateNext();
    return mpIcon.parentNode.nextSibling.firstChild;
}

function parseHpMpText(text) {
    let match = text.match(/(\d+)\s\/\s(\d+)/);
    let current = parseInt(match[1]);
    let total = parseInt(match[2]);
    let ratio = current / total;
    return { current, total, ratio };
}

function isHpLow() {
    return getHp().ratio <= 0.35;
}

function isMpAlmostFull() {
    return getMp().ratio >= 0.85;
}

function isMpLow() {
    return getMp().ratio <= 0.15;
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