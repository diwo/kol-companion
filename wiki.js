handleWiki();

function handleWiki() {
    let infobox = document.getElementsByClassName("infobox")?.[0];
    if (infobox) {
        let lines = infobox.innerText.split("\n").map(line => line.replace(/\s+/g, " "));
        let matches = lines.map(line => line.match(/Item number: (\d+)/)).filter(m => !!m);
        if (matches.length) {
            let itemId = parseInt(matches[0][1]);
            handleWikiItemPage(itemId);
        }
    }

    let pageTitle = document.getElementById("firstHeading")?.innerText;
    let itemName = getWikiItemNameNode()?.innerText;
    let copyText = itemName || pageTitle;
    if (copyText) {
        bindKey({key: "c", modifiers: ["Control"]}, () => {
            let hasSelection = window.getSelection().toString();
            if (!hasSelection) {
                navigator.clipboard.writeText(copyText);
                return true;
            }
        });
    }
}

function handleWikiItemPage(itemId) {
    let marketLink = document.evaluate(
        "//a[translate(text(), '\u00a0', ' ') = 'View market statistics']", document).iterateNext();
    if (marketLink) {
        let priceNode = document.getElementById("marketprice");
        if (!priceNode) {
            let priceContainer = document.createElement("div");
            priceContainer.innerHTML = `
                <b>Market:</b>
                <span id="marketprice">(?)</span>
            `;

            let marketLinkContainer = marketLink.parentElement;
            marketLinkContainer.parentElement.insertBefore(priceContainer, marketLinkContainer.nextElementSibling);
            marketLinkContainer.parentElement.insertBefore(document.createElement("BR"), marketLinkContainer.nextElementSibling);
        }
    }

    redrawWikiItemInfoPrice(itemId, {cachedOnly: true}).then(() =>
        redrawWikiItemInfoPrice(itemId, {cachedOnly: false}));
}

async function redrawWikiItemInfoPrice(itemId, {cachedOnly} = {}) {
    return redrawPrices([itemId], {cachedOnly},
        (_, flags, average, volume, color, fontStyle) => {
            let itemNameNode = getWikiItemNameNode();
            if (!itemNameNode.style.color && !itemNameNode.style.backgroundColor) {
                itemNameNode.style.color = color;
                itemNameNode.style.fontStyle = fontStyle;
            }

            let priceNode = document.getElementById("marketprice");
            if (priceNode) {
                if (isTradableItemFlags(flags)) {
                    priceNode.innerHTML = `${average.toLocaleString()} x ${volume.toLocaleString()}`;
                } else {
                    priceNode.innerHTML = "untradable";
                }
            }
        });
}

function getWikiItemNameNode() {
    return document.evaluate("//div[@id='mw-content-text']//div[contains(@class, 'template-item')]//span[b[1]]", document).iterateNext();
}