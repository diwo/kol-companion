function handleGamePage() {
    let companionpane = document.getElementById("companionpane");
    if (!companionpane) {
        companionpane = document.createElement("frame");
        companionpane.name = "companionpane";
        companionpane.onload = setupCompanionPane;
        companionpane.src = browser.runtime.getURL("companionpane.html");
        document.getElementById("rootset").appendChild(companionpane);
    }

    let chatpane = getPane("chatpane", {returnFrame: true});
    chatpane.onload = () => {
        chatpane.contentWindow.removeEventListener("contextmenu", handleEventToggleCompanionPane);
        chatpane.contentWindow.addEventListener("contextmenu", handleEventToggleCompanionPane);
    };
}

function setupCompanionPane() {
    getPane("companionpane").addEventListener("contextmenu", handleEventToggleCompanionPane);

    getPane("companionpane", {id: "until-turn-clear"}).addEventListener("click", () => setCompanionPaneText("until-turn"));
    getPane("companionpane", {id: "while-text-clear"}).addEventListener("click", () => setCompanionPaneText("while-text"));
    getPane("companionpane", {id: "after-adv-cmd-clear"}).addEventListener("click", () => setCompanionPaneText("after-adv-cmd"));
    getPane("companionpane", {id: "after-adv-cmd-text-clear"}).addEventListener("click", () => setCompanionPaneText("after-adv-cmd-text"));

    getPane("companionpane", {id: "farm-dust-bunnies"}).addEventListener("click", farmDustBunnies);
    getPane("companionpane", {id: "re-adventure"}).addEventListener("click", readventure);

    getPane("companionpane", {id: "preset-hospital"}).addEventListener("click",
        () => applyPreset({whileText: "", afterAdvCmd: "/closet 1 head mirror", afterAdvCmdText: "pygmy witch surgeon"}));

    // getPane("companionpane", {id: "test-button"})
    //     .addEventListener("click", async () => {
    //         // sortInventory();
    //     });
}

function handleEventToggleCompanionPane(event) {
    event.preventDefault();

    let rootset = document.getElementById("rootset");
    let cols = rootset.getAttribute("cols");
    let colsSplit = cols.split(",");
    if (colsSplit.length == 3) {
        rootset.setAttribute("cols", cols + ",200");
    } else {
        let colsFirstThree = cols.split(",").splice(0,3).join(",");
        rootset.setAttribute("cols", colsFirstThree);
    }
}

let startTimestamp = Date.now();
let stopTimestamp = Date.now();

function start() {
    if (stopTimestamp >= startTimestamp) {
        startTimestamp = Date.now();
        return {stopTimestamp};
    }
    return false;
}

function stop() {
    stopTimestamp = Date.now();
}

async function farmDustBunnies() {
    let ctx = start();
    if (!ctx) return stop();

    let resultElem = getPane("companionpane", {id: "farm-dust-bunnies-result"});

    try {
        while (!(await isTurnCountReached(ctx, {minTurn: 1}))) {
            if (isMpAlmostFull()) {
                if (shouldSpendMpBuff()) {
                    await sendCommandWithPause("/buff", 3000);
                }
                if (shouldStopMpFull() && isMpAlmostFull()) {
                    resultElem.innerText = "MP Full";
                    return stop();
                }
            }

            resultElem.innerText = `Running`;
            await exec(ctx, sequence([
                withDelay(() => goto("/place.php?whichplace=monorail&action=monorail_downtown")),
                withDelay(() => clickButton(/Factory District Stop/)),
                withDelay(() => clickButton(/Visit some empty buildings/)),
            ], {ignoreErrors: true}));
        }
        resultElem.innerText = "Finished";
    } catch (e) {
        resultElem.innerText = e;
        console.log(e);
    }
    stop();
}

