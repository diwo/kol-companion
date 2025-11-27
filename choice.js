function handleChoice() {
    addPriceToAdventureRewardItems();
    handleChoiceTrickOrTreat();
    drawCombBeachGrid();
}

async function addAdventureChoiceNotes() {
    let buttons = evaluateToNodesArray("//form//input[@type='submit']");
    if (!buttons.length) {
        return;
    }

    let adventureData = await getAdventureData();

    for (let button of buttons) {
        let adventureName = document.evaluate(
            "./ancestor::table/tbody/tr[1]/td[1][@align='center']/b",
            button).iterateNext()?.innerText;
        let choiceText = button.value;

        // TODO: search from form ancestor element
        let optionNum = parseInt(document.evaluate(
            "./input[@name='option']",
            button.parentElement).iterateNext()?.value || 0);
        let bandersnatch = document.evaluate(
            "./input[@name='bandersnatch']",
            button.parentElement).iterateNext()?.value;

        let adventure = adventureData[adventureName];
        if (!adventure) adventure = adventureData["*"];

        let choice = matchAdventureChoice(adventure, choiceText, optionNum, bandersnatch);
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

async function getAdventureData() {
    try {
        let fetchResponse = await fetch(browser.runtime.getURL("data/choices.json"));
        let json = await fetchResponse.json();

        let pathname = getPathName();
        let activeElems = json.filter(elem => !elem.url || elem.url == pathname);

        let adventureEntries = activeElems.map(elem => Object.entries(elem.adventures)).flat();
        adventureEntries = adventureEntries.map(entry => {
            let [name, adv] = entry;
            if (adv.variants) return adv.variants.map(v => [name, v]);
            return [entry];
        }).flat();
        adventureEntries = adventureEntries.filter(([_, adv]) => isAdventureConditionMatch(adv));

        return adventureEntries.reduce((acc, [name, adventure2]) => {
            let adventure1 = acc[name];
            let mergedAdventure;
            if (adventure1) {
                let choiceText1 = adventure1.choiceText || {};
                let choiceText2 = adventure2.choiceText || {};
                let mergedChoiceText = {...choiceText1, ...choiceText2};
                mergedAdventure = {...adventure1, ...adventure2, choiceText: mergedChoiceText};
            } else {
                mergedAdventure = adventure2;
            }
            return {...acc, [name]: mergedAdventure};
        }, {});
    } catch (e) {
        console.error(e);
        return {};
    }
}

function isAdventureConditionMatch(adventure) {
    let pageContentCond = adventure?.pageContent;
    if (pageContentCond) {
        let imageTitleCond = adventure.pageContent?.imageTitle;
        if (imageTitleCond) {
            let found = document.evaluate(`//img[@title="${imageTitleCond}"]`, document).iterateNext();
            if (!found) return false;
        }
        let imageFilenameCond = adventure.pageContent?.imageFilename;
        if (imageFilenameCond) {
            let found = document.evaluate(`//img[contains(@src, "/${imageFilenameCond}.gif")]`, document).iterateNext();
            if (!found) return false;
        }
    }
    return true;
}

function matchAdventureChoice(adventure, choiceText, optionNum, bandersnatch) {
    let choiceTextMatch = adventure?.choiceText?.[choiceText];
    if (choiceTextMatch) return choiceTextMatch;

    let optionNumMatch = adventure?.optionNum?.[optionNum];
    if (optionNumMatch) return optionNumMatch;

    let bandersnatchMatch = adventure?.bandersnatch?.[bandersnatch];
    if (bandersnatchMatch) return bandersnatchMatch;

    return null;
}

function handleChoiceTrickOrTreat() {
    let autoTrickOrTreat = getPane("companionpane", {id: "auto-trick-or-treat"})?.checked;
    let autoOrBindKey = action => {
        if (autoTrickOrTreat) return action();
        bindKey("`", action);
    };

    if (evaluateToNodesArray("//tr/td/b[text() = 'Trick or Treat!']")[0]) {
        let starhouse = evaluateToNodesArray("//img[@title = 'A House with a Star on it!']")[0];
        if (starhouse) {
            starhouse.style.boxSizing = "border-box";
            starhouse.style.border = "3px solid orange";
        }

        let nextHouseLink = null;
        for (let loopType of ["star", "light", "dark"]) {
            for (let i=0; i<12; i++) {
                let house = document.getElementById("house" + i);
                let link = house && evaluateToNodesArray("./a", {contextNode: house})[0];
                let isStar = link && !!evaluateToNodesArray("./img[contains(@src, 'starhouse')]", {contextNode: link})[0];
                let isLit = link && !!evaluateToNodesArray("./img[contains(@src, 'house_l')]", {contextNode: link})[0];
                let isChosen = link && (isStar || (loopType == "light" && isLit) || loopType == "dark");
                if (isChosen) {
                    nextHouseLink = link;
                    break;
                }
            }
            if (nextHouseLink) break;
        }
        if (nextHouseLink) {
            autoOrBindKey(() => nextHouseLink.click());
        } else if (!evaluateToNodesArray("//span[text() = \"You don't have enough time to scope out another block.\"]")[0]) {
            autoOrBindKey(() => clickButton("Scope out a new block"));
        }
    }
    else if (evaluateToNodesArray("//tr/td/b[text() = 'A Fun-Size Dilemma']")[0]) {
        autoOrBindKey(() => clickButton("Take the whole bowl"));
    }
    else {
        autoOrBindKey(() => clickLink("Back to Trick-or-Treating"));
    }
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