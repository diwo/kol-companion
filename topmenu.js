function handleTopMenu() {
    let observer = new MutationObserver(addShowAllIconsLink);
    observer.observe(document.body, {childList: true, subtree: true});
}

function addShowAllIconsLink() {
    const linkNodeId = "showallicons";
    let linkNode = document.getElementById(linkNodeId);
    if (!linkNode) {
        let iconDiv = document.evaluate("//div[@class='icon']", document).iterateNext();
        if (iconDiv) {
            linkNode = document.createElement("a");
            linkNode.id = linkNodeId;
            linkNode.href = browser.runtime.getURL("icons.html");
            linkNode.target = "_blank";
            linkNode.innerText = "Show all icons";
            iconDiv.parentElement.appendChild(document.createElement("br"));
            iconDiv.parentElement.appendChild(linkNode);
        }
    }
}