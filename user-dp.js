(function () {
  const SESSION_KEY = "sb_session";
  const DP_KEY_PREFIX = "skillbridge_user_dp:";
  const LEGACY_DP_KEY = "skillbridge_user_dp";
  const MAX_DP_SIZE = 320;
  const DEFAULT_DP = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%231e293b'/><circle cx='60' cy='44' r='20' fill='%2338bdf8'/><path d='M20 104c8-18 24-28 40-28s32 10 40 28' fill='%2338bdf8'/></svg>";

  function getSessionEmail() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return session && session.email ? String(session.email).toLowerCase() : "";
    } catch (_) {
      return "";
    }
  }

  function getDpKey() {
    const email = getSessionEmail();
    return email ? DP_KEY_PREFIX + email : DP_KEY_PREFIX + "guest";
  }

  function getDp() {
    return localStorage.getItem(getDpKey()) || localStorage.getItem(LEGACY_DP_KEY) || DEFAULT_DP;
  }

  function showDpMessage(message, isError) {
    const controls = document.querySelector(".dp-controls");
    if (!controls) return;

    let node = document.getElementById("dpStatus");
    if (!node) {
      node = document.createElement("p");
      node.id = "dpStatus";
      controls.insertAdjacentElement("afterend", node);
    }

    node.textContent = message;
    node.style.margin = "8px 0 0";
    node.style.color = isError ? "#fca5a5" : "#86efac";
    node.style.fontSize = "0.9rem";
  }

  function applyDp() {
    const src = getDp();
    document.querySelectorAll(".user-dp").forEach((img) => {
      img.src = src;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (event) {
        const result = event.target && event.target.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("Could not read selected image."));
      };
      reader.onerror = function () {
        reject(new Error("Could not read selected image."));
      };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Please choose a valid image file."));
      };
      img.src = src;
    });
  }

  async function makeDpDataUrl(file) {
    if (!file.type || !file.type.startsWith("image/")) {
      throw new Error("Please choose an image file.");
    }

    const originalUrl = await readFileAsDataUrl(file);
    const img = await loadImage(originalUrl);
    const canvas = document.createElement("canvas");
    canvas.width = MAX_DP_SIZE;
    canvas.height = MAX_DP_SIZE;

    const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sourceX = ((img.naturalWidth || img.width) - side) / 2;
    const sourceY = ((img.naturalHeight || img.height) - side) / 2;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sourceX, sourceY, side, side, 0, 0, MAX_DP_SIZE, MAX_DP_SIZE);

    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function setupUploader() {
    const input = document.getElementById("dpUpload");
    if (!input) return;

    const uploadButton = document.querySelector('label[for="dpUpload"]');
    if (uploadButton) {
      uploadButton.addEventListener("click", function (event) {
        event.preventDefault();
        input.click();
      });
    }

    input.addEventListener("change", async function () {
      const file = input.files && input.files[0];
      if (!file) return;

      showDpMessage("Uploading DP...", false);
      try {
        const dataUrl = await makeDpDataUrl(file);
        localStorage.setItem(getDpKey(), dataUrl);
        localStorage.removeItem(LEGACY_DP_KEY);
        applyDp();
        showDpMessage("DP updated successfully.", false);
      } catch (err) {
        showDpMessage(err.message || "DP upload failed. Try a smaller image.", true);
      } finally {
        input.value = "";
      }
    });
  }

  window.clearDp = function () {
    localStorage.removeItem(getDpKey());
    applyDp();
    showDpMessage("DP removed.", false);
  };

  window.refreshUserDp = applyDp;

  document.addEventListener("DOMContentLoaded", function () {
    applyDp();
    setupUploader();
  });
})();
