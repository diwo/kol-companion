function addWikiLinkToHeadings() {
    let pathname = getPathName();
    let evaluateResult = document.evaluate(
        "//table/tbody/tr[1]/td[1][@align='center']/node()[1]",document);

    let headingNodes = [];
    let headingNode = evaluateResult.iterateNext();
    while (headingNode) {
        if (headingNode.tagName == "B") {
            headingNodes.push(headingNode);
        }
        headingNode = evaluateResult.iterateNext();
    }

    for (let i=0; i<headingNodes.length; i++) {
        let wikiNodeId = `wiki${i}`;
        if (!document.getElementById(wikiNodeId)) {
            let wikiDiv = document.createElement("div");
            wikiDiv.innerHTML = `<a id="${wikiNodeId}" href="#" style="color: lightgrey">[wiki]</a>`;
            wikiDiv.style.display = "inline";
            wikiDiv.style.marginLeft = "5px";
            wikiDiv.style.fontSize = "0.8em";
            headingNodes[i].parentElement.appendChild(wikiDiv);

            let searchTerm = headingNodes[i].innerText;
            if (searchTerm.endsWith(":")) {
                searchTerm = searchTerm.replace(/:$/, "");
            }
            if (searchTerm.match(/Adventure Results/)) {
                let sectionBody = headingNodes[i].parentElement.parentElement.nextSibling;
                searchTerm = sectionBody.innerText.split('\n')[0];
            }
            if (pathname == "/fight.php") {
                searchTerm = getEnemyName();
            }
            document.getElementById(wikiNodeId).addEventListener("click", () => openWiki(searchTerm));
        }
    }
}

function getEnemyName() {
    let monnameNode = getPane("mainpane", {id: "monname"});
    return monnameNode.innerText.replace(/^(a|an|the|some) /, "");
}

async function editPageText() {
    const alphabet = Array.from(Array(26).keys()).map(n => String.fromCharCode("A".charCodeAt() + n)).join("");
    const xpathToLowercase = n => `translate(${n}, '${alphabet}', '${alphabet.toLowerCase()}')`;

    let fetchResponse = await fetch(browser.runtime.getURL("data/textedit.json"));
    let json = await fetchResponse.json();
    let pathname = getPathName();
    let lastAdventure = getLastAdventure();

    for (let rule of json) {
        let conditionsMatched = true;
        if (rule.conditions) {
            for (let condition of rule.conditions) {
                if (condition.url && condition.url != pathname) conditionsMatched = false;
                if (condition.lastAdventure && condition.lastAdventure != lastAdventure) conditionsMatched = false;
                if (condition.pageText && !document.body.innerText.match(RegExp(condition.pageText, "i"))) conditionsMatched = false;
            }
        }
        if (!conditionsMatched) continue;

        for (let edit of (rule.edits || [])) {
            if (!edit.text) continue;

            let matchedString = "$1";
            if (edit.highlight) {
                let style = typeof edit.highlight == "object" ? edit.highlight : { bold: true, box: true };
                matchedString = decorateTextWithStyle(matchedString, style);
            }

            let insertBefore = decorateTextWithStyle(edit.insertBefore?.text || "", edit.insertBefore?.style);
            let insertAfter = decorateTextWithStyle(edit.insertAfter?.text || "", edit.insertAfter?.style);
            let replaceString = insertBefore + matchedString + insertAfter;

            let matches = evaluateToNodesArray(
                `.//*[text()[contains(${xpathToLowercase(".")}, ${xpathToLowercase(`"${edit.text}"`)})]]`,
                {contextNode: document.body});
            for (let match of matches) {
                if (match.tagName == "SCRIPT" || match.tagName == "STYLE") continue;
                for (let node of match.childNodes) {
                    if (node.nodeType == Node.TEXT_NODE) {
                        let replacement = document.createElement("span");
                        replacement.innerText = node.textContent;
                        replacement.innerHTML = replacement.innerHTML.replaceAll(
                            RegExp(`(${edit.text})`, "ig"), replaceString);
                        node.parentNode.insertBefore(replacement, node);
                        node.remove();
                    }
                }
            }
        }
    }
}

