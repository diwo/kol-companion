const mallLinksKey = getMallLinksKey();
let mallLinks = [];

initSearchMallSection();

async function initSearchMallSection() {
    let searchMallElem = document.getElementById("searchmall");
    let addLinkElem = document.evaluate(".//a[@class='addlink']", searchMallElem).iterateNext();
    addLinkElem.addEventListener("click", onClickAddLink);

    mallLinks = await loadSearchMallTerms();
    mallLinks.forEach(addSearchMallTermElem);
}

function onClickAddLink(evClick) {
    evClick.preventDefault();

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
        inputElem.addEventListener("keyup", evKeyup => {
            if (evKeyup.key == "Enter") {
                let searchTerm = evKeyup.target.value;
                if (addSearchMallTermElem(searchTerm)) {
                    saveSearchMallTerm(searchTerm);
                    searchMall(searchTerm);
                }
            }
        });
        inputElem.focus();
    }
}

function addSearchMallTermElem(searchTerm) {
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
    searchTermLink.addEventListener("click", e => {
        e.preventDefault();
        searchMall(e.target.innerText);
    });

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
        e.preventDefault();
        let li = e.target.parentElement;
        let searchTerm = document.evaluate("./a[@class='searchterm']", li).iterateNext()?.innerText;
        if (searchTerm) {
            deleteSearchMallTerm(searchTerm);
        }
        li.parentElement.removeChild(li);
    });
    return removeLink;
}

async function loadSearchMallTerms() {
    let cacheFetch = await browser.storage.local.get(mallLinksKey);
    let quicklinks = cacheFetch[mallLinksKey] || [];
    return caseInsensitiveDedupe(quicklinks);
}

async function saveSearchMallTerm(searchTerm) {
    mallLinks.push(searchTerm);
    mallLinks = caseInsensitiveDedupe(mallLinks);
    browser.storage.local.set({[mallLinksKey]: mallLinks});
}

async function deleteSearchMallTerm(searchTerm) {
    mallLinks = mallLinks.filter(quicklink => quicklink.toLowerCase() != searchTerm.toLowerCase());
    browser.storage.local.set({[mallLinksKey]: mallLinks});
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