async function readventure() {
    let ctx = start();
    if (!ctx) return stop();

    let resultElem = getPane("companionpane", {id: "re-adventure-result"});

    try {
        let isContinue = async () => !(await isTurnCountReached(ctx)) && isQuestTextMatch();
        while (await isContinue()) {
            let mainpane = getPane("mainpane");
            let isCombat = !!mainpane.document.evaluate("//td/b[text()='Combat!']", mainpane.document).iterateNext();
            let isAdventureEnd = mainpane.document.firstChild.innerText.match(/Adventure Again/);

            if (isAdventureEnd && isMpAlmostFull()) {
                if (shouldSpendMpBuff()) {
                    await sendCommandWithPause("/buff", 3000);
                }
                if (shouldStopMpFull() && isMpAlmostFull()) {
                    resultElem.innerText = "MP Full";
                    return stop();
                }
            }
            
            if (isAdventureEnd) {
                resultElem.innerText = "Running";
                await sleep(300, ctx);
                if (await isContinue()) {
                    await sendAfterAdventureCommand();
                    await exec(ctx, withDelay(goLastAdventure));
                }
            } else if (isCombat) {
                resultElem.innerText = "Running";
                await exec(ctx, withDelay(useCombatAction));
            } else {
                let success = await exec(ctx, withDelay(chooseAdventureOption));
                if (!success) {
                    resultElem.innerText = "Waiting";
                    await sleep(1000, ctx);
                }
            }
        }
        await sendAfterAdventureCommand();
        resultElem.innerText = "Finished";
    } catch (e) {
        resultElem.innerText = e;
        console.log(e);
    }
    stop();
}

function setCompanionPaneText(elemId, newText = "") {
    getPane("companionpane", {id: elemId}).value = newText;
}

function applyPreset({whileText, afterAdvCmd, afterAdvCmdText} = {}) {
    setCompanionPaneText("while-text", (whileText || ""));
    setCompanionPaneText("after-adv-cmd", (afterAdvCmd || ""));
    setCompanionPaneText("after-adv-cmd-text", (afterAdvCmdText || ""));
}

function useCombatAction() {
    return sequence([
        () => clickButton(/Pick .* Pocket/),
        () => clickButton(/Steal Accordion/),
        useSkill(/Saucestorm/),
        useSkill(/Cannelloni Cannon/),
        () => clickButton(/Attack with/),
    ], {ignoreErrors: true, firstOnly: true});
}

function useSkill(skillName) {
    return sequence([
        () => select("whichskill", skillName),
        () => clickButton(/Use Skill/),
    ]);
}

function chooseAdventureOption() {
    return sequence([
        chooseDailyDungeonOption(),
        chooseBlackForestOption(),
        choosePFAirshipOption(),
        chooseHauntedGalleryOption(),
        chooseDungeonsOfDoomOption(),
    ], {ignoreErrors: true, firstOnly: true});
}

