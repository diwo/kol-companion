async function handleDescriptionPage() {
    if (window.opener) {
        moveWindow();
        setWindowId(getWindowId(window.opener.top));
    }

    let thingNameNode = getDescriptionNameNode();
    let thingName = thingNameNode.innerText;
    let pathname = getPathName();
    if (pathname == "/desc_guardian.php") {
        thingName = thingNameNode.parentNode.innerText.match(/level \d+ (.*)/)[1];
    }

    let koliteminfo = document.createElement("div");
    koliteminfo.id = "koliteminfo";
    koliteminfo.style.position = "absolute";
    koliteminfo.style.top = "2px";
    koliteminfo.style.left = "2px";
    koliteminfo.style.fontSize = "0.8em";

    let itemId = null;
    if (pathname == "/desc_item.php") {
        itemId = document.body.innerHTML.match(/<!-- itemid: (\d+) -->/)?.[1];
        let itemIdDiv = addDiv(koliteminfo, `ID: ${itemId} `);
        itemIdDiv.style.display = 'inline';
    }

    if (pathname == "/desc_effect.php") {
        let effectId = document.body.innerHTML.match(/<!-- effectid: (\d+) -->/)?.[1];
        if (effectId) {
            let descNode = document.getElementById("description");
            let description = evaluateToNodesArray(".//blockquote", {contextNode: descNode})[0]?.innerText;
            let modifierText = evaluateToNodesArray(".//blockquote/following-sibling::center/font[@color='blue']/b", {contextNode: descNode})[0]?.innerText;
            await browser.runtime.sendMessage({operation: "setEffectData", effectId, name: thingName, description, modifierText});
        }
    }

    let wikiDiv = addDiv(koliteminfo, '[<a id="wiki" href="#">Wiki</a>]');
    wikiDiv.style.display = 'inline';

    if (itemId) {
        addDiv(koliteminfo, '[<a id="searchinv" href="#">Inv</a>]', style => style.display = "inline");

        let description =  document.evaluate(".//blockquote", document).iterateNext()?.innerText;
        await browser.runtime.sendMessage({operation: "setItemData", itemId, name: thingName, description});

        let flags = parseItemFlagsFromDescription(description);
        if (isTradableItemFlags(flags)) {
            addDiv(koliteminfo, '[<a id="searchmall" href="#">Mall</a>]', style => style.display = "inline");
            addDiv(koliteminfo, '[<a id="pricecheck" href="#">PC</a>]', style => style.display = "inline");
            addDiv(koliteminfo, 'Average: <span id="market-average"><i>loading</i></span>');
            addDiv(koliteminfo, 'Volume: <span id="market-volume"><i>loading</i></span>');
        }

        redrawItemDescriptionPrice(itemId, thingNameNode, {cachedOnly: true}).then(() =>
            redrawItemDescriptionPrice(itemId, thingNameNode, {cachedOnly: false}));
    }

    document.body.appendChild(koliteminfo);

    let wikiElem = document.getElementById("wiki");
    wikiElem.addEventListener("click", () => {
        openWiki(thingName);
        window.close();
    });

    let searchInventoryElem = document.getElementById("searchinv");
    if (searchInventoryElem) {
        searchInventoryElem.addEventListener("click", () => {
            searchInventory(thingName);
            window.close();
        });
    }

    let searchMallElem = document.getElementById("searchmall");
    if (searchMallElem) {
        searchMallElem.addEventListener("click", () => {
            searchMall(thingName, {exactMatch: true});
            window.close();
        });
    }

    let pricecheckElem = document.getElementById("pricecheck");
    if (pricecheckElem) {
        pricecheckElem.addEventListener("click", () => {
            openPriceCheck(itemId);
            window.close();
        });
    }

    let boxedFamiliarImage = document.evaluate('//img[starts-with(@onclick, "fam(")]', document).iterateNext();
    if (boxedFamiliarImage) {
        boxedFamiliarImage.removeAttribute("onclick");
    }

    let boxedItemImage = document.evaluate('//img[starts-with(@onclick, "descitem(")]', document).iterateNext();
    if (boxedItemImage) {
        let boxedItemId = boxedItemImage.getAttribute("onclick").match(/descitem\((\d+)\)/)[1];
        wrapElemWithAnchor(boxedItemImage, `/desc_item.php?whichitem=${boxedItemId}`)
        boxedItemImage.removeAttribute("onclick");
    }

    let poopLinks = [];
    let poopLinkEval = document.evaluate("//a[contains(@onclick, 'javascript:poop(')]", document);
    let poopLinkIter = poopLinkEval.iterateNext();
    while (poopLinkIter) {
        poopLinks.push(poopLinkIter);
        poopLinkIter = poopLinkEval.iterateNext();
    }
    for (let poopLink of poopLinks) {
        let href = poopLink.getAttribute("onclick").match(/javascript:poop\("([^"]+)"/)[1];
        poopLink.onclick = null;
        poopLink.href = href;
    }

    bindKey(["Escape", "q"], () => window.close());
    bindKey("w", () => wikiElem.click());
    bindKey("s", () => searchInventoryElem && searchInventoryElem.click());
    bindKey("d", () => searchMallElem && searchMallElem.click());
    bindKey("g", () => pricecheckElem && pricecheckElem.click());
    bindKey("c", () => { navigator.clipboard.writeText(thingName); window.close(); });
}

function getDescriptionNameNode() {
    const xpaths = ["./b", "./center", "./font", "./p[1]"];
    let node = document.getElementById("description");
    let prevNode = null;
    while (node != prevNode) {
        prevNode = node;
        for (let xpath of xpaths) {
            let nextNode = document.evaluate(xpath, node).iterateNext();
            if (nextNode) {
                node = nextNode;
                break;
            }
        }
    }
    return node;
}

function wrapElemWithAnchor(elem, href) {
    let parent = elem.parentElement;
    let nextSibling = elem.nextElementSibling;

    let anchor = document.createElement("A");
    anchor.href = href;

    parent.removeChild(elem);
    anchor.appendChild(elem);
    parent.insertBefore(anchor, nextSibling);
}

function moveWindow() {
    let opener = window.opener?.top;
    if (opener) {
        let newX = opener.screenX + opener.innerWidth/3;
        let newY = opener.screenY + opener.innerHeight/3;
        window.moveTo(newX, newY);
    }
}

function addDiv(element, content, styleFunc) {
    let newDiv = document.createElement("div");
    newDiv.innerHTML = content;
    if (styleFunc) {
        styleFunc(newDiv.style);
    }
    element.appendChild(newDiv);
    return newDiv;
}

async function redrawItemDescriptionPrice(itemId, itemNameNode, {cachedOnly} = {}) {
    return redrawPrices([itemId], {cachedOnly},
        (_, flags, average, volume, color, fontStyle) => {
            itemNameNode.style.color = color;
            itemNameNode.style.fontStyle = fontStyle;

            if (isTradableItemFlags(flags)) {
                document.getElementById("market-average").innerHTML = average.toLocaleString();
                document.getElementById("market-volume").innerHTML = volume.toLocaleString();
            }
        },
        () => {
            document.getElementById("market-average").innerHTML = "error";
            document.getElementById("market-volume").innerHTML ="error";
        });
}
