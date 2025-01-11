handleWiki();

function handleWiki() {
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
    
        let itemId = marketLink.href.match(/itemid=(\d+)/)[1];
        redrawWikiItemInfoPrice(itemId, {cachedOnly: true}).then(() =>
            redrawWikiItemInfoPrice(itemId, {cachedOnly: false}));
    }
}

async function redrawWikiItemInfoPrice(itemId, {cachedOnly} = {}) {
    return redrawPrices([itemId], {cachedOnly},
        (_, flags, average, volume, color, fontStyle) => {
            let itemNameNode = document.evaluate("//div[@id='mw-content-text']//tr[1]//td[1]/p/b[1]", document).iterateNext();
            itemNameNode.style.color = color;
            itemNameNode.style.fontStyle = fontStyle;

            let priceNode = document.getElementById("marketprice");
            if (isItemFlagsTradable(flags)) {
                priceNode.innerHTML = `${average.toLocaleString()} x ${volume.toLocaleString()}`;
            } else {
                priceNode.innerHTML = "untradable";
            }
        });
}