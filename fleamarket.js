function handleFleaMarket() {
    let row = document.evaluate("//b[text()='Items for Sale:']/parent::center/p[3]/table//tr[2]", document).iterateNext();
    let itemIds = [];
    while (row) {
        let itemId = parseInt(document.evaluate(".//input[@name='whichitem']", row).iterateNext().value);
        let nameCol = document.evaluate(".//td[2]", row).iterateNext();
        nameCol.firstChild.firstChild.id = `iname${itemId}`;

        let priceElem = document.createElement("span");
        priceElem.id = `iprice${itemId}`;
        priceElem.style.fontSize = "0.6em";
        priceElem.innerText = "(?)";

        nameCol.appendChild(document.createElement("br"));
        nameCol.appendChild(priceElem);

        itemIds.push(itemId);
        row = row.nextSibling;
    }

    redrawFleaMarketPrices(itemIds);
    fetchMissingPrices(itemIds);
    itemIds.forEach(queuePriceCheck);
    let itemUpdateListener = browser.runtime.connect({name: "itemUpdateListener"});
    itemUpdateListener.onMessage.addListener(message => redrawFleaMarketPrices(message.itemIds));
}

function redrawFleaMarketPrices(itemIds) {
    let relevantItemIds = itemIds.filter(itemId => document.getElementById(`iname${itemId}`));

    return redrawPrices(relevantItemIds, {cachedOnly: true},
        (itemId, flags, average, volume, color, fontStyle) => {
            let itemNameNode = document.getElementById(`iname${itemId}`);
            itemNameNode.style.color = color;
            itemNameNode.style.fontStyle = fontStyle;

            let priceNode = document.getElementById(`iprice${itemId}`);
            if (isTradableItemFlags(flags)) {
                priceNode.innerHTML = `(${average.toLocaleString()} x ${volume.toLocaleString()})`;
            } else {
                priceNode.innerHTML = "";
            }
        });
}