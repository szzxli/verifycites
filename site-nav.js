/* Shared VerifyCites bar: brand, section links, and the language choice.
   The choice is stored as vc-lang and read by /, /legal/, and /papers/.
   A query string such as ?ref= is not a route and is ignored here. */
(function () {
  var KEY = "vc-lang";
  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      if (value === "en" || value === "es" || value === "zh") return value;
    } catch (e) {}
    return "en";
  }
  function mark(lang) {
    var buttons = document.querySelectorAll("[data-vc-lang]");
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute("data-vc-lang") === lang;
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
      buttons[i].classList.toggle("is-active", on);
    }
  }
  function apply(lang) {
    if (lang !== "en" && lang !== "es" && lang !== "zh") lang = "en";
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    mark(lang);
    if (typeof window.vcApplyLang === "function") window.vcApplyLang(lang);
    else if (typeof window.setLang === "function") window.setLang(lang);
    else document.documentElement.lang = lang;
  }
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-lang]") : null;
    if (!btn) return;
    apply(btn.getAttribute("data-vc-lang"));
  });
  function boot() { apply(stored()); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
