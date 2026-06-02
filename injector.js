(function () {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () {
    this.remove();
  };

  const target = document.head || document.documentElement;
  target.prepend(script);
})();
