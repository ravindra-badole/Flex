document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.querySelector(".nav-links input");
  const searchStatus = document.getElementById("searchStatus");

  const categoryCards = Array.from(document.querySelectorAll(".category-grid .card"));
  const projectCards = Array.from(document.querySelectorAll(".showcase-grid .job-card"));
  const allCards = categoryCards.concat(projectCards);

  // Category click flow: Home -> Browse Jobs (filtered by selected category)
  categoryCards.forEach(function (card) {
    const navigateToCategory = function () {
      const category = card.getAttribute("data-category") || card.textContent.trim();
      const target = "browse-jobs.html?category=" + encodeURIComponent(category);
      window.location.href = target;
    };

    card.addEventListener("click", navigateToCategory);
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigateToCategory();
      }
    });
  });

  if (!searchInput || allCards.length === 0) {
    return;
  }

  const setStatus = function (message) {
    if (searchStatus) {
      searchStatus.textContent = message;
    }
  };

  const updateVisibility = function (query) {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      allCards.forEach(function (card) {
        card.style.display = "";
      });
      setStatus("Showing all categories and projects.");
      return;
    }

    let visibleCount = 0;

    allCards.forEach(function (card) {
      const text = card.textContent.toLowerCase();
      const isMatch = text.includes(normalized);
      card.style.display = isMatch ? "" : "none";
      if (isMatch) {
        visibleCount += 1;
      }
    });

    if (visibleCount === 0) {
      setStatus("No matches found. Try another keyword.");
    } else {
      setStatus("Found " + visibleCount + " matching result" + (visibleCount > 1 ? "s" : "") + ".");
    }
  };

  setStatus("Showing all categories and projects.");

  searchInput.addEventListener("input", function () {
    updateVisibility(searchInput.value);
  });

  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      searchInput.value = "";
      updateVisibility("");
    }
  });
});
