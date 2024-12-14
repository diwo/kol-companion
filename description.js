async function handleDescriptionPage() {
    moveWindow();

    let pathname = new URL(document.URL).pathname;
    let thingNameNode = document.evaluate("//center//b", document).iterateNext();
    let thingName = thingNameNode.innerText;

    if (pathname == "/desc_guardian.php") {
        let title = document.evaluate("//center//b", document).iterateNext().parentNode.innerText;
        thingName = title.match(/level \d+ (.*)/)[1];
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

    let wikiDiv = addDiv(koliteminfo, '[<a id="wiki" href="#">Wiki</a>]');
    wikiDiv.style.display = 'inline';

    if (itemId) {
        let untradable =
            document.body.innerHTML.match(/Cannot be traded/) ||
            document.body.innerHTML.match(/Gift Item/);

        addDiv(koliteminfo, '[<a id="searchinv" href="#">Inv</a>]', style => style.display = "inline");

        if (untradable) {
            await browser.runtime.sendMessage({operation: "setUntradable", itemId});
        } else {
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
            searchMall(thingName);
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
    bindKey("c", () => navigator.clipboard.writeText(thingName));
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
    let opener = window.opener.top;
    let newX = opener.screenX + opener.innerWidth/3;
    let newY = opener.screenY + opener.innerHeight/3;
    window.moveTo(newX, newY);
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
        (_, tradable, average, volume, color) => {
            itemNameNode.style.color = color;

            if (tradable) {
                document.getElementById("market-average").innerHTML = average.toLocaleString();
                document.getElementById("market-volume").innerHTML = volume.toLocaleString();
            }
        },
        () => {
            document.getElementById("market-average").innerHTML = "error";
            document.getElementById("market-volume").innerHTML ="error";
        });
}
