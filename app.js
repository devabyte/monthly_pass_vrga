// app.js — talks to the Apps Script backend defined in config.js (SHEET_API_URL)

// Change this to your actual cafe name — used in WhatsApp messages sent to customers.
const CAFE_NAME = "VR GAMING ADDA";

document.addEventListener("DOMContentLoaded", () => {
  setupLockScreen();
  setupPhoneInputFilter();
});

// Builds a wa.me link that opens WhatsApp with a pre-filled message to the given phone number.
// phone must be a 10-digit Indian number (no country code) - we add 91 here for the wa.me format.
function buildWhatsAppLink(phone, message) {
  const fullPhone = "91" + phone;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
}

// Renders a "Send via WhatsApp" button inside the given container element.
// Replaces any existing button in that container so repeated actions don't stack buttons.
function renderWhatsAppButton(container, phone, message) {
  container.innerHTML = "";
  const btn = document.createElement("a");
  btn.href = buildWhatsAppLink(phone, message);
  btn.target = "_blank";
  btn.rel = "noopener noreferrer";
  btn.className = "whatsapp-btn";
  btn.textContent = "📩 Send via WhatsApp";
  container.appendChild(btn);
}

// Strips any non-digit character as it's typed, so staff can never accidentally
// enter spaces, dashes, or a "+91" prefix into the phone field.
function setupPhoneInputFilter() {
  const phoneInput = document.getElementById("newPhone");
  if (!phoneInput) return;
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
  });
}

function setupLockScreen() {
  const lockScreen = document.getElementById("lockScreen");
  const mainApp = document.getElementById("mainApp");
  const pinInput = document.getElementById("pinInput");
  const pinSubmit = document.getElementById("pinSubmit");
  const pinError = document.getElementById("pinError");
  const logoutBtn = document.getElementById("logoutBtn");

  const SESSION_KEY = "cafePassUnlocked";

  function unlock() {
    lockScreen.classList.add("hidden");
    mainApp.classList.remove("hidden");
    initMainApp();
  }

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    mainApp.classList.add("hidden");
    lockScreen.classList.remove("hidden");
    pinInput.value = "";
    pinError.textContent = "";
    pinInput.focus();
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", lock);
  }

  // Stay unlocked for the rest of this browser tab session (cleared on tab close)
  if (sessionStorage.getItem(SESSION_KEY) === "yes") {
    unlock();
    return;
  }

  function tryUnlock() {
    const entered = pinInput.value.trim();
    const correctPin = window.APP_PIN;

    if (!correctPin || correctPin.includes("PLACEHOLDER")) {
      pinError.textContent = "PIN not configured on this deployment.";
      return;
    }
    if (entered === correctPin) {
      sessionStorage.setItem(SESSION_KEY, "yes");
      unlock();
    } else {
      pinError.textContent = "Incorrect PIN. Try again.";
      pinInput.value = "";
      pinInput.focus();
    }
  }

  pinSubmit.addEventListener("click", tryUnlock);
  pinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });
  pinInput.focus();
}

function initMainApp() {
  if (!window.SHEET_API_URL || window.SHEET_API_URL.includes("PLACEHOLDER")) {
    document.getElementById("configWarning").classList.add("show");
  }

  setupTabs();
  setupCreatePass();
  setupVisitSearch();
}

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
    if (!/^[6-9]\d{9}$/.test(phone)) {
      showResultBox(resultBox, "Phone number must be exactly 10 digits, starting with 6-9 (no country code, no leading 0).", "error");
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
        const message =
          `Hi ${data.name}! 🎮 Thanks for choosing ${CAFE_NAME}.\n\n` +
          `Your monthly pass has been activated:\n` +
          `• Hours: ${data.hoursRemaining}\n` +
          `• Expires: ${data.expiryDate}\n\n` +
          `Keep this message as your record. See you soon!`;
        renderWhatsAppButton(document.getElementById("newWhatsappBtn"), data.phone, message);
        document.getElementById("newName").value = "";
        document.getElementById("newPhone").value = "";
        document.getElementById("newHours").value = "20";
      } else {
        showResultBox(resultBox, "❌ " + data.error, "error");
        document.getElementById("newWhatsappBtn").innerHTML = "";
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
    document.getElementById("visitWhatsappBtn").innerHTML = "";

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

        let waMessage =
          `Hi ${data.name}! 🎮 Visit summary from ${CAFE_NAME}:\n\n` +
          `• Hours played today: ${data.hoursPlayed}\n` +
          `• Hours remaining on your pass: ${data.hoursRemainingAfter}\n`;
        if (data.overflowHours > 0) {
          waMessage += `• Extra hours beyond pass: ${data.overflowHours} (charged ₹${data.overflowCharge})\n`;
        }
        waMessage += `\nKeep this message as your record. Thanks for visiting!`;
        renderWhatsAppButton(document.getElementById("visitWhatsappBtn"), selectedPhone, waMessage);

        document.getElementById("hoursPlayed").value = "";
        loadPlayer(selectedPhone); // refresh card with updated balance
      } else {
        showResultBox(visitResult, "❌ " + data.error, "error");
        document.getElementById("visitWhatsappBtn").innerHTML = "";
      }
    } catch (err) {
      showResultBox(visitResult, "❌ Could not reach server: " + err.message, "error");
    } finally {
      setLoading(deductBtn, false, "Deduct Hours");
    }
  });
}
