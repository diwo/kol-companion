const searchMallQuickLinksKey = "searchmall_quicklinks";
let searchMallQuickLinks = [];

initSearchMallSection();

async function initSearchMallSection() {
    let searchMallElem = document.getElementById("searchmall");
    let addLinkElem = document.evaluate(".//a[@class='addlink']", searchMallElem).iterateNext();
    addLinkElem.addEventListener("click", onClickAddLink);

    let cacheFetch = await browser.storage.local.get(searchMallQuickLinksKey);
    searchMallQuickLinks = cacheFetch[searchMallQuickLinksKey] || [];
    searchMallQuickLinks.forEach(addSearchMallEntry);
}

function onClickAddLink() {
    let searchMallElem = document.getElementById("searchmall");
    let inputElem = document.evaluate(".//input", searchMallElem).iterateNext();
    if (!inputElem) {
        inputElem = document.createElement("input");
        inputElem.type = "text";
        let ul = document.evaluate(".//ul", searchMallElem).iterateNext();
        let li = document.createElement("li");
        li.appendChild(createSearchMallRemoveLink());
        li.appendChild(inputElem);
        ul.appendChild(li);
        inputElem.addEventListener("keyup", e => {
            if (e.key == "Enter") {
                if (addSearchMallEntry(e.target.value)) {
                    searchMall(e.target.value);
                }
            }
        });
        inputElem.focus();
    }
}

function addSearchMallEntry(searchTerm) {
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
    li.appendChild(createSearchMallRemoveLink());
    li.appendChild(searchTermLink);
    ul.appendChild(li);

    searchMallQuickLinks.push(searchTerm);
    browser.storage.local.set({[searchMallQuickLinksKey]: searchMallQuickLinks});

    return true;
}

function createSearchMallRemoveLink() {
    let removeLink = document.createElement("a");
    removeLink.href = "#";
    removeLink.className = "removelink";
    removeLink.innerText = "[-]";
    removeLink.addEventListener("click", e => {
        let li = e.target.parentElement;
        let searchTerm = document.evaluate("./a[@class='searchterm']", li).iterateNext().innerText;
        li.parentElement.removeChild(li);

        searchMallQuickLinks = searchMallQuickLinks.filter(quicklink => quicklink.toLowerCase() != searchTerm);
        browser.storage.local.set({[searchMallQuickLinksKey]: searchMallQuickLinks});
    });
    return removeLink;
}