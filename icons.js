loadIcons();

async function loadIcons() {
    let windowId = new URLSearchParams(window.location.hash.split("#")[1]).get("return");

    const imageBaseUrl = "https://d2uyhvukfffg5a.cloudfront.net/itemimages/";
    let iconFilenames = await getIconFilenames();
    let iconsContainer = document.getElementById("icons");
    for (let i=0; i<iconFilenames.length; i++) {
        let iconName = iconFilenames[i].replace(/\.\w+$/, "");
        let imgElem = document.createElement("img");
        imgElem.src = imageBaseUrl + iconFilenames[i];
        imgElem.title = iconName;
        imgElem.alt = iconName;
        imgElem.width = 30;
        imgElem.height = 30;
        imgElem.onclick = async () => {
            await browser.runtime.sendMessage({operation: "chooseIcon", windowId, iconName});
            window.close();
        };
        iconsContainer.appendChild(imgElem);
    }

    let filterTextElem = document.getElementById("filterText");
    filterTextElem.value = "";
    applyFilter();
    filterTextElem.addEventListener("input", applyFilter);
    document.addEventListener("keydown", () => filterTextElem.focus());
}

async function getIconFilenames() {
    let response = await fetch("https://raw.githubusercontent.com/kolmafia/kolmafia/refs/heads/main/src/data/items.txt");
    if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
    }
    let page = await response.text();
    let rows = page.split("\n");

    let imageFilenameSeen = {};
    let imageFilenames = [];
    for (let row of rows) {
        if (!row.match(/^\d+\t/)) continue;
        let cols = row.split("\t");
        if (cols.length < 4) continue;

        let imageFilename = cols[3];
        if (!imageFilenameSeen[imageFilename]) {
            imageFilenameSeen[imageFilename] = true;
            imageFilenames.push(imageFilename);
        }
    }

    return imageFilenames;
}

function applyFilter() {
    let filterText = document.getElementById("filterText").value;
    let iconsContainer = document.getElementById("icons");
    let icon = iconsContainer.firstChild;
    while (icon) {
        if (filterText) {
            if (icon.title.match(new RegExp(filterText, "i"))) {
                icon.className = "";
            } else {
                icon.className = "hide";
            }
        } else {
            icon.className = "";
        }
        icon = icon.nextSibling;
    }
}