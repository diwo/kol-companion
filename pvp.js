function handlePvp() {
    let place = URL.parse(document.URL).searchParams.get("place");
    if (place == "logs") {
        addMarketLinksToPvpLogs();
    }

    let observer = new MutationObserver(() => clickLink(/fast-forward results/));
    observer.observe(document.body, {childList: true, subtree: true});

    bindKey("`", () => clickButton(/A Fighter is You!/));

    addPriceToAdventureRewardItems();
}

function addMarketLinksToPvpLogs() {
    let evalResults = document.evaluate("//td[6]/small", document);
    let results = [];
    let result = evalResults.iterateNext();
    while (result) {
        results.push(result);
        result = evalResults.iterateNext();
    }

    for (result of results) {
        let match = result.innerText.match(/^((.*\/)?(Stole|Lost)\s)(.*)/);

        if (match && !result.childElementCount) {
            let prefix = match[2] || "";
            let verb = match[3];
            let itemName = match[4].replace(/\s/g, " ");
            let color = verb == "Stole" ? "green" : "red";

            result.firstChild.textContent = prefix;

            let verbNode = document.createElement("span");
            verbNode.innerText = verb + " ";
            verbNode.style.color = color;
            result.appendChild(verbNode);

            let mallLink = document.createElement("a");
            mallLink.href = "#";
            mallLink.innerText = itemName;
            mallLink.onclick = e => {
                e.preventDefault();
                searchMall(itemName, {exactMatch: true});
            };
            result.appendChild(mallLink);

            let invLink = document.createElement("a");
            invLink.href = "#";
            invLink.innerText = "[inv]";
            invLink.onclick = e => {
                e.preventDefault();
                searchInventory(itemName);
            };
            invLink.style.fontSize = "0.7em";
            invLink.style.marginLeft = "3px";
            result.appendChild(invLink);
        }
    }
}