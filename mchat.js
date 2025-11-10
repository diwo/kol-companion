function handleChatPane() {
    chatBindActiveTabRightClick();
}

function chatBindActiveTabRightClick() {
    let tabs = document.getElementById("tabs");
    tabs.addEventListener("contextmenu", event => {
        let target = event.target;
        while (target) {
            if (target.classList?.contains("tab") && target.classList?.contains("active")) {
                event.preventDefault();
                if (!chatHideWholist()) {
                    sendCommand("/who");
                }
                break;
            }
            target = target.parentNode;
        }
    });
}

function chatHideWholist() {
    let allChats = document.getElementsByClassName("chatdisplay");
    let currentChat = Array.from(allChats).filter(x => x.style.display != "none")[0];

    let isAboveLastmark = false;
    let hasWholistAfterLastmark = false;
    for (let node=currentChat.lastChild; node; node=node.previousSibling) {
        let isLastmark = node.className == "lastmark";
        let isWholist = !!document.evaluate(".//center/b[starts-with(text(), 'Players in channel ')]", node).iterateNext();
        let isVisible = node.style.display != "none";
        if (isLastmark) isAboveLastmark = true;
        if (isWholist && !isAboveLastmark && isVisible) hasWholistAfterLastmark = true;
        if (isWholist) node.style.display = "none";
    }

    return hasWholistAfterLastmark;
}