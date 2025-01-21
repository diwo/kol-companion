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
    case "/town_fleamarket.php":
        handleFleaMarket();
        break;
    case "/peevpee.php":
        handlePvp();
        break;
    case "/mining.php":
        handleMining();
        break;
    case "/choice.php":
        handleChoice();
        break;
    case "/fight.php":
        handleFight();
        break;
    case "/charpane.php":
        handleCharPane();
        break;
    case "/awesomemenu.php":
        handleTopMenu();
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

highlightText();
addAdventureChoiceNotes();
addWikiLinkToHeadings();
