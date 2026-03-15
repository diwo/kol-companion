let companionPaneData = {};

initMallSearchSection();
initMallAlertsSection();

// --- Mall Search ---

async function initMallSearchSection() {
    let mallSearchElem = document.getElementById("mallsearch");

    companionPaneData.mallSearch = await loadMallSearchTerms();
    companionPaneData.mallSearch.map(createMallSearchItem)
        .forEach(item => addSectionItem(mallSearchElem, item, onRemoveMallSearchItem));

    let mallSearchAddButton = document.evaluate(".//a[@class='addbutton']", mallSearchElem).iterateNext();
    mallSearchAddButton.addEventListener("click", event => {
        event.preventDefault();
        handleSectionAddButton(mallSearchElem, createMallSearchItem, onAddMallSearchItem, onRemoveMallSearchItem);
    });
}

function createMallSearchItem(itemText) {
    let itemLink = document.createElement("a");
    itemLink.href = "#";
    itemLink.innerText = itemText;
    itemLink.addEventListener("click", e => {
        e.preventDefault();
        searchMall(e.target.innerText);
    });

    return itemLink;
}

function onAddMallSearchItem(itemText) {
    let searchTerm = itemText.trim();
    if (!searchTerm) return false;
    if (companionPaneData.mallSearch.find(elem => elem.toLowerCase().trim() == searchTerm.toLowerCase().trim())) return false;

    saveMallSearchTerm(itemText);
    searchMall(itemText);
    return true;
}

function onRemoveMallSearchItem(item) {
    deleteMallSearchTerm(item.innerText);
}

async function loadMallSearchTerms() {
    const mallLinksKey = getMallLinksKey();
    let cacheFetch = await browser.storage.local.get(mallLinksKey);
    let quicklinks = cacheFetch[mallLinksKey] || [];
    return caseInsensitiveDedupe(quicklinks);
}

async function saveMallSearchTerm(searchTerm) {
    companionPaneData.mallSearch.push(searchTerm);
    companionPaneData.mallSearch = caseInsensitiveDedupe(companionPaneData.mallSearch);
    return browser.storage.local.set({[getMallLinksKey()]: companionPaneData.mallSearch});
}

async function deleteMallSearchTerm(searchTerm) {
    companionPaneData.mallSearch = companionPaneData.mallSearch.filter(elem => elem.toLowerCase().trim() != searchTerm.toLowerCase().trim());
    return browser.storage.local.set({[getMallLinksKey()]: companionPaneData.mallSearch});
}

function caseInsensitiveDedupe(strArray) {
    let added = {};
    let deduped = [];
    for (let str of strArray) {
        let lc = str.toLowerCase();
        if (!added[lc]) {
            deduped.push(str);
            added[lc] = true;
        }
    }
    return deduped;
}

// --- Mall Alerts ---

async function initMallAlertsSection() {
    let mallAlertsElem = document.getElementById("mallalerts");

    companionPaneData.mallAlerts = await loadMallAlerts();
    companionPaneData.mallAlerts.sort((a,b) => parseMallAlertString(b).price - parseMallAlertString(a).price);
    companionPaneData.mallAlerts.map(createMallAlertsItem)
        .forEach(item => addSectionItem(mallAlertsElem, item, onRemoveMallAlertsItem));
    companionPaneData.mallAlertsRunning = null;

    let mallAlertsAddButton = document.evaluate(".//a[@class='addbutton']", mallAlertsElem).iterateNext();
    mallAlertsAddButton.addEventListener("click", event => {
        event.preventDefault();
        handleSectionAddButton(mallAlertsElem, createMallAlertsItem, onAddMallAlertsItem, onRemoveMallAlertsItem);
    });

    let toggleElem = document.evaluate(".//a[@class='toggle']", mallAlertsElem).iterateNext();
    toggleElem.addEventListener("click", event => {
        event.preventDefault();
        toggleMallAlerts();
    });
}

function createMallAlertsItem(itemText) {
    let parsed = parseMallAlertString(itemText);
    if (!parsed) return itemText;

    let searchTermLink = document.createElement("a");
    searchTermLink.href = "#";
    searchTermLink.innerText = parsed.searchTerm;
    searchTermLink.addEventListener("click", e => {
        e.preventDefault();
        searchMall(e.target.innerText);
    });

    let wrapper = document.createElement("span");
    wrapper.append(searchTermLink);
    wrapper.append("@" + parsed.priceStr);
    return wrapper;
}

