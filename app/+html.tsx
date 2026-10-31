import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const pwaScript = `
(function () {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(function (registration) {
      var refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
      registration.addEventListener("updatefound", function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            if (window.confirm("A new OBI-ISM version is ready. Reload now?")) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          }
        });
      });
    }).catch(function () {});
  });
})();
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#0B0F14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="OBI-ISM" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <ScrollViewStyleReset />
        <style>{`@media print { html, body, #root { display: none !important; visibility: hidden !important; } }`}</style>
        <script dangerouslySetInnerHTML={{ __html: pwaScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
