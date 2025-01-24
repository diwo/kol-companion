function handleGamePage() {
    registerCommandReceiver();

    let companionpane = document.getElementById("companionpane");
    if (companionpane) {
        initCompanionPane();
    } else {
        companionpane = document.createElement("frame");
        companionpane.id = "companionpane";
        companionpane.name = "companionpane";
        companionpane.onload = initCompanionPane;
        companionpane.src = browser.runtime.getURL("companionpane.html");
        document.getElementById("rootset").appendChild(companionpane);
    }

    let chatpane = getPane("chatpane", {returnFrame: true});
    chatpane.contentWindow.addEventListener("contextmenu", handleEventToggleCompanionPane);
    chatpane.onload = () => chatpane.contentWindow.addEventListener("contextmenu", handleEventToggleCompanionPane);
}

function registerCommandReceiver() {
    let windowId = randomId();
    setWindowId(windowId);

    let commandListener = browser.runtime.connect({name: "commandListener"});
    commandListener.onMessage.addListener(message => {
        if (message.windowId != windowId) return;
        if (message.command == "gotoUrl") {
            getPane("mainpane").location = message.url;
        } else if (message.command == "chooseIcon") {
            let editForm = getPane("menupane", {id: "edit"});
            if (editForm) {
                let imgElem = editForm.ownerDocument.evaluate(".//img", editForm).iterateNext();
                imgElem.src = `https://d2uyhvukfffg5a.cloudfront.net/itemimages/${message.iconName}.gif`;
                editForm.icon.value = message.iconName;
            }
        }
    });
}

