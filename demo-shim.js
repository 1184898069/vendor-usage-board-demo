// Demo shim: serve captured demo payloads instead of the FastAPI backend.
(function () {
  var origFetch = window.fetch.bind(window);
  function route(url) {
    var path = String(url).split("?")[0];
    if (path === "/api/vendors") return "data/vendors.json";
    if (path === "/api/overview") return "data/overview.json";
    var m = path.match(/^\/api\/vendors\/([^/]+)\/dashboard$/);
    if (m) return "data/dashboard-" + decodeURIComponent(m[1]) + ".json";
    return null;
  }
  window.fetch = function (input, init) {
    var target = route(typeof input === "string" ? input : input.url);
    if (target) return origFetch(target, init);
    return origFetch(input, init);
  };
})();
