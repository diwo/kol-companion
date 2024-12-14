let pathname = URL.parse(document.URL).pathname;
switch (pathname) {
    case "/game.php":
        handleGamePage();
        break;
    case "/inventory.php":
    case "/closet.php":
        handleInventoryPage();
        break;
    case "/backoffice.php":
        handleBackoffice();
        break;
    case "/mining.php":
        handleMining();
        addPriceToAdventureRewardItems();
        break;
    case "/charpane.php":
        handleCharPane();
        break;
    case "/desc_item.php":
    case "/desc_outfit.php":
    case "/desc_effect.php":
    case "/desc_skill.php":
    case "/desc_familiar.php":
    case "/desc_guardian.php":
        handleDescriptionPage();
        break;
    default:
        addPriceToAdventureRewardItems();
}

registerCommandReceiver();
addWikiLinkToHeadings();