function decorateTextWithStyle(text, style) {
    if (!style) return text;

    let css = style.css;
    if (!css) {
        let elem = document.createElement("span");
        if (style.bold) elem.style.fontWeight = "bold";
        if (style.underline) elem.style.textDecoration = "underline";
        if (style.color) elem.style.color = style.color;
        if (style.box) {
            let boxColor = typeof style.box == "string" ? style.box : "black";
            elem.style.border = `3px solid ${boxColor}`;
            elem.style.padding = "1px";
        }

        const parseValue = (val, unit) => {
            if (typeof val == "string") return val;
            if (typeof val == "number") return `${val}${unit}`;
            return null;
        };
        elem.style.marginLeft = parseValue(style.marginLeft, "px");
        elem.style.marginRight = parseValue(style.marginRight, "px");
        elem.style.fontSize = parseValue(style.fontSize, "em");

        css = elem.getAttribute("style");
    }

    return `<span style="${css}">${text}</span>`;
}

function addPriceToAdventureRewardItems() {
    const getItemNameClass = itemId => `itemName${itemId}`;
    const getItemPriceClass = itemId => `itemPrice${itemId}`;

    let itemIdToDescId = {};
    let itemNodes = evaluateToNodesArray("//table[@class='item']");
    for (let itemNode of itemNodes) {
        let itemId = getItemIdFromItemNode(itemNode);
        let itemDescId = getItemDescIdFromItemNode(itemNode);
        itemIdToDescId[itemId] = itemDescId;

        let textNode = document.evaluate('.//td[@class="effect"]', itemNode).iterateNext();
        let nameNode = document.evaluate('./b', textNode).iterateNext();
        nameNode.classList.add(getItemNameClass(itemId));

        let itemPriceClass = getItemPriceClass(itemId);
        let priceNode = document.evaluate(`./span[@class="${itemPriceClass}"]`, textNode).iterateNext();
        if (!priceNode) {
            priceNode = document.createElement("span");
            priceNode.className = itemPriceClass;
            priceNode.innerHTML = "(?)";
            priceNode.style.fontSize = "0.8em";
            priceNode.style.paddingLeft = "3px";
            textNode.appendChild(priceNode);
        }
    }

    redrawAdventureRewardPrices(Object.keys(itemIdToDescId), {cachedOnly: true}).then(() =>
        redrawAdventureRewardPrices(Object.keys(itemIdToDescId), {cachedOnly: false}));

    let itemUpdateListener = browser.runtime.connect({name: "itemUpdateListener"});
    itemUpdateListener.onMessage.addListener(message => redrawAdventureRewardPrices(message.itemIds, {cachedOnly: true}));

    for (let itemId of Object.keys(itemIdToDescId)) {
        fetchItemDataFromBackground(itemId, itemIdToDescId[itemId]);
    }
}

function getItemIdFromItemNode(itemNode) {
    return parseInt(new URLSearchParams(itemNode.getAttribute("rel")).get("id"));
}

