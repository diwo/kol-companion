function handleBackoffice() {
    sortStoreInventory();
    formatStoreActivity();
    addStoreCheckUndercutButton();

    let observer = new MutationObserver(bindStoreInventoryListeners);
    observer.observe(document.body, {childList: true, subtree: true});
}

function sortStoreInventory() {
    let tbody = document.evaluate("//table[@id='inv']/tbody", document).iterateNext();
    if (tbody) {
        let rows = [];
        let row = tbody.firstChild.nextSibling;
        while (row) {
            let nextRow = row.nextSibling;
            rows.push(row);
            tbody.removeChild(row);
            row = nextRow;
        }

        let getPrice = row => parseInt(row.children[3].firstChild.innerText.replace(/,/g, ""));
        rows.sort((a, b) => getPrice(a) - getPrice(b));

        let rowNum = 0;
        while (rows.length) {
            let row = rows.pop();
            row.setAttribute("data-after", rowNum);
            tbody.appendChild(row);
            rowNum += 1;
        }
    }
}

function formatStoreActivity() {
    let activityHeading = document.evaluate("//b[text()='Recent Store Activity (past 2 weeks)']", document).iterateNext();
    if (activityHeading) {
        let parent = activityHeading.nextSibling.nextSibling;
        let node = parent.firstChild;
        while (node) {
            let nextNode = node.nextSibling;
            let match = node.textContent.match(/^ bought (\d+) \((.*)\) for (\d+) Meat.$/);
            if (match) {
                let count = parseInt(match[1]);
                let itemName = match[2];
                let totalPrice = parseInt(match[3]);

                let wrapper = document.createElement("span");

                let itemLink = document.createElement("a");
                itemLink.innerText = itemName;
                itemLink.style.fontStyle = "italic";
                itemLink.href = "#";
                itemLink.onclick = e => e.preventDefault() || searchMall(itemName, {exactMatch: true});

                let totalPriceNode = document.createElement("span");
                totalPriceNode.innerText = totalPrice.toLocaleString();
                totalPriceNode.style.color = getPriceColor(totalPrice);
                totalPriceNode.style.fontWeight = "bold";

                wrapper.appendChild(document.createTextNode(` bought ${count} `));
                wrapper.appendChild(itemLink);
                wrapper.appendChild(document.createTextNode(" for "));
                wrapper.appendChild(totalPriceNode);
                wrapper.appendChild(document.createTextNode(" Meat"));

                if (count > 1) {
                    let unitPrice = totalPrice / count;
                    wrapper.appendChild(document.createTextNode(` (${unitPrice.toLocaleString()}/ea)`));
                }
                wrapper.appendChild(document.createTextNode("."));

                parent.insertBefore(wrapper, node);
                parent.removeChild(node);
            }
            node = nextNode;
        }
    }
}

function addStoreCheckUndercutButton() {
    let stockElem = document.getElementById("stock");
    let buttonContainer = document.createElement("center");
    let checkUndercutLink = document.createElement("a");
    checkUndercutLink.href = "#";
    checkUndercutLink.innerText = "Check Undercut";
    buttonContainer.append(checkUndercutLink);
    stockElem.parentElement.insertBefore(buttonContainer, stockElem.nextSibling);

    let isCheckingUndercut = false;

    checkUndercutLink.addEventListener("click", event => {
        event.preventDefault();
        if (isCheckingUndercut) return;
        isCheckingUndercut = true;

        evaluateToNodesArray("//a[@class='prices'][text()='dismiss']").forEach(el => el.click());

        const hasStoreListingBeenUndercut = pres => {
            let lowestListings = evaluateToNodesArray(".//tr/td[2]", {contextNode: pres});
            let myPrice = 0;
            let lowestOtherPrice = 0;
            for (let listing of lowestListings) {
                let isMine = !!evaluateToNodesArray(".//small[./i/text()='(yours)']", {contextNode: listing}).length;
                let priceString = evaluateToNodesArray(".//b/text()", {contextNode: listing})[0].textContent;
                let price = parseInt(priceString.replaceAll(/,/g, ""));
                if (isMine) {
                    myPrice = price;
                } else if (!lowestOtherPrice || price < lowestOtherPrice) {
                    lowestOtherPrice = price;
                }
            }
            return !myPrice || (!!lowestOtherPrice && lowestOtherPrice <= myPrice);
        };

        let observer = new MutationObserver(() => {
            let dismisses = evaluateToNodesArray("//a[@class='prices'][text()='dismiss']");
            let preses = evaluateToNodesArray("//tr[@class='pres']");
            if (preses.length == dismisses.length) {
                observer.disconnect();
                for (let pres of preses) {
                    if (!hasStoreListingBeenUndercut(pres)) {
                        let dismiss = evaluateToNodesArray(".//a[@class='prices'][text()='dismiss']", {contextNode: pres.previousElementSibling})[0];
                        dismiss?.click();
                    }
                }
                isCheckingUndercut = false;
            }
        });
        observer.observe(document.body, {childList: true, subtree: true});
        evaluateToNodesArray("//a[@class='prices'][text()='prices']").forEach(el => el.click());
    });
}

function bindStoreInventoryListeners() {
    bindClickStoreInventoryPriceUndercut();
    bindClickStoreInventoryPriceToggle();
}

function bindClickStoreInventoryPriceUndercut() {
    let priceNodes = document.evaluate("//div[@class='inventory_table']//tr[@class='pres']//b", document);
    let priceNode = priceNodes.iterateNext();
    while (priceNode) {
        priceNode.addEventListener("click", onClickStoreInventoryPriceUndercut);
        priceNode = priceNodes.iterateNext();
    }
}

function bindClickStoreInventoryPriceToggle() {
    let containers = document.evaluate("//div[@class='inventory_table']//tr[@class='deets' or @class='pres']", document);
    let container = containers.iterateNext();
    while (container) {
        container.addEventListener("contextmenu", onClickStoreInventoryPriceToggle);
        container = containers.iterateNext();
    }
}

function onClickStoreInventoryPriceUndercut(event) {
    let pres = event.target;
    while (pres.tagName != "TR" || pres.className != "pres") {
        pres = pres.parentElement;
    }
    let deets = pres.previousElementSibling;

    let updateLink = document.evaluate(".//a[@class='update']", deets).iterateNext();
    updateLink.click();

    let priceInput = document.evaluate(".//input[contains(@class, 'price')]", deets).iterateNext();
    let price = parseFormattedInt(event.target.innerText);
    priceInput.value = (price - 1).toLocaleString();

    let savePriceButton = document.evaluate(".//input[@type='submit' and @value='Save']", deets).iterateNext();
    savePriceButton.click();

    let dismissLink = document.evaluate(".//a[@class='prices' and text()='dismiss']", deets).iterateNext();
    dismissLink.click();
}

function onClickStoreInventoryPriceToggle(event) {
    event.preventDefault();

    let deetsOrPres = event.target;
    while (deetsOrPres.tagName != "TR" || (deetsOrPres.className != "deets" && deetsOrPres.className != "pres")) {
        deetsOrPres = deetsOrPres.parentElement;
    }
    let deets = deetsOrPres.className == "deets" ? deetsOrPres : deetsOrPres.previousElementSibling;
    document.evaluate(".//a[@class='prices']", deets).iterateNext().click();
}