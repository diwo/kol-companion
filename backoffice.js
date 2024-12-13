function handleBackoffice() {
    formatStoreActivity();

    let observer = new MutationObserver(bindClickPriceUndercut);
    observer.observe(document.body, {childList: true, subtree: true});
}

function formatStoreActivity() {
    let headingNode = document.evaluate("//b[text()='Recent Store Activity (past 2 weeks)']", document).iterateNext();
    if (headingNode) {
        let activityNode = headingNode.nextSibling.nextSibling;
        activityNode.innerHTML = activityNode.innerHTML.replaceAll(
            /\d{4,}(?= Meat)/g, str => `<span style="color: ${getPriceColor(true, str, 0)}">${parseInt(str).toLocaleString()}</span>`);
    }
}

function bindClickPriceUndercut() {
    let priceNodes = document.evaluate("//div[@class='inventory_table']//tr[@class='pres']//b", document);
    let priceNode = priceNodes.iterateNext();
    while (priceNode) {
        priceNode.addEventListener("click", onClickPriceUndercut);
        priceNode = priceNodes.iterateNext();
    }
}

function onClickPriceUndercut(event) {
    let pres = event.target;
    while (pres.tagName != "TR" || pres.className != "pres") {
        pres = pres.parentElement;
    }
    let deets = pres.previousElementSibling;
    let updateLink = document.evaluate(".//a[@class='update']", deets).iterateNext();

    updateLink.click();
    // await new Promise(resolve => setTimeout(resolve, 500));

    let priceInput = document.evaluate(".//input[contains(@class, 'price')]", deets).iterateNext();
    let price = parseFormattedInt(event.target.innerText);
    priceInput.value = (price - 1).toLocaleString();
    // await new Promise(resolve => setTimeout(resolve, 500));

    let savePriceButton = document.evaluate(".//input[@type='submit' and @value='Save']", deets).iterateNext();
    savePriceButton.click();
}