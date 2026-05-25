(function () {
  function normalize(value) {
    return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function searchableText(item) {
    return normalize([
      item.getAttribute("data-archive-title"),
      item.getAttribute("data-archive-tags"),
      item.textContent
    ].join(" "));
  }

  function initArchiveSearch(searchRoot) {
    var input = searchRoot.querySelector("[data-archive-search-input]");
    var count = searchRoot.querySelector("[data-archive-search-count]");
    var list = document.querySelector("[data-archive-search-list]");

    if (!input || !list) {
      return;
    }

    var chapters = Array.prototype.slice.call(list.querySelectorAll(".contents-chapter"));
    var empty = document.createElement("p");
    empty.className = "archive-empty archive-hidden";
    empty.textContent = "No matching doors yet. Try a broader word, or return to the full contents.";
    list.appendChild(empty);

    function update() {
      var query = normalize(input.value);
      var visibleChapters = 0;
      var visibleTopics = 0;

      chapters.forEach(function (chapter) {
        var chapterMatches = !query || searchableText(chapter).indexOf(query) !== -1;
        var topics = Array.prototype.slice.call(chapter.querySelectorAll("li[data-archive-item]"));
        var matchedTopics = 0;

        topics.forEach(function (topic) {
          var topicMatches = !query || searchableText(topic).indexOf(query) !== -1;
          topic.hidden = !topicMatches;
          topic.classList.toggle("archive-hidden", !topicMatches);

          if (topicMatches) {
            matchedTopics += 1;
          }
        });

        var showChapter = chapterMatches || matchedTopics > 0;
        chapter.hidden = !showChapter;
        chapter.classList.toggle("archive-hidden", !showChapter);

        if (showChapter) {
          visibleChapters += 1;
          visibleTopics += query ? matchedTopics : topics.length;
        }
      });

      empty.classList.toggle("archive-hidden", visibleChapters !== 0);
      empty.hidden = visibleChapters !== 0;

      if (count) {
        if (!query) {
          count.textContent = "Showing all current chapters and completed topic pages.";
        } else {
          count.textContent = "Showing " + visibleChapters + " chapter section" + (visibleChapters === 1 ? "" : "s") + " and " + visibleTopics + " topic match" + (visibleTopics === 1 ? "" : "es") + ".";
        }
      }
    }

    input.addEventListener("input", update);
    update();
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-archive-search]"), initArchiveSearch);
  });
})();
