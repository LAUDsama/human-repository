(function () {
  var STORAGE_KEY = "human-repository-region";
  var GLOBAL_REGION = "global-general";

  function getStoredRegion() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeRegion(region) {
    try {
      window.localStorage.setItem(STORAGE_KEY, region);
    } catch (error) {
      // Browsers can disable storage; filtering should still work for the session.
    }
  }

  function regionList(card) {
    return (card.getAttribute("data-regions") || "")
      .split(/\s+/)
      .filter(Boolean);
  }

  function selectedLabel(select) {
    var option = select.options[select.selectedIndex];
    return option ? option.text : select.value;
  }

  function hasOption(select, value) {
    return Array.prototype.some.call(select.options, function (option) {
      return option.value === value;
    });
  }

  function updateFilter(filter) {
    var select = filter.querySelector("[data-region-select]");
    var note = filter.querySelector("[data-region-note]");
    var cards = Array.prototype.slice.call(filter.querySelectorAll("[data-region-card]"));
    var selected = select.value;
    var visibleCount = 0;

    cards.forEach(function (card) {
      var regions = regionList(card);
      var isVisible = selected === GLOBAL_REGION ||
        regions.indexOf(selected) !== -1 ||
        regions.indexOf(GLOBAL_REGION) !== -1;

      card.hidden = !isVisible;
      card.classList.toggle("region-hidden", !isVisible);

      if (isVisible) {
        visibleCount += 1;
      }
    });

    if (note) {
      note.textContent = "Showing " + visibleCount + " locally relevant or broadly useful cards for " + selectedLabel(select) + ". Cards marked global remain visible for every region.";
    }
  }

  function initFilter(filter) {
    var select = filter.querySelector("[data-region-select]");

    if (!select) {
      return;
    }

    var storedRegion = getStoredRegion();

    if (storedRegion && hasOption(select, storedRegion)) {
      select.value = storedRegion;
    }

    updateFilter(filter);

    select.addEventListener("change", function () {
      storeRegion(select.value);
      updateFilter(filter);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-region-filter]"), initFilter);
  });
})();
