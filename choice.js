function handleChoice() {
    addAdventureChoiceNotes();
    drawCombBeachGrid();
    addPriceToAdventureRewardItems();
}

async function addAdventureChoiceNotes() {
    let buttons = evaluateToNodesArray("//form[@action='choice.php']/input[@type='submit']");
    if (!buttons.length) {
        return;
    }

    let fetchResponse = await fetch(browser.runtime.getURL("data/adventures.json"));
    let adventuresData = await fetchResponse.json();

    for (let button of buttons) {
        let adventureName = document.evaluate(
            "./ancestor::table/tbody/tr[1]/td[1][@align='center']/b",
            button).iterateNext()?.innerText;
        let choiceText = button.value;
        let optionNum = parseInt(document.evaluate(
            "./input[@name='option']",
            button.parentElement).iterateNext()?.value || 0);

        let adventure = adventuresData?.[adventureName];
        if (adventure?.variants) {
            let variant = adventure.variants.find(isMatchAdventureVariant);
            if (variant) adventure = variant;
        }

        let choice = matchAdventureChoice(adventure, choiceText, optionNum);
        let note = choice?.note;
        let tag = choice?.tag;

        if (note || tag) {
            let noteNode = document.createElement("div");
            if (note) {
                noteNode.innerHTML = `[${note}]`;
            }
            if (tag) {
                let color;
                if (tag == "quest") color = "darkviolet";
                if (tag == "rare") color = "orange";
                let bNode = document.createElement("b");
                if (color) bNode.style.color = color;
                bNode.style.marginLeft = "2px";
                bNode.innerText = `(${tag})`;
                noteNode.append(bNode);
            }
            noteNode.setAttribute("valign", "center");
            noteNode.style.display = "inline";
            noteNode.style.fontSize = "0.8em";
            if (button.parentElement.tagName == "TD") {
                // button has existing adjacent node
                noteNode.style.marginLeft = "4px";
            } else {
                noteNode.style.position = "absolute";
                noteNode.style.margin = "2px 4px";
            }
            button.parentElement.appendChild(noteNode);
        }
    }
}

function isMatchAdventureVariant(variant) {
    let pageContentCond = variant?.pageContent;
    if (pageContentCond) {
        let imageTitleCond = variant.pageContent?.imageTitle;
        if (imageTitleCond) {
            let found = document.evaluate(`//img[@title="${imageTitleCond}"]`, document).iterateNext();
            if (!found) return false;
        }
        let imageFilenameCond = variant.pageContent?.imageFilename;
        if (imageFilenameCond) {
            let found = document.evaluate(`//img[contains(@src, "/${imageFilenameCond}.gif")]`, document).iterateNext();
            if (!found) return false;
        }
    }
    return true;
}

function matchAdventureChoice(adventure, choiceText, optionNum) {
    let choiceTextMatch = adventure?.choiceText?.[choiceText];
    if (choiceTextMatch) return choiceTextMatch;

    let optionNumMatch = adventure?.optionNum?.[optionNum];
    if (optionNumMatch) return optionNumMatch;

    return null;
}

function drawCombBeachGrid() {
    let evaluateResult = document.evaluate('//img[@title="rough sand"]', document);
    let imgs = [];
    let elem = evaluateResult.iterateNext();
    while (elem) {
        imgs.push(elem);
        elem = evaluateResult.iterateNext();
    }
    for (let img of imgs) {
        img.style.boxSizing = "border-box";
        img.style.border = "1px solid";
    }
}