function initCompanionPane() {
    setWindowId(getWindowId(), {window: getPane("companionpane")});

    getPane("companionpane").addEventListener("contextmenu", handleEventToggleCompanionPane);

    getPane("companionpane", {id: "until-turn-clear"}).addEventListener("click", () => setCompanionPaneText("until-turn"));
    getPane("companionpane", {id: "while-text-clear"}).addEventListener("click", () => setCompanionPaneText("while-text"));
    getPane("companionpane", {id: "after-adv-cmd-clear"}).addEventListener("click", () => setCompanionPaneText("after-adv-cmd"));
    getPane("companionpane", {id: "after-adv-cmd-text-clear"}).addEventListener("click", () => setCompanionPaneText("after-adv-cmd-text"));

    getPane("companionpane", {id: "mine-gold"}).addEventListener("click", mineGold);
    getPane("companionpane", {id: "farm-dust-bunnies"}).addEventListener("click", farmDustBunnies);
    getPane("companionpane", {id: "re-adventure"}).addEventListener("click", readventure);

    getPane("companionpane", {id: "preset-soulfood"}).addEventListener("click",
        () => applyPreset({whileText: "", afterAdvCmd: "/cast 20 Soul Food", afterAdvCmdText: "Soulsauce:	100"}));
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

async function mineGold() {
    let ctx = start();
    if (!ctx) return stop();

    let resultElem = getPane("companionpane", {id: "mine-gold-result"});

    try {
        let isDone = async () => await exec(ctx, getTurnsUseRemaining) == 0;
        while (!await isDone()) {
            if (shouldSpendMpBuff() && isMpAlmostFull()) {
                await sendCommandWithPause("/buff", 3000);
            }
            if (shouldStopMpFull() && isMpAlmostFull()) {
                resultElem.innerText = "MP Full";
                return stop();
            }

            let mainDoc = getPane("mainpane").document;
            let pathname = getPathName(mainDoc);
            if (pathname == "/mining.php") {
                resultElem.innerText = "Running";
                mainDoc.dispatchEvent(new Event("mine-gold-auto"));
                await sleep(600, ctx);
            } else {
                resultElem.innerText = "Waiting";
                await sleep(1000, ctx);
            }
        }
        resultElem.innerText = "Finished";
    } catch (e) {
        resultElem.innerText = e;
        console.log(e);
    }
    stop();
}

async function farmDustBunnies() {
    let ctx = start();
    if (!ctx) return stop();

    let resultElem = getPane("companionpane", {id: "farm-dust-bunnies-result"});

    try {
        let isDone = async () => await exec(ctx, getTurnsUseRemaining) < 2;
        while (!await isDone()) {
            if (shouldSpendMpBuff() && isMpAlmostFull()) {
                await sendCommandWithPause("/buff", 3000);
            }
            if (shouldStopMpFull() && isMpAlmostFull()) {
                resultElem.innerText = "MP Full";
                return stop();
            }

            resultElem.innerText = "Running";
            await exec(ctx, sequence([
                withDelay(() => goto("/place.php?whichplace=monorail&action=monorail_downtown")),
                withDelay(() => clickButton(/Factory District Stop/)),
                withDelay(() => clickButton(/Visit some empty buildings/)),
                // withDelay(() => clickButton(/Nevermind/), 2000),
            ]));
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
        let isDone = async () => !await exec(ctx, checkQuestTextMatch) || await exec(ctx, getTurnsUseRemaining) <= 0;
        while (!await isDone()) {
            let mainpane = getPane("mainpane");
            let isCombat = !!mainpane.document.evaluate("//td/b[text()='Combat!']", mainpane.document).iterateNext();
            let mainpaneText = mainpane.document.firstChild?.innerText;
            if (!mainpaneText) {
                await sleep(200, ctx);
                continue;
            }
            let isAdventureEnd = mainpane.document.firstChild.innerText.match(/Adventure Again/);

            if (isAdventureEnd) {
                if (shouldSpendMpBuff() && isMpAlmostFull()) {
                    await sendCommandWithPause("/buff", 3000);
                }
                if (shouldStopMpFull() && isMpAlmostFull()) {
                    resultElem.innerText = "MP Full";
                    return stop();
                }
                if (shouldStopMpLow() && isMpLow()) {
                    resultElem.innerText = "MP Low";
                    return stop();
                }

                resultElem.innerText = "Running";
                if (getWhileText() || await exec(ctx, getTurnsUseRemaining) <= 2) {
                    await sleep(500, ctx);
                }
                if (!await isDone()) {
                    await sendAfterAdventureCommand();
                    await exec(ctx, withDelay(goLastAdventure, 1000));
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
    let useSteal = getPane("companionpane", {id: "use-steal"}).checked;
    let useStun = getPane("companionpane", {id: "use-stun"}).checked;
    let actions = [];

    if (useSteal) {
        actions.push(() => clickButton(/Pick .* Pocket/));
    }
    if (useStun) {
        actions.push(useSkill(/Accordion Bash/));
        actions.push(useSkill(/Entangling Noodles/));
        actions.push(useSkill(/Soul Bubble/));
    }
    if (isHpLow()) {
        actions.push(useItem(/New Age healing crystal/));
    }
    if (useSteal) {
        actions.push(() => clickButton(/Steal Accordion/));
    }
    actions.push(useAttackCombatAction);

    return sequence(actions, {stopOnSuccess: true});
}

function useAttackCombatAction() {
    let enemyName = getEnemyName();
    switch (enemyName) {
        case "Section 11":
            return usePhysicalAttackCombatAction();
        case "spectre of war":
        case "pumpkin spice wraith":
            return useElementalAttackCombatAction();
    }
    return useGeneralAttackCombatAction();
}

function usePhysicalAttackCombatAction() {
    return sequence([
        useSkill(/Weapon of the Pastalord/),
        useSkill(/Curse of Marinara/),
        () => clickButton(/Attack with/),
    ], {stopOnSuccess: true});
}

function useElementalAttackCombatAction() {
    return sequence([
        useSkill(/Saucestorm/),
        useSkill(/Cannelloni Cannon/),
        useSkill(/Bawdy Refrain/),
    ], {stopOnSuccess: true});
}

function useGeneralAttackCombatAction() {
    return sequence([
        useSkill(/Saucestorm/),
        useSkill(/Cannelloni Cannon/),
        () => clickButton(/Attack with/),
    ], {stopOnSuccess: true});
}

function useSkill(skillName) {
    return sequence([
        () => select("whichskill", skillName),
        () => clickButton(/Use Skill/),
    ], {stopOnError: true});
}

function useItem(itemName) {
    return sequence([
        () => select("whichitem", itemName),
        () => clickButton(/Use Item/),
    ], {stopOnError: true});
}

function chooseAdventureOption() {
    return sequence([
        chooseSpookyForestOption(),
        chooseDungeonsOfDoomOption(),
        chooseSouthOfBorderOption(),
        choosePFAirshipOption(),
        chooseExtremeSlopeOption(),
        chooseCastleSkyTopOption(),
        chooseDailyDungeonOption(),
        chooseHauntedBathroomOption(),
        chooseHauntedGalleryOption(),
        chooseBlackForestOption(),
        chooseOvergrownLotOption(),
        chooseCrimbo2024Option(),
    ], {stopOnSuccess: true});
}

function chooseSpookyForestOption() {
    return sequence([
        // 15: The Spooky Forest
        () => clickButtonIfPageText(/Arboreal Respite/, /Explore the stream/),
        () => clickButtonIfPageText(/Consciousness of a Stream/, /Squeeze into the cave/),
    ], {stopOnSuccess: true});
}

function chooseDungeonsOfDoomOption() {
    return sequence([
        // 39: The Dungeons of Doom
        () => clickButtonIfPageText(/Ouch! You bump into a door!/, /Leave without buying anything/),
    ], {stopOnSuccess: true});
}

function chooseSouthOfBorderOption() {
    return sequence([
        // 45: South of The Border
        () => clickButtonIfPageText(/Finger-Lickin'... Death./, /Walk away in disgust/),
    ], {stopOnSuccess: true});
}

function choosePFAirshipOption() {
    return sequence([
        // 81: The Penultimate Fantasy Airship
        () => clickButtonIfPageText(/Random Lack of an Encounter/, /Check the cargo hold/),
        () => clickButtonIfPageText(/Hammering the Armory/, /Blow this popsicle stand/),
    ], {stopOnSuccess: true});
}

function chooseExtremeSlopeOption() {
    return sequence([
        // 273: The eXtreme Slope
        () => clickButtonIfPageText(/Yeti Nother Hippy/, /Negotiate his release/),
        () => clickButtonIfPageText(/Saint Beernard/, /Ask for some beer, first/),
        () => clickButtonIfPageText(/Generic Teen Comedy Snowboarding Adventure/, /Offer to help him cheat/),
        () => clickButtonIfPageText(/Duffel on the Double/, /Dig deeper/),
        () => clickButtonIfPageText(/Duffel on the Double/, /Scram/),
    ], {stopOnSuccess: true});
}

function chooseCastleSkyTopOption() {
    return sequence([
        // 324: The Castle in the Clouds in the Sky (Top Floor)
        () => clickButtonIfPageText(/Flavor of a Raver/, /Check Behind the Giant Poster/),
        () => clickButtonIfPageText(/Yeah, You're for Me, Punk Rock Giant/, /Check behind the trash can/),
        () => clickButtonIfPageText(/Copper Feel/, /Go through the Crack/),
        () => clickButtonIfPageText(/Melon Collie and the Infinite Lameness/, /Snag some Candles/),
    ], {stopOnSuccess: true});
}

function chooseDailyDungeonOption() {
    return sequence([
        // 325: The Daily Dungeon
        () => clickButtonIfPageText(/In the (5|10)th chamber of the Daily Dungeon/, /Go through the boring door/),
        () => clickButtonIfPageText(/In the (5|10)th chamber of the Daily Dungeon/, /Ignore the chest/),
        () => clickButtonIfPageText(/In the 15th and final chamber of the Daily Dungeon/, /Open it!/),
        () => clickButtonIfPageText(/It's Almost Certainly a Trap/, /Use your eleven-foot pole/),
        () => clickButtonIfPageText(/I Wanna Be a Door/, /Use your lockpicks/),
        () => clickButtonIfPageText(/I Wanna Be a Door/, /Use a skeleton key/),
    ], {stopOnSuccess: true});
}

function chooseHauntedBathroomOption() {
    return sequence([
        // 392: The Haunted Bathroom
        () => clickButtonIfPageText(/Having a Medicine Ball/, /Open it and see what's inside/),
        () => clickButtonIfPageText(/Bad Medicine is What You Need/, /Take off/),
        () => clickButtonIfPageText(/Off the Rack/, /Take the towel/),
        () => clickButtonIfPageText(/Lights Out in the Bathroom/, /Fumble Your Way to the Door/),
    ], {stopOnSuccess: true});
}

function chooseHauntedGalleryOption() {
    return sequence([
        // 394: The Haunted Gallery
        () => clickButtonIfPageText(/Louvre It or Leave It/, /Pass on by/),
        () => clickButtonIfPageText(/Out in the Garden/, /None of the above/),
        () => clickButtonIfPageText(/Lights Out in the Gallery/, /Quit the Gallery/),
    ], {stopOnSuccess: true});
}

function chooseBlackForestOption() {
    return sequence([
        // 405: The Black Forest
        () => clickButtonIfPageText(/All Over the Map/, /Go to the black gold mine/),
        () => clickButtonIfPageText(/Be Mine/, /Go left/),
    ], {stopOnSuccess: true});
}

function chooseOvergrownLotOption() {
    return sequence([
        // 441: The Overgrown Lot
        () => clickButtonIfPageText(/Lots of Options/, /Follow the booze map/),
        () => clickButtonIfPageText(/Lots of Options/, /Look through the cardboard boxes/),
    ], {stopOnSuccess: true});
}

function chooseCrimbo2024Option() {
    return sequence([
        // Crimbo 2024
        () => clickButtonIfPageText(/The Eggdump/, /Dig through the eggs/),
        () => clickButtonIfPageText(/Snakes in the Grasses/, /See what's under the snakes/),
        () => clickButtonIfPageText(/War is Like Hell: Very Hot/, /Bravely explore/),
        () => clickButtonIfPageText(/The Edge of Winter/, /Venture into the cold/),
        () => clickButtonIfPageText(/The Malevolent Spirit of the Holiday/, /Explore the spooky woods/),
    ], {stopOnSuccess: true});
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

function shouldStopMpLow() {
    return getPane("companionpane", {id: "stop-mp-low"}).checked;
}

function getTurnsUseRemaining() {
    return withRetry(() => {
        let untilTurnElem = getPane("companionpane", {id: "until-turn"});
        let untilTurn = parseInt(untilTurnElem.value) || 0;
        return getTurns() - untilTurn;
    });
}

function checkQuestTextMatch() {
    return withRetry(() => {
        let charpaneText = getPane("charpane").document.body.innerText;
        return charpaneText.match(getWhileText());
    });
}

function getWhileText() {
    return getPane("companionpane", {id: "while-text"}).value;
}

async function sendAfterAdventureCommand() {
    let cmd = getPane("companionpane", {id: "after-adv-cmd"}).value;
    if (cmd) {
        let textPattern = getPane("companionpane", {id: "after-adv-cmd-text"}).value;
        if (textPattern) {
            let mainpaneText = getPane("mainpane").document.firstChild.innerText;
            let charpaneText = getPane("charpane").document.firstChild.innerText;
            let textIncludes = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());
            if (!textIncludes(mainpaneText, textPattern) && !textIncludes(charpaneText, textPattern)) {
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

function sequence(actions, {stopOnError, stopOnSuccess} = {}) {
    return async ctx => {
        let result = null;
        for (let action of actions) {
            result = await exec(ctx, stoppable(action));
            await sleep(0, ctx);
            if (stopOnError && !result) return false;
            if (stopOnSuccess && result) return result;
        }
        return !!result;
    };
}

function withRetry(action, {delay, maxRetry} = {}) {
    if (!delay) delay = 200;
    if (!maxRetry) maxRetry = 5;

    return async ctx => {
        let wrappedAction = async ctx => ({value: await exec(ctx, action)});
        let result = await exec(ctx, stoppable(wrappedAction)).catch(() => false);
        let retryCount = 0;
        while (!result && retryCount < maxRetry) {
            // console.log(`Retrying ${retryCount} of ${maxRetry}`);
            await sleep(delay, ctx);
            result = await exec(ctx, stoppable(wrappedAction)).catch(() => false);
            retryCount += 1;
        }
        return result.value;
    };
}

function withDelay(action, delay = 600) {
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