function chooseDailyDungeonOption() {
    return sequence([
        () => clickButtonIfPageText(/In the (5|10)th chamber of the Daily Dungeon/, /Go through the boring door/),
        () => clickButtonIfPageText(/In the (5|10)th chamber of the Daily Dungeon/, /Ignore the chest/),
        () => clickButtonIfPageText(/In the 15th and final chamber of the Daily Dungeon/, /Open it!/),
        () => clickButtonIfPageText(/It's Almost Certainly a Trap/, /Use your eleven-foot pole/),
        () => clickButtonIfPageText(/I Wanna Be a Door/, /Use your lockpicks/),
        () => clickButtonIfPageText(/I Wanna Be a Door/, /Use a skeleton key/),
    ], {ignoreErrors: true, firstOnly: true});
}

function chooseBlackForestOption() {
    return sequence([
        // The Black Forest
        () => clickButtonIfPageText(/All Over the Map/, /Go to the black gold mine/),
        () => clickButtonIfPageText(/Be Mine/, /Go left/),
    ], {ignoreErrors: true, firstOnly: true});
}

function choosePFAirshipOption() {
    return sequence([
        // Penultimate Fantasy Airship
        () => clickButtonIfPageText(/Random Lack of an Encounter/, /Check the cargo hold/),
        () => clickButtonIfPageText(/Hammering the Armory/, /Blow this popsicle stand/),
    ], {ignoreErrors: true, firstOnly: true});
}

function chooseHauntedGalleryOption() {
    return sequence([
        // The Haunted Gallery
        () => clickButtonIfPageText(/Louvre It or Leave It/, /Pass on by/),
        () => clickButtonIfPageText(/Out in the Garden/, /None of the above/),
        () => clickButtonIfPageText(/Lights Out in the Gallery/, /Quit the Gallery/),
    ], {ignoreErrors: true, firstOnly: true});
}

function chooseDungeonsOfDoomOption() {
    return sequence([
        // The Dungeons of Doom
        () => clickButtonIfPageText(/Ouch! You bump into a door!/, /Leave without buying anything/),
    ], {ignoreErrors: true, firstOnly: true});
}

function clickButtonIfPageText(pageTextPattern, buttonTextPattern) {
    let mainDoc = getPane("mainpane").document;
    if (mainDoc.firstChild.innerText.match(pageTextPattern)) {
        return clickButton(buttonTextPattern);
    }
    return false;
}

function shouldSpendMpBuff() {
    return getPane("companionpane", {id: "spend-mp-buff"}).checked;
}

function shouldStopMpFull() {
    return getPane("companionpane", {id: "stop-mp-full"}).checked;
}

async function isTurnCountReached(ctx, {minTurn} = {}) {
    if (!minTurn) minTurn = 0;

    let untilTurnElem = getPane("companionpane", {id: "until-turn"});
    let untilTurn = parseInt(untilTurnElem.value) || minTurn;
    let turnsRemaining = await getTurnsWithRetry()(ctx);
    return turnsRemaining <= untilTurn;
}

function getTurnsWithRetry() {
    return async ctx => {
        let result = await withRetry(() => ({turns: getTurns()}))(ctx);
        return result.turns;
    };
}

function isQuestTextMatch() {
    let whileTextElem = getPane("companionpane", {id: "while-text"});
    let charpaneText = getPane("charpane").document.body.innerText;
    return charpaneText.match(whileTextElem.value);
}

async function sendAfterAdventureCommand() {
    let cmd = getPane("companionpane", {id: "after-adv-cmd"}).value;
    if (cmd) {
        let textPattern = getPane("companionpane", {id: "after-adv-cmd-text"}).value;
        if (textPattern) {
            let text = getPane("mainpane").document.firstChild.innerText;
            if (!text.toLowerCase().includes(textPattern.toLowerCase())) {
                return;
            }
        }
        await sendCommandWithPause(cmd, 1000);
    }
}

async function sendCommandWithPause(cmd, delay) {
    await sendCommand(cmd);
    await sleep(delay);
}

function goto(page) {
    const baseUrl = "https://www.kingdomofloathing.com";
    let url = page.startsWith("/") ? baseUrl + page : page;
    console.log(`Goto ${url}`);
    getPane("mainpane").location = url;
    return true;
}

function goLastAdventure() {
    let charpaneDoc = getPane("charpane").document;
    let labelNode = charpaneDoc.evaluate("//a[contains(text(), 'Last Adventure')]", charpaneDoc).iterateNext();
    if (labelNode) {
        console.log(`Go last adventure`);
        let adventureLink = charpaneDoc.evaluate(".//a", labelNode.parentNode.parentNode.parentNode.lastChild).iterateNext();
        adventureLink.click();
        return true;
    }
    return false;
}

function throwIfStopped(ctx) {
    if (ctx?.stopTimestamp && stopTimestamp > ctx.stopTimestamp) {
        throw "Stopped";
    }
}

async function exec(ctx, action) {
    let result = action;
    do {
        result = await result(ctx);
    } while (typeof result == "function");

    return result;
}

function stoppable(action) {
    return async ctx => {
        throwIfStopped(ctx);
        return exec(ctx, action);
    };
}

function sequence(actions, {ignoreErrors, firstOnly} = {}) {
    return async ctx => {
        let result = null;
        for (let action of actions) {
            result = await exec(ctx, stoppable(action));
            await sleep(0, ctx);
            if (!ignoreErrors && !result) {
                return false;
            }
            if (firstOnly && result) {
                return result;
            }
        }
        return !!result;
    };
}

function withRetry(action, {delay, maxRetry} = {}) {
    if (!delay) delay = 200;
    if (!maxRetry) maxRetry = 5;

    return async ctx => {
        let success = await exec(ctx, stoppable(action)).catch(() => false);
        let retryCount = 0;
        while (!success && retryCount < maxRetry) {
            // console.log(`Retrying ${retryCount} of ${maxRetry}`);
            await sleep(delay, ctx);
            success = await exec(ctx, stoppable(action)).catch(() => false);
            retryCount += 1;
        }
        return success;
    };
}

function withDelay(action, delay = 800) {
    return async ctx => {
        let result = await exec(ctx, stoppable(action));
        // if (delay > 0) console.log(`Sleeping ${delay}`);
        if (result) await sleep(delay, ctx);
        return result;
    };
}

function sleep(timeoutMilli, ctx, {checkInterval} = {}) {
    if (!checkInterval) checkInterval = 100;

    let racers = [new Promise(resolve => setTimeout(() => resolve(true), timeoutMilli))];
    if (timeoutMilli > checkInterval) {
        racers.push(rejectWhenStopped(checkInterval, ctx));
    }
    return Promise.race(racers);
}

async function rejectWhenStopped(checkInterval, ctx) {
    throwIfStopped(ctx);
    await sleep(checkInterval, ctx, {checkInterval});
    return rejectWhenStopped(checkInterval, ctx);
}
