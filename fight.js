function handleFight() {
    addPriceToAdventureRewardItems();

    bindKey("-", () => document.getElementById("button11")?.click());

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