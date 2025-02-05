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
    let effectsParentNode = document.evaluate("//b/font[text()='Effects:']/ancestor::center", document).iterateNext();
    let effectModifiersSection = document.createElement("p");
    effectModifiersSection.id = "effect-modifiers";
    effectModifiersSection.innerHTML = `
        <b><font size="2">Effect Modifiers:</font></b>
        <table><tbody style="font-size: 0.75em"></tbody></table>
    `;
    effectsParentNode.appendChild(effectModifiersSection);

    let allEffectData = await scanStorage(k => k.startsWith("effect_data_"));
    let effectNameToMods = Object.fromEntries(Object.values(allEffectData).map(data => [data.name, data.modifiers]));

    let aggregatedMods = {};
    let effectRows = evaluateToNodesArray("//b/font[text()='Effects:']/ancestor::p/table/tbody/tr");
    for (let effectRow of effectRows) {
        let effectText = effectRow.lastChild?.firstChild?.innerText || "";
        let effectName = effectText.match(/^(.*) \(\d+\)/)?.[1];
        if (!effectNameToMods[effectName]) {
            console.log("Unknown effect: ", effectName); // TODO fetch effect
        }
        let mods = effectNameToMods[effectName] || {};
        for (let key of Object.keys(mods)) {
            aggregatedMods[key] = (aggregatedMods[key] || 0) + mods[key];
        }
    }

    let pseudoMods = getPseudoMods(aggregatedMods);
    const getModVal = modName => pseudoMods[modName] || aggregatedMods[modName];
    const modsToDisplay = [
        "ML", "CombatFreq", "Init%", "ItemDrop%", "FoodDrop%", "BoozeDrop%", "MeatDrop%",
        "WeapDmg%", "SpellDmg%", "Crit%", "SpellCrit%",
        "DmgHot", "DmgCold", "DmgStench", "DmgSpooky", "DmgSleaze",
    ];
    let modsTbody = document.evaluate(".//tbody", effectModifiersSection).iterateNext();

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
            td1.style.fontWeight = "bold";
            td2.innerText = val > 0 ? `+${val}` : val;
            tr.appendChild(td1);
            tr.appendChild(td2);
            modsTbody.appendChild(tr);
        }
    }
}