function handleMall() {
    bindSearchKeys({mallSearchTerm: document.getElementById("pudnuggler")?.value});
    handleMallAutoRefresh();
}

function handleMallAutoRefresh() {
    let autoRefresh = document.getElementById("autorefresh");
    let searchTerm = document.getElementById("pudnuggler")?.value;

    if (!autoRefresh && searchTerm) {
        autoRefresh = document.createElement("input");
        autoRefresh.id = "autorefresh";
        autoRefresh.type = "checkbox";
        autoRefresh.checked = !!new URL(document.URL).searchParams.get("refresh");

        autoRefresh.addEventListener("click", event => {
            let checked = event.target.checked;
            if (checked) {
                let url = new URL(document.URL);
                url.searchParams.set("pudnuggler", searchTerm);
                url.searchParams.set("refresh", 1);
                window.location = url.toString();
            }
        });

        let autoRefreshSpan = document.createElement("span");
        let autoRefreshLabel = document.createElement("label");
        autoRefreshLabel.htmlFor = autoRefresh.id;
        autoRefreshLabel.innerText = "Auto-Refresh";
        autoRefreshSpan.appendChild(autoRefresh);
        autoRefreshSpan.appendChild(autoRefreshLabel);

        let advsearchlink = document.getElementById("advsearchlink");
        let advSearchPara = evaluateToNodesArray("./p", {contextNode: advsearchlink})[0];
        advSearchPara.appendChild(autoRefreshSpan);
        advSearchPara.style.display = "flex";
        advSearchPara.style.alignItems = "center";
        advSearchPara.style.justifyContent = "center";
    }

    setTimeout(() => {
        if (autoRefresh.checked) {
            window.location.reload();
        }
    }, 5000);
}