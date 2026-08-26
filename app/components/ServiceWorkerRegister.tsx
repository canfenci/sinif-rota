"use client";

import { useEffect } from "react";

function collectPageAssetUrls(): string[] {
  if (typeof window === "undefined" || typeof document === "undefined") return [];
  const urls = new Set<string>();

  // 1. Script and Stylesheet tags in DOM
  document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>("link[rel='stylesheet'], script[src]").forEach((el) => {
    const src = (el as HTMLLinkElement).href || (el as HTMLScriptElement).src;
    if (src && src.startsWith(window.location.origin)) {
      urls.add(new URL(src).pathname);
    }
  });

  // 2. Performance Resource Timing for _next/ static bundles
  if (window.performance && typeof window.performance.getEntriesByType === "function") {
    window.performance.getEntriesByType("resource").forEach((entry) => {
      if (entry.name && entry.name.startsWith(window.location.origin)) {
        const path = new URL(entry.name).pathname;
        if (path.startsWith("/_next/") || path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".woff2")) {
          urls.add(path);
        }
      }
    });
  }

  return Array.from(urls);
}

function sendWarmCacheMessage(worker: ServiceWorker | null | undefined) {
  if (!worker) return;
  const urls = collectPageAssetUrls();
  if (urls.length > 0) {
    worker.postMessage({ type: "WARM_CACHE", urls });
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    let disposed = false;
    let controllerListenerAttached = false;

    const handleControllerChange = () => {
      sendWarmCacheMessage(navigator.serviceWorker.controller);
    };

    const handleLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          if (disposed) return;

          // If already controlling, warm cache with initial page assets
          if (navigator.serviceWorker.controller) {
            sendWarmCacheMessage(navigator.serviceWorker.controller);
          }

          // When a new worker takes control, warm cache
          navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
          controllerListenerAttached = true;

          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.info("[PWA] Yeni sürüm arka planda hazırlandı.");
                }
              };
            }
          };
        })
        .catch((error) => {
          console.warn("[PWA] ServiceWorker kaydı başarısız:", error);
        });
    };

    window.addEventListener("load", handleLoad);
    return () => {
      disposed = true;
      window.removeEventListener("load", handleLoad);
      if (controllerListenerAttached) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }
    };
  }, []);

  return null;
}
