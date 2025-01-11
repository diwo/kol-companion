function handleChoice() {
    drawCombBeachGrid();
}

function drawCombBeachGrid() {
    let evaluateResult = document.evaluate('//img[@title="rough sand"]', document);
    let imgs = [];
    let elem = evaluateResult.iterateNext();
    while (elem) {
        imgs.push(elem);
        elem = evaluateResult.iterateNext();
    }
    for (let img of imgs) {
        img.style.boxSizing = "border-box";
        img.style.border = "1px solid";
    }
}