function handleMining() {
    let grid = getGrid();
    highlightClickableShinies(grid);
    printGrid(grid);
    bindKey("`", () => nextAction(grid));
    document.addEventListener("mine-gold-auto", () => nextAction(grid));
}

function nextAction(grid) {
    let foundGold = document.firstChild.innerText.match(/1,970 carat gold/);
    if (foundGold) {
        return clickButton(/Find New Cavern/);
    }

    let openCount = 0;
    for (let y=grid.length-1; y>=0; y--) {
        let row = grid[y];
        for (let x=row.length-1; x>=0; x--) {
            let node = row[x];
            if (node.clickElem && node.shiny) {
                node.clickElem.click();
                return;
            }
            if (node.open) {
                openCount += 1;
            }
        }
    }

    if (openCount) {
        return clickButton(/Find New Cavern/);
    }

    grid[grid.length-1][grid[0].length/2].clickElem.click();
}

function getGrid() {
    let grid = [];
    let tbody = document.evaluate("//table[contains(@background, 'mine_background.gif')]/tbody", document).iterateNext();
    let tr = tbody.firstChild;
    while (tr) {
        let row = [];
        let td = tr.firstChild;
        while (td) {
            if (td.colSpan == 1) {
                let img = document.evaluate(".//img", td).iterateNext();
                let shiny = img.alt.match(/Promising Chunk of Wall/);
                let open = img.alt.match(/Open Cavern/);
                let outOfBound = td.getAttribute("onclick") == "no();";
                let clickElem = td.firstChild.tagName == "A" ? td.firstChild : null;
                row.push({shiny, open, outOfBound, clickElem});
            }
            td = td.nextSibling;
        }
        if (row.length) {
            grid.push(row);
        }
        tr = tr.nextElementSibling;
    }

    grid.pop(); // last row initially opened

    return grid;
}

function highlightClickableShinies(grid) {
    for (let row of grid) {
        for (let node of row) {
            if (node.clickElem && node.shiny) {
                let img = document.evaluate(".//img", node.clickElem).iterateNext();
                img.style.boxSizing = "border-box";
                img.style.border = "2px solid orange";
            }
        }
    }
}

function printGrid(grid) {
    let colNums = "//";
    for (let x=0; x<grid[0].length; x++) {
        colNums += " " + x;
    }
    console.log(colNums);
    for (let y=0; y<grid.length; y++) {
        let row = grid[y];
        let rowStr = `${y}|`;
        for (let x=0; x<row.length; x++) {
            let node = row[x];
            rowStr += " ";
            if (node.outOfBound) {
                rowStr += "x";
            } else if (node.clickElem && node.shiny) {
                rowStr += "S";
            } else if (node.clickElem) {
                rowStr += "O";
            } else if (node.shiny) {
                rowStr += "*";
            } else {
                rowStr += ".";
            }
        }
        console.log(rowStr);
    }
    console.log(colNums);
}