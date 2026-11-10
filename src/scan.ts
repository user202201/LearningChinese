/**
 * Scan a sign-in QR code with the camera (the code that Settings → "Sign in on another device" shows on a device that is already signed in).
 * Works in the browser (needs https or localhost) and in the iOS app (the app needs the camera permission text, see mobile/ later).
 * The camera is only used while the scan window is open and is always switched off again; nothing is recorded or sent anywhere.
 */
import jsQR from "jsqr";
import { h, modal } from "./ui";

/** Opens the camera; resolves with what `parse` made of the first QR code it accepts, `null` when the window was cancelled. Throws a readable error when there is no camera. */
export async function scanQr<T>(parse: (text: string) => T | null): Promise<T | null> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("这个浏览器不能使用相机（需要 https 或 localhost）");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new Error(name === "NotAllowedError" || name === "SecurityError" ? "没有相机权限，请在浏览器或系统设置里允许使用相机" : "打不开相机，请改用手动输入");
  }
  let stopped = false;
  const stop = () => {
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
  };
  try {
    return await modal<T>((close) => {
      const video = h("video", { playsInline: true, muted: true, autoplay: true, class: "scan-video" });
      video.srcObject = stream;
      const hint = h("p", { class: "muted center", id: "scan-hint" }, "对准另一台设备上的登录二维码");
      const canvas = document.createElement("canvas");
      const g = canvas.getContext("2d", { willReadFrequently: true })!;
      const tick = () => {
        if (stopped) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const w = Math.min(640, video.videoWidth);
          canvas.width = w;
          canvas.height = Math.round((video.videoHeight * w) / video.videoWidth);
          g.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = g.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            const r = parse(code.data);
            if (r) return close(r);
            hint.textContent = "这不是本应用的登录二维码";
            hint.className = "err center";
          }
        }
        setTimeout(() => requestAnimationFrame(tick), 80); // ~12 looks per second is plenty
      };
      void video.play().catch(() => {});
      requestAnimationFrame(tick);
      return h("div", { class: "dlg" }, h("h2", {}, "扫描登录二维码"), h("div", { class: "scan-frame" }, video), hint,
        h("button", { class: "wide", onclick: () => close(null) }, "取消"));
    });
  } finally {
    stop();
  }
}
