function handleCharPane() {
    updateHpColor();
    updateMpColor();
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