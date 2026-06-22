// app.js — talks to the Apps Script backend defined in config.js (SHEET_API_URL)

document.addEventListener("DOMContentLoaded", () => {
  if (!window.SHEET_API_URL || window.SHEET_API_URL.includes("PLACEHOLDER")) {
    document.getElementById("configWarning").classList.add("show");
  }

  setupTabs();
  setupCreatePass();
  setupVisitSearch();
});

function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// Generic GET call to the Apps Script web app (avoids CORS preflight issues with POST)
async function callApi(params) {
  const url = new URL(window.SHEET_API_URL);
  Object.keys(params).forEach((key) => url.searchParams.set(key, params[key]));
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error("Network error: " + res.status);
  return res.json();
}

function showResultBox(el, message, type) {
  el.textContent = message;
  el.className = "result-box show " + type;
}

function setLoading(button, isLoading, label) {
  button.disabled = isLoading;
  button.innerHTML = isLoading ? '<span class="spinner"></span>Working...' : label;
}

// ---------- NEW / RENEW PASS ----------
function setupCreatePass() {
  const createBtn = document.getElementById("createBtn");
  const resultBox = document.getElementById("newResult");

  createBtn.addEventListener("click", async () => {
    const name = document.getElementById("newName").value.trim();
    const phone = document.getElementById("newPhone").value.trim();
    const hours = document.getElementById("newHours").value.trim();

    if (!name || !phone || !hours) {
      showResultBox(resultBox, "Please fill in name, phone, and hours.", "error");
      return;
    }
    if (!/^\d{7,15}$/.test(phone.replace(/\D/g, ""))) {
      showResultBox(resultBox, "Please enter a valid phone number.", "error");
      return;
    }

    setLoading(createBtn, true);
    try {
      const data = await callApi({ action: "createPass", name, phone, hours });
      if (data.success) {
        showResultBox(
          resultBox,
          `✅ Pass created for ${data.name} (ID: ${data.displayId})\nHours: ${data.hoursRemaining} | Expires: ${data.expiryDate}`,
          "success"
        );
        document.getElementById("newName").value = "";
        document.getElementById("newPhone").value = "";
        document.getElementById("newHours").value = "20";
      } else {
        showResultBox(resultBox, "❌ " + data.error, "error");
      }
    } catch (err) {
      showResultBox(resultBox, "❌ Could not reach server: " + err.message, "error");
    } finally {
      setLoading(createBtn, false, "Create / Renew Pass");
    }
  });
}

// ---------- RECORD VISIT ----------
function setupVisitSearch() {
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const playerCard = document.getElementById("playerCard");
  const deductBtn = document.getElementById("deductBtn");
  const visitResult = document.getElementById("visitResult");

  let selectedPhone = null;
  let debounceTimer = null;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim();
    playerCard.classList.remove("show");
    visitResult.classList.remove("show");

    if (debounceTimer) clearTimeout(debounceTimer);
    if (query.length < 2) {
      searchResults.classList.remove("show");
      searchResults.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const data = await callApi({ action: "searchPlayers", query });
        renderSearchResults(data.matches || []);
      } catch (err) {
        searchResults.innerHTML = `<div class="search-result-item">Error searching: ${err.message}</div>`;
        searchResults.classList.add("show");
      }
    }, 300);
  });

  function renderSearchResults(matches) {
    if (matches.length === 0) {
      searchResults.innerHTML = `<div class="search-result-item">No matching players found</div>`;
      searchResults.classList.add("show");
      return;
    }
    searchResults.innerHTML = matches
      .map(
        (m) => `
        <div class="search-result-item" data-phone="${m.phone}">
          <div class="name">${m.name} — ${m.hoursRemaining} hrs left</div>
          <div class="meta">${m.phone} • Expires ${m.expiryDate} • ${m.status}</div>
        </div>`
      )
      .join("");
    searchResults.classList.add("show");

    searchResults.querySelectorAll(".search-result-item[data-phone]").forEach((item) => {
      item.addEventListener("click", () => {
        selectedPhone = item.dataset.phone;
        searchInput.value = "";
        searchResults.classList.remove("show");
        loadPlayer(selectedPhone);
      });
    });
  }

  async function loadPlayer(phone) {
    try {
      const data = await callApi({ action: "lookupPlayer", phone });
      if (!data.success) {
        showResultBox(visitResult, "❌ " + data.error, "error");
        playerCard.classList.remove("show");
        return;
      }
      document.getElementById("pcName").textContent = data.name;
      document.getElementById("pcPhone").textContent = data.phone;
      document.getElementById("pcHours").textContent = data.hoursRemaining + " hrs";
      document.getElementById("pcExpiry").textContent = data.expiryDate;

      const statusEl = document.getElementById("pcStatus");
      const statusClass =
        data.status === "Active" ? "status-active" : data.status === "Expired" ? "status-expired" : "status-nohours";
      statusEl.innerHTML = `<span class="status-badge ${statusClass}">${data.status}</span>`;

      playerCard.classList.add("show");
      deductBtn.disabled = data.status === "Expired";
    } catch (err) {
      showResultBox(visitResult, "❌ Could not reach server: " + err.message, "error");
    }
  }

  deductBtn.addEventListener("click", async () => {
    const hoursPlayed = document.getElementById("hoursPlayed").value.trim();
    if (!selectedPhone) return;
    if (!hoursPlayed || parseFloat(hoursPlayed) <= 0) {
      showResultBox(visitResult, "Please enter a valid number of hours played.", "error");
      return;
    }

    setLoading(deductBtn, true);
    try {
      const data = await callApi({ action: "deductHours", phone: selectedPhone, hoursPlayed });
      if (data.success) {
        let msg = `✅ ${data.name}: deducted ${data.hoursDeducted} hrs.\nRemaining: ${data.hoursRemainingAfter} hrs.`;
        if (data.overflowHours > 0) {
          msg += `\n⚠️ Overflow: ${data.overflowHours} hrs beyond pass — charge ₹${data.overflowCharge} extra.`;
        }
        showResultBox(visitResult, msg, "success");
        document.getElementById("hoursPlayed").value = "";
        loadPlayer(selectedPhone); // refresh card with updated balance
      } else {
        showResultBox(visitResult, "❌ " + data.error, "error");
      }
    } catch (err) {
      showResultBox(visitResult, "❌ Could not reach server: " + err.message, "error");
    } finally {
      setLoading(deductBtn, false, "Deduct Hours");
    }
  });
}
