function handleFight() {
    let autoFight = getPane("companionpane", {id: "auto-fight"})?.checked;
    let autoFightCombatMacro = getPane("companionpane", {id: "combat-macro"})?.value;
    let whichmacro = document.getElementsByName("whichmacro")[0];
    if (autoFight && autoFightCombatMacro && whichmacro) {
        let optionValue = evaluateToNodesArray(`./option[text() = '${autoFightCombatMacro}']`, {contextNode: whichmacro})[0]?.value;
        if (optionValue) {
            whichmacro.value = optionValue;
            clickButton(/Execute Macro/);
        }
    }

    let autoTrickOrTreat = getPane("companionpane", {id: "auto-trick-or-treat"})?.checked;
    if (autoTrickOrTreat) clickLink(/Back to Trick-or-Treating/);

    clickLink(/jump to final round/);
    addPriceToAdventureRewardItems();

    bindKey("-", () => document.getElementById("button11")?.click());
    bindKey("`", () => {
        clickLink(/Back to Trick-or-Treating/);
    });

    document.addEventListener("wheel", e => {
        if (!e.shiftKey) return;
        e.preventDefault();

        let topbar = document.getElementById("topbar");
        let actionBarUpButton = document.evaluate(".//img[@class='updown' and contains(@src, '/tinyup.gif')]", topbar).iterateNext();
        let actionBarDownButton = document.evaluate(".//img[@class='updown' and contains(@src, '/tinydown.gif')]", topbar).iterateNext();

        if (e.deltaY < 0) actionBarUpButton.click();
        if (e.deltaY > 0) actionBarDownButton.click();
    });
}