function getItemDescIdFromItemNode(itemNode) {
    let imgElem = document.evaluate(".//img[starts-with(@onclick, 'descitem(')]", itemNode).iterateNext();
    return parseInt(imgElem.getAttribute("onclick").match(/descitem\((\d+)\b/)[1]);
}

async function redrawAdventureRewardPrices(itemIds, {cachedOnly} = {}) {
    return redrawPrices(itemIds, {cachedOnly},
        (itemId, flags, average, volume, color, fontStyle) => {
            let itemNameNodes = document.getElementsByClassName(`itemName${itemId}`);
            for (let itemNameNode of itemNameNodes) {
                itemNameNode.style.color = color;
                itemNameNode.style.fontStyle = fontStyle;
            }

            let priceNodes = document.getElementsByClassName(`itemPrice${itemId}`);
            for (let priceNode of priceNodes) {
                if (isTradableItemFlags(flags)) {
                    priceNode.innerHTML = `(${average.toLocaleString()} x ${volume.toLocaleString()})`;
                } else {
                    priceNode.innerHTML = "";
                }
            }
        });
}

function parseItemFlagsFromDescription(description) {
    let notrade = !!description.match(/Cannot be traded/);
    let nodiscard = !!description.match(/Cannot be( traded or)? discarded/);
    let gift = !!description.match(/Gift Item/);
    let quest = !!description.match(/Quest Item/);
    let oneday = !!description.match(/This item will disappear at the end of the day/);
    return {notrade, nodiscard, gift, quest, oneday};
}

function parseModifiersFromText(text) {
    let mods = {};
    let unknown = [];
    for (let line of text.split("\n")) {
        try {
            let mod = parseModifierLine(line);
            if (mod) {
                if (mod.unknown) {
                    unknown.push(line);
                } else {
                    mods[mod.key] = mods[mod.key] || 0;
                    mods[mod.key] += mod.val;
                }
            }
        } catch (e) {
            console.error(`Error parsing modifier "${line}":`, e.message);
        }
    }
    let modsWithValue = Object.fromEntries(Object.entries(mods).filter(([_, val]) => val));
    return { mods: modsWithValue, unknown };
}

function parseModifierLine(line) {
    const ignoredMods = [
        "(because you hate them)",
        "(so you can destroy them)",
    ];
    if (!line) return null;
    if (ignoredMods.indexOf(line) >= 0) return null;

    const captureInt = (str, pattern) => {
        let matched = str.match(pattern);
        let num = parseInt(matched?.[2]) || 0;
        return matched?.[1] == "-" ? -num : num;
    };
    let captures = [];

    captures.push({ key: "Muscle%", val: captureInt(line, /^Muscle ([+-]?)(\d+)%$/) });
    captures.push({ key: "Moxie%", val: captureInt(line, /^Moxie ([+-]?)(\d+)%$/) });
    captures.push({ key: "Myst%", val: captureInt(line, /^Mysticality ([+-]?)(\d+)%$/) });
    captures.push({ key: "AllAttr%", val: captureInt(line, /^All Attributes ([+-]?)(\d+)%$/) });
    captures.push({ key: "MuscleFlat", val: captureInt(line, /^Muscle ([+-]?)(\d+)$/) });
    captures.push({ key: "MoxieFlat", val: captureInt(line, /^Moxie ([+-]?)(\d+)$/) });
    captures.push({ key: "MystFlat", val: captureInt(line, /^Mysticality ([+-]?)(\d+)$/) });
    captures.push({ key: "AllAttrFlat", val: captureInt(line, /^All Attributes ([+-]?)(\d+)$/) });

    captures.push({ key: "StatGainMuscle%", val: captureInt(line, /^([+-]?)(\d+)% to all Muscle Gains$/) });
    captures.push({ key: "StatGainMoxie%", val: captureInt(line, /^([+-]?)(\d+)% to all Moxie Gains$/) });
    captures.push({ key: "StatGainMyst%", val: captureInt(line, /^([+-]?)(\d+)% to all Mysticality Gains$/) });
    captures.push({ key: "StatGainMuscleFlat", val: captureInt(line, /^([+-]?)(\d+) Muscle Stats Per Fight$/) });
    captures.push({ key: "StatGainMoxieFlat", val: captureInt(line, /^([+-]?)(\d+) Moxie Stats Per Fight$/) });
    captures.push({ key: "StatGainMystFlat", val: captureInt(line, /^([+-]?)(\d+) Mysticality Stats Per Fight$/) });
    captures.push({ key: "StatGainFlat", val: captureInt(line, /^([+-]?)(\d+) Stats Per Fight$/) });

    captures.push({ key: "MaxHp%", val: captureInt(line, /^Maximum HP ([+-]?)(\d+)%$/) });
    captures.push({ key: "MaxMp%", val: captureInt(line, /^Maximum MP ([+-]?)(\d+)%$/) });
    captures.push({ key: "MaxHpFlat", val: captureInt(line, /^Maximum HP ([+-]?)(\d+)$/) });
    captures.push({ key: "MaxMpFlat", val: captureInt(line, /^Maximum MP ([+-]?)(\d+)$/) });

    captures.push({ key: "WeapDmg%", val: captureInt(line, /^Weapon Damage ([+-]?)(\d+)%$/) });
    captures.push({ key: "WeapDmgFlat", val: captureInt(line, /^Weapon Damage ([+-]?)(\d+)$/) });
    captures.push({ key: "WeapDmgHotFlat", val: captureInt(line, /^([+-]?)(\d+) Hot Damage$/) });
    captures.push({ key: "WeapDmgColdFlat", val: captureInt(line, /^([+-]?)(\d+) Cold Damage$/) });
    captures.push({ key: "WeapDmgStenchFlat", val: captureInt(line, /^([+-]?)(\d+) Stench Damage$/) });
    captures.push({ key: "WeapDmgSpookyFlat", val: captureInt(line, /^([+-]?)(\d+) Spooky Damage$/) });
    captures.push({ key: "WeapDmgSleazeFlat", val: captureInt(line, /^([+-]?)(\d+) Sleaze Damage$/) });
    captures.push({ key: "WeapDmgPrismFlat", val: captureInt(line, /^([+-]?)(\d+) Hot, Cold, Stench, Spooky, and Sleaze Damage$/) });

    captures.push({ key: "SpellDmg%", val: captureInt(line, /^Spell Damage ([+-]?)(\d+)%$/) });
    captures.push({ key: "SpellDmgFlat", val: captureInt(line, /^Spell Damage ([+-]?)(\d+)$/) });
    captures.push({ key: "SpellDmgHotFlat", val: captureInt(line, /^([+-]?)(\d+) Damage to Hot Spells$/) });
    captures.push({ key: "SpellDmgColdFlat", val: captureInt(line, /^([+-]?)(\d+) Damage to Cold Spells$/) });
    captures.push({ key: "SpellDmgStenchFlat", val: captureInt(line, /^([+-]?)(\d+) Damage to Stench Spells$/) });
    captures.push({ key: "SpellDmgSpookyFlat", val: captureInt(line, /^([+-]?)(\d+) Damage to Spooky Spells$/) });
    captures.push({ key: "SpellDmgSleazeFlat", val: captureInt(line, /^([+-]?)(\d+) Damage to Sleaze Spells$/) });

    captures.push({ key: "rangedDmg%", val: captureInt(line, /^Ranged Damage ([+-]?)(\d+)%$/) });
    captures.push({ key: "rangedDmgFlat", val: captureInt(line, /^Ranged Damage ([+-]?)(\d+)$/) });

    captures.push({ key: "DmgBugbear%", val: captureInt(line, /^([+-]?)(\d+)% Damage vs. Bugbears$/) });
    captures.push({ key: "DmgBugbearFlat", val: captureInt(line, /^([+-]?)(\d+) Damage vs. Bugbears$/) });
    captures.push({ key: "DmgWerewolf%", val: captureInt(line, /^([+-]?)(\d+)% Damage vs. Werewolves$/) });
    captures.push({ key: "DmgWerewolfFlat", val: captureInt(line, /^([+-]?)(\d+) Damage vs. Werewolves$/) });
    captures.push({ key: "DmgZombie%", val: captureInt(line, /^([+-]?)(\d+)% Damage vs. Zombies$/) });
    captures.push({ key: "DmgZombieFlat", val: captureInt(line, /^([+-]?)(\d+) Damage vs. Zombies$/) });
    captures.push({ key: "DmgGhost%", val: captureInt(line, /^([+-]?)(\d+)% Damage vs. Ghosts$/) });
    captures.push({ key: "DmgGhostFlat", val: captureInt(line, /^([+-]?)(\d+) Damage vs. Ghosts$/) });
    captures.push({ key: "DmgVampire%", val: captureInt(line, /^([+-]?)(\d+)% Damage vs. Vampires$/) });
    captures.push({ key: "DmgVampireFlat", val: captureInt(line, /^([+-]?)(\d+) Damage vs. Vampires$/) });
    captures.push({ key: "DmgSkeleton%", val: captureInt(line, /^([+-]?)(\d+)% Damage vs. Skeletons$/) });
    captures.push({ key: "DmgSkeletonFlat", val: captureInt(line, /^([+-]?)(\d+) Damage vs. Skeletons$/) });
    captures.push({ key: "DmgUndead%", val: captureInt(line, /^([+-]?)(\d+)% Damage vs. Undead$/) });
    captures.push({ key: "DmgUndeadFlat", val: captureInt(line, /^([+-]?)(\d+) Damage vs. Undead$/) });

    captures.push({ key: "Crit%", val: captureInt(line, /^([+-]?)(\d+)% chance of Critical Hit$/) });
    captures.push({ key: "SpellCrit%", val: captureInt(line, /^([+-]?)(\d+)% Chance of Spell Critical Hit$/) });
    captures.push({ key: "Init%", val: captureInt(line, /^([+-]?)(\d+)% Combat Initiative$/) });
    captures.push({ key: "DA", val: captureInt(line, /^Damage Absorption ([+-]?)(\d+)$/) });
    captures.push({ key: "DR", val: captureInt(line, /^Damage Reduction: ([+-]?)(\d+)$/) });

    captures.push({ key: "ResHot", val: captureInt(line, /^.*Hot Resistance \(([+-]?)(\d+)\)$/) });
    captures.push({ key: "ResCold", val: captureInt(line, /^.*Cold Resistance \(([+-]?)(\d+)\)$/) });
    captures.push({ key: "ResStench", val: captureInt(line, /^.*Stench Resistance \(([+-]?)(\d+)\)$/) });
    captures.push({ key: "ResSpooky", val: captureInt(line, /^.*Spooky Resistance \(([+-]?)(\d+)\)$/) });
    captures.push({ key: "ResSleaze", val: captureInt(line, /^.*Sleaze Resistance \(([+-]?)(\d+)\)$/) });
    captures.push({ key: "ResAll", val: captureInt(line, /^.*Resistance to All Elements \(([+-]?)(\d+)\)$/) });

    captures.push({ key: "MeatDrop%", val: captureInt(line, /^([+-]?)(\d+)% Meat from Monsters$/) });
    captures.push({ key: "ItemDrop%", val: captureInt(line, /^([+-]?)(\d+)% Item Drops from Monsters$/) });
    captures.push({ key: "GearDrop%", val: captureInt(line, /^([+-]?)(\d+)% Gear Drops from Monsters$/) });
    captures.push({ key: "FoodDrop%", val: captureInt(line, /^([+-]?)(\d+)% Food Drops from Monsters$/) });
    captures.push({ key: "BoozeDrop%", val: captureInt(line, /^([+-]?)(\d+)% Booze Drops from Monsters$/) });
    captures.push({ key: "CandyDrop%", val: captureInt(line, /^([+-]?)(\d+)% Candy Drops from Monsters$/) });
    captures.push({ key: "Pickpocket%", val: captureInt(line, /^([+-]?)(\d+)% Pickpocket Chance$/) });

    captures.push({ key: "ML", val: captureInt(line, /^([+-]?)(\d+) to Monster Level$/) });
    captures.push({ key: "FamWeight", val: captureInt(line, /^([+-]?)(\d+) to Familiar Weight$/) });
    captures.push({ key: "FamDamage", val: captureInt(line, /^Familiar Damage ([+-]?)(\d+)$/) });
    captures.push({ key: "FamExp", val: captureInt(line, /^([+-]?)(\d+) Familiar Experience Per Combat$/) });
    captures.push({ key: "PoolSkill", val: captureInt(line, /^([+-]?)(\d+) Pool Skill$/) });
    captures.push({ key: "HoboPower", val: captureInt(line, /^([+-]?)(\d+) Hobo Power$/) });
    captures.push({ key: "Smithsness", val: captureInt(line, /^([+-]?)(\d+) Smithsness$/) });
    captures.push({ key: "FishingSkill", val: captureInt(line, /^([+-]?)(\d+) Fishing Skill$/) });

    let combatFreqMatch = line.match(/(more|less) attract/);
    if (combatFreqMatch) {
        let amount;
        if (line.match(/very very very much (more|less)/)) amount = 20;
        else if (line.match(/way (more|less)/)) amount = 20;
        else if (line.match(/significantly (more|less)/)) amount = 15;
        else if (line.match(/much (more|less)/)) amount = 10;
        else amount = 5;
        amount = combatFreqMatch[1] == "less" ? -amount : amount;
        captures.push({ key: "CombatFreq", val: amount });
    }

    if (line.match(/Makes you a better diver/)) captures.push({ key: "Diving", val: 10 }); // at least 10, sometimes more

    captures = captures.filter(c => c.val);
    if (captures.length > 1) throw Error("Multiple captures matched: " + captures.map(c => c.key));
    if (captures.length == 0) return { unknown: line };
    return captures[0];
}

function getPseudoMods(mods) {
    const modVal = name => mods[name] || 0;
    let pseudoMods = {};

    pseudoMods["Muscle%"] = modVal("Muscle%") + modVal("AllAttr%");
    pseudoMods["Moxie%"]  = modVal("Moxie%")  + modVal("AllAttr%");
    pseudoMods["Myst%"]   = modVal("Myst%")   + modVal("AllAttr%");
    pseudoMods["MuscleFlat"] = modVal("MuscleFlat") + modVal("AllAttrFlat");
    pseudoMods["MoxieFlat"]  = modVal("MoxieFlat")  + modVal("AllAttrFlat");
    pseudoMods["MystFlat"]   = modVal("MystFlat")   + modVal("AllAttrFlat");

    pseudoMods["StatGainMuscleFlat"] = modVal("StatGainMuscleFlat") + modVal("StatGainFlat");
    pseudoMods["StatGainMoxieFlat"]  = modVal("StatGainMoxieFlat")  + modVal("StatGainFlat");
    pseudoMods["StatGainMystFlat"]   = modVal("StatGainMystFlat")   + modVal("StatGainFlat");

    pseudoMods["WeapDmgHotFlat"]    = modVal("WeapDmgHotFlat")    + modVal("WeapDmgPrismFlat");
    pseudoMods["WeapDmgColdFlat"]   = modVal("WeapDmgColdFlat")   + modVal("WeapDmgPrismFlat");
    pseudoMods["WeapDmgStenchFlat"] = modVal("WeapDmgStenchFlat") + modVal("WeapDmgPrismFlat");
    pseudoMods["WeapDmgSpookyFlat"] = modVal("WeapDmgSpookyFlat") + modVal("WeapDmgPrismFlat");
    pseudoMods["WeapDmgSleazeFlat"] = modVal("WeapDmgSleazeFlat") + modVal("WeapDmgPrismFlat");

    pseudoMods["DmgHot"]    = modVal("WeapDmgHotFlat")    + modVal("SpellDmgHotFlat")    + modVal("WeapDmgPrismFlat");
    pseudoMods["DmgCold"]   = modVal("WeapDmgColdFlat")   + modVal("SpellDmgColdFlat")   + modVal("WeapDmgPrismFlat");
    pseudoMods["DmgStench"] = modVal("WeapDmgStenchFlat") + modVal("SpellDmgStenchFlat") + modVal("WeapDmgPrismFlat");
    pseudoMods["DmgSpooky"] = modVal("WeapDmgSpookyFlat") + modVal("SpellDmgSpookyFlat") + modVal("WeapDmgPrismFlat");
    pseudoMods["DmgSleaze"] = modVal("WeapDmgSleazeFlat") + modVal("SpellDmgSleazeFlat") + modVal("WeapDmgPrismFlat");

    pseudoMods["ResHot"]    = modVal("ResHot")    + modVal("ResAll");
    pseudoMods["ResCold"]   = modVal("ResCold")   + modVal("ResAll");
    pseudoMods["ResStench"] = modVal("ResStench") + modVal("ResAll");
    pseudoMods["ResSpooky"] = modVal("ResSpooky") + modVal("ResAll");
    pseudoMods["ResSleaze"] = modVal("ResSleaze") + modVal("ResAll");

    pseudoMods["GearDrop%"]  = modVal("GearDrop%")  + modVal("ItemDrop%");
    pseudoMods["FoodDrop%"]  = modVal("FoodDrop%")  + modVal("ItemDrop%");
    pseudoMods["BoozeDrop%"] = modVal("BoozeDrop%") + modVal("ItemDrop%");
    pseudoMods["CandyDrop%"] = modVal("CandyDrop%") + modVal("ItemDrop%");

    return Object.fromEntries(Object.entries(pseudoMods).filter(([_, val]) => val != 0));
}

function bindKey(keys, action) {
    let keysMap = {};
    if (Array.isArray(keys)) {
        for (let key of keys) {
            keysMap[key] = true;
        }
    } else {
        keysMap[keys] = true;
    }

    window.addEventListener("keydown", event => {
        if (keysMap[event.key]) {
            action();
        }
    });
}

function clickButton(textPattern) {
    return _click("//input[@class='button']", elem => elem.value, textPattern);
}

function clickLink(textPattern) {
    return _click("//a", elem => elem.innerText, textPattern);
}

function _click(xpath, extractText, textPattern) {
    let mainDoc = getPane("mainpane").document;
    let elems = mainDoc.evaluate(xpath, mainDoc);
    let elem = elems.iterateNext();
    while (elem) {
        if (isVisible(elem) && extractText(elem).match(textPattern)) {
            console.log(`Clicking ${textPattern}`);
            elem.click();
            return true;
        }
        elem = elems.iterateNext();
    }
    return false;
}

function select(selectName, optionTextPattern) {
    let mainDoc = getPane("mainpane").document;
    let selectElem = mainDoc.evaluate(`//select[@name='${selectName}']`, mainDoc).iterateNext();
    if (selectElem && isVisible(selectElem)) {
        for (let option of selectElem.options) {
            if (option.innerText.match(optionTextPattern)) {
                console.log(`Selecting ${selectName} option: ${optionTextPattern}`);
                selectElem.value = option.value;
                return true;
            }
        }
    }
    return false;
}

async function redrawPrices(itemIds, {cachedOnly}, redrawFunc, errorFunc) {
    for (let itemId of itemIds) {
        let [itemData, priceData] = await Promise.all([
            getItemData(itemId),
            getPrice(itemId, {cachedOnly})
        ]);

        let flags = itemData?.flags || {};
        if (!itemData?.flags && priceData?.untradable) {
            flags.notrade = true;
        }

        let tradable = isTradableItemFlags(flags);
        if (tradable && priceData?.data?.error) {
            if (errorFunc) errorFunc(itemId);
            continue;
        }

        let average = priceData?.data?.average || 0;
        let volume = priceData?.data?.volume || 0;
        let color = getPriceColor(average, volume, flags);
        let fontStyle = (tradable && flags.nodiscard) ? "italic" : "";

        redrawFunc(itemId, flags, average, volume, color, fontStyle);
    }
}

function openUrl(url) {
    window.open(url, "_blank");
}

function openWiki(searchTerm) {
    const wikiSearchPrefix = "https://kol.coldfront.net/thekolwiki/index.php?search=";
    let url = wikiSearchPrefix + encodeURIComponent(searchTerm);
    open(url);
}

async function searchMall(searchTerm, {exactMatch} = {}) {
    if (exactMatch) searchTerm = `"${searchTerm}"`;
    let searchParams = new URLSearchParams();
    searchParams.set("pudnuggler", searchTerm);
    let url = `https://www.kingdomofloathing.com/mall.php?${searchParams.toString()}`;
    return browser.runtime.sendMessage({operation: "gotoUrl", windowId: getWindowId(), url});
}

async function searchInventory(searchTerm) {
    let searchTermStripped = searchTerm.replace(/[^\x00-\x7F]+/g, "*").replace(/"/g, "*");
    let searchParams = new URLSearchParams();
    searchParams.set("ftext", searchTermStripped);
    let url = `https://www.kingdomofloathing.com/inventory.php?${searchParams.toString()}`;
    return browser.runtime.sendMessage({operation: "gotoUrl", windowId: getWindowId(), url});
}

function openPriceCheck(itemId) {
    open(`https://api.aventuristo.net/itemgraph?itemid=${itemId}&timespan=2`);
}

async function getPrice(itemId, {cachedOnly} = {}) {
    if (cachedOnly) {
        await queuePriceCheck(itemId);
        return getCachedPrice(itemId);
    }

    return browser.runtime.sendMessage({operation: "fetchPrice", itemId});
}

async function queuePriceCheck(itemId) {
    return browser.runtime.sendMessage({operation: "queuePriceCheck", itemId});
}

async function fetchItemDataFromBackground(itemId, itemDescId) {
    return browser.runtime.sendMessage({operation: "fetchItemData", itemId, itemDescId});
}

async function queueItemDescriptionFetch(itemId, itemDescId) {
    return browser.runtime.sendMessage({operation: "queueItemDescriptionFetch", itemId, itemDescId});
}

async function getFromStorage(key) {
    let cacheFetch = await browser.storage.local.get(key);
    return cacheFetch[key];
}

async function scanStorage(keyMatcher, valMatcher) {
    let cacheFetch = await browser.storage.local.get(null);
    let keyVals = {};
    for (let key of Object.keys(cacheFetch)) {
        if (!keyMatcher || keyMatcher(key)) {
            let val = cacheFetch[key];
            if (!valMatcher || valMatcher(val)) {
                keyVals[key] = val;
            }
        }
    }
    return keyVals;
}

async function getCachedPrice(itemId) {
    return getFromStorage(getItemPriceKey(itemId));
}

async function getItemData(itemId) {
    return getFromStorage(getItemDataKey(itemId));
}

async function getEffectData(effectId) {
    return getFromStorage(getEffectDataKey(effectId));
}

function getItemPriceKey(itemId) {
    return `item_price_${itemId}`;
}

function getItemDataKey(itemId) {
    return `item_data_${itemId}`;
}

function getEffectDataKey(effectId) {
    return `effect_data_${effectId}`;
}

function isTradableItemFlags(itemFlags) {
    let flags = itemFlags || {};
    let untradable = flags.notrade || flags.gift || flags.quest || flags.oneday;
    return !untradable;
}

function getPriceColor(price, volume, itemFlags = {}) {
    if (itemFlags.quest) {
        return "maroon";
    } else if (!isTradableItemFlags(itemFlags)) {
        return "darkblue";
    }

    if (price >= 50_000_000) {
        return "fuchsia";
    } else if (price >= 800_000) {
        return "red";
    } else if (price >= 80_000) {
        return "darkorange";
    } else if (price >= 8_000) {
        return "dodgerblue";
    } else if (price >= 1000 || (price >= 300 && volume >= 1000)) {
        return "green";
    }
    return "black";
}

function parseFormattedInt(str) {
    return parseInt(str.replace(/,/g, ""));
}

function getPathName(doc = document) {
    return new URL(doc.URL).pathname;
}

function setWindowId(windowId, options = {}) {
    let win = options.window || window;
    win.document.body.setAttribute("data-window-id", windowId);
}

function getWindowId(win = window) {
    let windowId = win.document.body.getAttribute("data-window-id");
    if (windowId) {
        return windowId;
    } else if (win != win.top) {
        return getWindowId(win.top);
    } else {
        return null;
    }
}

function getPane(name, {id, returnFrame} = {}) {
    let topDoc = window.top.document;
    let frame = topDoc.evaluate(`//frame[@name='${name}']`, topDoc).iterateNext();
    if (!frame) return null;
    if (returnFrame) return frame;
    let win = frame.contentWindow;
    return id ? win.document.getElementById(id) : win;
}

function isVisible(elem) {
    return elem.checkVisibility({visibilityProperty: true});
}

function getTurns() {
    let charDoc = getPane("charpane")?.document;
    let hourglass = charDoc && charDoc.evaluate("//img[@title='Adventures Remaining']", charDoc).iterateNext();
    let textNode = hourglass?.parentNode?.nextSibling?.firstChild;
    return textNode ? parseInt(textNode.innerText) : null;
}

function getHp() {
    return parseHpMpText(getHpTextNode()?.innerText);
}

function getMp() {
    return parseHpMpText(getMpTextNode()?.innerText);
}

function getHpTextNode() {
    let charDoc = getPane("charpane")?.document;
    let hpIcon = charDoc && charDoc.evaluate("//img[@title='Hit Points']", charDoc).iterateNext();
    return hpIcon?.parentNode?.nextSibling?.firstChild;
}

function getMpTextNode() {
    let charDoc = getPane("charpane")?.document;
    let mpIcon = charDoc && charDoc.evaluate("//img[@title='Mojo Points' or @title='Mana Points' or @title='Muscularity Points']", charDoc).iterateNext();
    return mpIcon?.parentNode?.nextSibling?.firstChild;
}

function parseHpMpText(text) {
    let match = text && text.match(/(\d+)\s\/\s(\d+)/);
    if (!match) return null;
    let current = parseInt(match[1]);
    let total = parseInt(match[2]);
    let ratio = current / total;
    return { current, total, ratio };
}

function isHpLow() {
    return getHp()?.ratio <= 0.35;
}

function isMpAlmostFull() {
    return getMp()?.ratio >= 0.85;
}

function isMpLow() {
    return getMp()?.ratio <= 0.15;
}

function getLastAdventure() {
    let charDoc = getPane("charpane")?.document;
    return charDoc ? charDoc.evaluate("//a[text()='Last Adventure:']/following::a[1]", charDoc).iterateNext()?.innerText : null;
}

async function sendCommand(command) {
    if (!command.startsWith("/")) {
        command = "/" + command;
    }

    let chatDoc = getPane("chatpane")?.document;
    let enterChat = chatDoc && chatDoc.evaluate("//a[@href='mchat.php']/b[text()='Enter the Chat']", chatDoc).iterateNext();
    if (enterChat) {
        enterChat.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        chatDoc = getPane("chatpane")?.document;
    }

    if (chatDoc) {
        let inputForm = chatDoc.getElementById("InputForm");
        chatDoc.evaluate(".//input[@name='graf']", inputForm).iterateNext().value = command;
        chatDoc.evaluate(".//input[@type='submit']", inputForm).iterateNext().click();
    }
}

function randomId() {
    return Math.floor(Math.random() * 1_000_000_000);
}

function evaluateToNodesArray(xpath, {document: doc, contextNode} = {}) {
    if (!doc) doc = document;
    if (!contextNode) contextNode = doc;

    let nodes = [];
    let result = doc.evaluate(xpath, contextNode);
    let node = result.iterateNext();
    while (node) {
        nodes.push(node);
        node = result.iterateNext();
    }
    return nodes;
}