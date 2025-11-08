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
                sendCommand("/who");
                break;
            }
            target = target.parentNode;
        }
    });
}