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
    let priceUpdateListener = browser.runtime.connect({name: "priceUpdateListener"});
    priceUpdateListener.onMessage.addListener(message => redrawFleaMarketPrices(message.itemIds));
}

function redrawFleaMarketPrices(itemIds) {
    let relevantItemIds = itemIds.filter(itemId => document.getElementById(`iname${itemId}`));

    return redrawPrices(relevantItemIds, {cachedOnly: true},
        (itemId, tradable, average, volume, color) => {
            let itemNameNode = document.getElementById(`iname${itemId}`);
            itemNameNode.style.color = color;

            let priceNode = document.getElementById(`iprice${itemId}`);
            priceNode.innerHTML = tradable ? `(${average.toLocaleString()} x ${volume.toLocaleString()})` : "";
        });
}