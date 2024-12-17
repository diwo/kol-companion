function handleBackoffice() {
    sortStoreInventory();
    formatStoreActivity();

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
        let activityNode = activityHeading.nextSibling.nextSibling;
        activityNode.innerHTML = activityNode.innerHTML.replaceAll(
            /\d{4,}(?= Meat)/g, str => `<span style="color: ${getPriceColor(true, str, 0)}">${parseInt(str).toLocaleString()}</span>`);
    }
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