function onAddMallAlertsItem(itemText) {
    let parsedAlert = parseMallAlertString(itemText);
    if (!parsedAlert) return false;
    saveMallAlert(itemText);
    return true;
}

function onRemoveMallAlertsItem(item) {
    deleteMallAlert(item.innerText);
}

function parseMallAlertString(str) {
    let parts = str?.split("@");
    if (parts?.length != 2) return null;

    let [searchTerm, priceStr] = parts;
    let price = parseFormattedNum(priceStr);
    if (!searchTerm || !price) return null;

    return {searchTerm, priceStr, price};
}

async function loadMallAlerts() {
    const mallAlertsKey = getMallAlertsKey();
    let cacheFetch = await browser.storage.local.get(mallAlertsKey);
    return caseInsensitiveDedupe(cacheFetch[mallAlertsKey] || []);
}

async function saveMallAlert(alertText) {
    companionPaneData.mallAlerts.push(alertText);
    companionPaneData.mallAlerts = caseInsensitiveDedupe(companionPaneData.mallAlerts);
    return browser.storage.local.set({[getMallAlertsKey()]: companionPaneData.mallAlerts});
}

async function deleteMallAlert(alertText) {
    companionPaneData.mallAlerts = companionPaneData.mallAlerts.filter(elem => elem.toLowerCase().trim() != alertText.toLowerCase().trim());
    return browser.storage.local.set({[getMallAlertsKey()]: companionPaneData.mallAlerts});
}

function toggleMallAlerts(state) {
    let mallAlertsElem = document.getElementById("mallalerts");
    let toggle = document.evaluate(".//a[@class='toggle']", mallAlertsElem).iterateNext();
    if (state == "on" || (!state && toggle.dataset.state == "off")) {
        toggle.dataset.state = "on";
        toggle.innerText = "On";
        companionPaneData.mallAlertsRunning = runMallAlerts(true);
    } else {
        toggle.dataset.state = "off";
        toggle.innerText = "Off";
        companionPaneData.mallAlertsRunning = null;
    }
}

async function runMallAlerts(init) {
    const pollingDelay = 1000;
    let windowId = getWindowId();
    let result = await browser.runtime.sendMessage({operation: "checkMallAlerts", windowId, init});
    if (result?.error) {
        console.error("Error checking mall alerts:", result.error);
        return toggleMallAlerts("off");
    }
    await new Promise(resolve => setTimeout(resolve, pollingDelay));
    return companionPaneData.mallAlertsRunning ? runMallAlerts() : null;
}


function handleSectionAddButton(section, createSectionItem, onAddItem, onRemoveItem) {
    let inputElem = document.evaluate(".//input", section).iterateNext();
    if (!inputElem) {
        inputElem = document.createElement("input");
        inputElem.type = "text";
        let ul = document.evaluate(".//ul", section).iterateNext();
        let li = document.createElement("li");
        li.appendChild(createSectionItemRemoveButton(onRemoveItem));
        li.appendChild(inputElem);
        ul.appendChild(li);
        inputElem.addEventListener("keyup", evKeyup => {
            if (evKeyup.key == "Enter") {
                let itemText = evKeyup.target.value;
                if (onAddItem(itemText)) {
                    addSectionItem(section, createSectionItem(itemText), onRemoveItem);
                }
            }
        });
        inputElem.focus();
    }
}

function addSectionItem(section, item, onRemoveItem) {
    let ul = document.evaluate(".//ul", section).iterateNext();

    let inputRow = document.evaluate("./li/input", ul).iterateNext()?.parentElement;
    if (inputRow) {
        ul.removeChild(inputRow);
    }

    let li = document.createElement("li");
    let itemWrapper = document.createElement("span");

    itemWrapper.append(item);
    li.appendChild(createSectionItemRemoveButton(onRemoveItem));
    li.appendChild(itemWrapper);
    ul.appendChild(li);
}

function createSectionItemRemoveButton(onRemoveSectionItem) {
    let removeButton = document.createElement("a");
    removeButton.href = "#";
    removeButton.className = "removebutton";
    removeButton.innerText = "[-]";
    removeButton.addEventListener("click", e => {
        e.preventDefault();
        let li = e.target.parentElement;
        let itemWrapper = document.evaluate("./span", li).iterateNext();
        if (itemWrapper) onRemoveSectionItem(itemWrapper);
        li.parentElement.removeChild(li);
    });
    return removeButton;
}
