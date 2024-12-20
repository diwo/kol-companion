function handleCharPane() {
    updateMpColor();
}

function updateMpColor() {
    if (isMpAlmostFull()) {
        getMpTextNode().style.color = "green";
    } else if (isMpLow()) {
        getMpTextNode().style.color = "red";
    }
}