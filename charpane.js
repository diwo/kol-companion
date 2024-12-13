function handleCharPane() {
    updateMpColor();
}

function updateMpColor() {
    if (isMpAlmostFull()) {
        getMpTextNode().style.color = "green";
    }
}