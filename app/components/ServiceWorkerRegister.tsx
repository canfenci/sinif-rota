"use client";

import { useEffect, useRef, useState } from "react";

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
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateShownRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    let disposed = false;
    let controllerListenerAttached = false;

    const notifyUpdateReady = () => {
      if (disposed) return;
      if (updateShownRef.current) return;
      updateShownRef.current = true;
      setUpdateAvailable(true);
    };

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

          // A worker already waiting to take over is a pending update.
          if (registration.waiting) {
            notifyUpdateReady();
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
                  notifyUpdateReady();
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

  if (!updateAvailable) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-text">
        <strong>Yeni sürüm hazır</strong>
        <p>Uygulamayı güncellemek için açık sekmeleri kapatıp yeniden açın.</p>
      </div>
      <button type="button" className="update-banner-dismiss" onClick={() => setUpdateAvailable(false)}>
        Tamam
      </button>
    </div>
  );
}