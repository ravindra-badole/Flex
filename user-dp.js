(function () {
  const DP_KEY = "skillbridge_user_dp";
  const DEFAULT_DP = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%231e293b'/><circle cx='60' cy='44' r='20' fill='%2338bdf8'/><path d='M20 104c8-18 24-28 40-28s32 10 40 28' fill='%2338bdf8'/></svg>";

  function getDp() {
    return localStorage.getItem(DP_KEY) || DEFAULT_DP;
  }

  function applyDp() {
    const src = getDp();
    document.querySelectorAll(".user-dp").forEach((img) => {
      img.src = src;
    });
  }

  function setupUploader() {
    const input = document.getElementById("dpUpload");
    if (!input) return;

    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (event) {
        const result = event.target && event.target.result;
        if (typeof result === "string") {
          localStorage.setItem(DP_KEY, result);
          applyDp();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  window.clearDp = function () {
    localStorage.removeItem(DP_KEY);
    applyDp();
  };

  document.addEventListener("DOMContentLoaded", function () {
    applyDp();
    setupUploader();
  });
})();
