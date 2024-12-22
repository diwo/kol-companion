const searchMallQuickLinksKey = "searchmall_quicklinks";
let searchMallQuickLinks = [];

initSearchMallSection();

async function initSearchMallSection() {
    let searchMallElem = document.getElementById("searchmall");
    let addLinkElem = document.evaluate(".//a[@class='addlink']", searchMallElem).iterateNext();
    addLinkElem.addEventListener("click", onClickAddLink);

    searchMallQuickLinks = await loadSearchMallSearchTerms();
    searchMallQuickLinks.forEach(addSearchMallSearchTermElem);
}

function onClickAddLink() {
    let searchMallElem = document.getElementById("searchmall");
    let inputElem = document.evaluate(".//input", searchMallElem).iterateNext();
    if (!inputElem) {
        inputElem = document.createElement("input");
        inputElem.type = "text";
        let ul = document.evaluate(".//ul", searchMallElem).iterateNext();
        let li = document.createElement("li");
        li.appendChild(createSearchMallRemoveLinkElem());
        li.appendChild(inputElem);
        ul.appendChild(li);
        inputElem.addEventListener("keyup", e => {
            if (e.key == "Enter") {
                let searchTerm = e.target.value;
                if (addSearchMallSearchTermElem(searchTerm)) {
                    saveSearchMallSearchTerm(searchTerm);
                    searchMall(searchTerm);
                }
            }
        });
        inputElem.focus();
    }
}

function addSearchMallSearchTermElem(searchTerm) {
    let searchMallElem = document.getElementById("searchmall");
    let ul = document.evaluate(".//ul", searchMallElem).iterateNext();

    let inputRow = document.evaluate("./li/input", ul).iterateNext()?.parentElement;
    if (inputRow) {
        ul.removeChild(inputRow);
    }

    searchTerm = searchTerm.trim();
    if (searchTerm == "") {
        return false;
    }

    let existingSearchTerms = document.evaluate("./li/a[@class='searchterm']", ul);
    let existingSearchTerm = existingSearchTerms.iterateNext();
    while (existingSearchTerm) {
        if (existingSearchTerm.innerText.toLowerCase() == searchTerm.toLowerCase()) {
            return false;
        }
        existingSearchTerm = existingSearchTerms.iterateNext();
    }


    let searchTermLink = document.createElement("a");
    searchTermLink.href = "#";
    searchTermLink.className = "searchterm";
    searchTermLink.innerText = searchTerm;
    searchTermLink.addEventListener("click", e => searchMall(e.target.innerText));

    let li = document.createElement("li");
    li.appendChild(createSearchMallRemoveLinkElem());
    li.appendChild(searchTermLink);
    ul.appendChild(li);

    return true;
}

function createSearchMallRemoveLinkElem() {
    let removeLink = document.createElement("a");
    removeLink.href = "#";
    removeLink.className = "removelink";
    removeLink.innerText = "[-]";
    removeLink.addEventListener("click", e => {
        let li = e.target.parentElement;
        let searchTerm = document.evaluate("./a[@class='searchterm']", li).iterateNext()?.innerText;
        if (searchTerm) {
            deleteSearchMallSearchTerm(searchTerm);
        }
        li.parentElement.removeChild(li);
    });
    return removeLink;
}

async function loadSearchMallSearchTerms() {
    let cacheFetch = await browser.storage.local.get(searchMallQuickLinksKey);
    let quicklinks = cacheFetch[searchMallQuickLinksKey] || [];
    return caseInsensitiveDedupe(quicklinks);
}

async function saveSearchMallSearchTerm(searchTerm) {
    searchMallQuickLinks.push(searchTerm);
    searchMallQuickLinks = caseInsensitiveDedupe(searchMallQuickLinks);
    browser.storage.local.set({[searchMallQuickLinksKey]: searchMallQuickLinks});
}

async function deleteSearchMallSearchTerm(searchTerm) {
    searchMallQuickLinks = searchMallQuickLinks.filter(quicklink => quicklink.toLowerCase() != searchTerm.toLowerCase());
    browser.storage.local.set({[searchMallQuickLinksKey]: searchMallQuickLinks});
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