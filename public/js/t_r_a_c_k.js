window.addEventListener("load", () => {
  fetch(location.origin + "/api/track-view-time", {
    method: "POST",
    keepalive: true
  });
});