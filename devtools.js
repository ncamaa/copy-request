// DevTools script for Copy Detailed Req/Res extension
// This creates a panel in the DevTools that allows copying network requests

chrome.devtools.panels.create(
  "Copy Req/Res", // Panel title
  "icon16.png",   // Icon path
  "panel.html",   // Panel HTML file
  function(panel) {
    console.log("Copy Detailed Req/Res panel created");
  }
);

