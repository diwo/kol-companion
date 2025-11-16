function handleCharPane() {
    updateHpColor();
    updateMpColor();
    moveQuestCloseButton();
    addEffectModifiersSection();
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

async function addEffectModifiersSection() {
    let effectsNode = document.evaluate("//center[p/b/font[text()='Effects:']]", document).iterateNext();
    if (!effectsNode) return;

    if (!document.getElementById("effect-modifiers")) {
        let effectModifiersSection = document.createElement("p");
        effectModifiersSection.id = "effect-modifiers";
        effectModifiersSection.innerHTML = `
            <b><font size="2">Effect Modifiers:</font></b>
            <table><tbody style="font-size: 0.75em"></tbody></table>
        `;
        effectsNode.insertBefore(effectModifiersSection, effectsNode.firstChild);
    }

    let activeEffects = [];
    let effectRows = evaluateToNodesArray("//center/p[b/font[text()='Effects:']]/table/tbody/tr");
    for (let effectRow of effectRows) {
        let effectText = effectRow.lastChild?.firstChild?.innerText || "";
        let effectName = effectText.match(/^(.*) \(\d+\)/)?.[1];

        let imgNode = document.evaluate("./td[2]//img", effectRow).iterateNext();
        let effectId = imgNode?.getAttribute("oncontextmenu")?.match(/shrug\((\d+)(,.*)?\)/)?.[1];
        let effectDescId = imgNode?.getAttribute("onclick")?.match(/eff\("(.*)"\)/)?.[1];

        activeEffects.push({ effectName, effectId, effectDescId });
    }

    let scannedEffectData = await scanStorage(k => k.startsWith("effect_data_"));
    let effectToMods = Object.fromEntries(Object.values(scannedEffectData).map(data => [data.name, data.modifiers]));

    updateEffectModifiers(activeEffects, effectToMods);

    let effectsWithNoData = activeEffects.filter(eff => !effectToMods[eff.effectName]);
    let fetchedEffectData = await Promise.all(
        effectsWithNoData.map(({effectId, effectDescId}) =>
            browser.runtime.sendMessage({operation: "fetchEffectData", effectId, effectDescId}))
    );
    for (let effectData of fetchedEffectData) {
        effectToMods[effectData.name] = effectData.modifiers;
    }
    updateEffectModifiers(activeEffects, effectToMods);
}

function updateEffectModifiers(activeEffects, effectToMods) {
    let aggregatedMods = {};
    for (let effect of activeEffects) {
        let mods = effectToMods[effect.effectName] || {};
        for (let modName of Object.keys(mods)) {
            aggregatedMods[modName] = (aggregatedMods[modName] || 0) + mods[modName];
        }
    }

    let pseudoMods = getPseudoMods(aggregatedMods);
    const getModVal = modName => pseudoMods[modName] || aggregatedMods[modName];
    const modsToDisplay = [
        "ML", "CombatFreq", "Init%", "ItemDrop%", "FoodDrop%", "BoozeDrop%", "MeatDrop%",
        "WeapDmg%", "SpellDmg%", "Crit%", "SpellCrit%",
        "DmgHot", "DmgCold", "DmgStench", "DmgSpooky", "DmgSleaze",
    ];

    let effectModifiersSection = document.getElementById("effect-modifiers");
    let modsTbody = document.evaluate(".//tbody", effectModifiersSection).iterateNext();
    while (modsTbody.lastChild) modsTbody.removeChild(modsTbody.lastChild);
    for (let modName of modsToDisplay) {
        let val = getModVal(modName);
        if (val) {
            if (modName == "FoodDrop%" && val == getModVal("ItemDrop%")) continue;
            if (modName == "BoozeDrop%" && val == getModVal("ItemDrop%")) continue;

            let tr = document.createElement("tr");
            let td1 = document.createElement("td");
            let td2 = document.createElement("td");
            td1.innerText = `${modName}:`;
            td1.style.float = "right";
            td2.innerText = val > 0 ? `+${val}` : val;
            tr.appendChild(td1);
            tr.appendChild(td2);
            modsTbody.appendChild(tr);
        }
    }
}