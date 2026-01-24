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
    companionpane.addEventListener("mouseenter", () => {
        clearTimeout(companionpane.hoverTimeout);
        companionpane.hoverTimeout = null;
    });
    companionpane.addEventListener("mouseleave", hideCompanionPane);

    let chatpane = getPane("chatpane", {returnFrame: true});
    let bindChatpaneEvents = () => {
        chatpane.contentWindow.addEventListener("mousemove", event => {
            let offsetRight = chatpane.contentWindow.innerWidth - event.clientX;
            if (!isCompanionPaneVisible() && offsetRight < 10) {
                showCompanionPane();
                clearTimeout(companionpane.hoverTimeout);
                companionpane.hoverTimeout = setTimeout(() => {
                    companionpane.hoverTimeout = null;
                    hideCompanionPane();
                }, 10);
            }
        });
    };
    chatpane.onload = bindChatpaneEvents;
    bindChatpaneEvents();
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

    getPane("companionpane").addEventListener("contextmenu", handleCompanionPaneTogglePin);

    getPane("companionpane", {id: "combat-macro-clear"}).addEventListener("click", () => setCompanionPaneText("combat-macro"));
    getPane("companionpane", {id: "until-turn-clear"}).addEventListener("click", () => setCompanionPaneText("until-turn"));

    getPane("companionpane", {id: "mine-gold"}).addEventListener("click", mineGold);
    getPane("companionpane", {id: "farm-dust-bunnies"}).addEventListener("click", farmDustBunnies);

    getPane("companionpane", {id: "preset-crimbo"}).addEventListener("click",
        () => applyPreset({combatMacro: "Crimbo"}));
}

function handleCompanionPaneTogglePin(event) {
    event.preventDefault();
    let companionpane = document.getElementById("companionpane");
    companionpane.pinned = !companionpane.pinned;
    if (!companionpane.pinned) hideCompanionPane();
}

function isCompanionPaneVisible() {
    let rootset = document.getElementById("rootset");
    return rootset.getAttribute("cols").split(",").length > 3;
}

function showCompanionPane() {
    if (!isCompanionPaneVisible()) {
        let rootset = document.getElementById("rootset");
        let cols = rootset.getAttribute("cols");
        rootset.setAttribute("cols", cols + ",200");
    }
}

function hideCompanionPane() {
    let companionpane = document.getElementById("companionpane");
    if (isCompanionPaneVisible() && !companionpane.pinned) {
        let rootset = document.getElementById("rootset");
        let cols = rootset.getAttribute("cols");
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
        let isDone = () => {
            let text = getPane("mainpane").document?.firstChild?.innerText;
            let isOutOfAdventures = !!text?.match(/You're out of adventures/);
            let isTooDrunk = !!text?.match(/You're way too drunk to mine right now/);
            return isOutOfAdventures || isTooDrunk;
        };
        while (!isDone()) {
            let mainDoc = getPane("mainpane").document;
            let isBeatenUp = !!mainDoc?.firstChild?.innerText?.match(/You're way too beaten up to mine right now/);
            if (getPathName(mainDoc) == "/mining.php" && !isBeatenUp) {
                resultElem.innerText = "Running";
                mainDoc.dispatchEvent(new Event("mine-gold-auto"));
                await sleep(100, ctx);
            } else {
                resultElem.innerText = "Waiting";
                await sleep(1000, ctx);
            }
        }
        getPane("mainpane").document.dispatchEvent(new Event("mine-gold-auto"));
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

function setCompanionPaneText(elemId, newText = "") {
    getPane("companionpane", {id: elemId}).value = newText;
}

function applyPreset({combatMacro} = {}) {
    setCompanionPaneText("combat-macro", (combatMacro || ""));
}

function getTurnsUseRemaining() {
    return withRetry(() => {
        let untilTurnElem = getPane("companionpane", {id: "until-turn"});
        let untilTurn = parseInt(untilTurnElem.value) || 0;
        let remainTurns = getTurns();
        if (remainTurns == null) throw Error();
        return remainTurns - untilTurn;
    });
}

function goto(page) {
    let url = page.startsWith("/") ? getBaseUrl() + page : page;
    console.log(`Goto ${url}`);
    getPane("mainpane").location = url;
    return true;
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

    throwIfStopped(ctx);
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
