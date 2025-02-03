function handleCharPane() {
    updateHpColor();
    updateMpColor();
    moveQuestCloseButton();
}

function updateHpColor() {
    if (isHpLow()) {
        getHpTextNode().style.color = "red";
    }
}

function updateMpColor() {
    if (isMpAlmostFull()) {
        getMpTextNode().style.color = "green";
    } else if (isMpLow()) {
        getMpTextNode().style.color = "red";
    }
}

function moveQuestCloseButton() {
    let localSheets = Array.from(document.styleSheets).filter(s => s.href == null);
    for (let sheet of localSheets) {
        for (let rule of sheet.cssRules) {
            if (rule.selectorText == "#nudges div .close") {
                rule.style.right = null;
                rule.style.left = "-10px";
            }
        }
    }
}