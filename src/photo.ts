/**
 * Avatar pictures: from the photo library (a file the user picks) or the camera. The picture is cut to a centred square, made small
 * (192 px, JPEG) and kept as a data: URL inside kids.json, so it travels with the rest of the data (a few KB per child). Nothing is sent anywhere.
 */
import { h, modal } from "./ui";

export const AVATAR_PX = 192;

function squareJpeg(src: CanvasImageSource, w: number, h2: number): string {
  const side = Math.min(w, h2);
  const c = document.createElement("canvas");
  c.width = c.height = AVATAR_PX;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  g.drawImage(src, (w - side) / 2, (h2 - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  return c.toDataURL("image/jpeg", 0.82);
}

/** a picture file (from the photo library) -> avatar */
export async function fileToAvatar(file: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(file); // (turns photos the right way up)
    const url = squareJpeg(bmp, bmp.width, bmp.height);
    bmp.close();
    return url;
  } catch {
    // browsers without createImageBitmap for this type: an <img> element
    const u = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = u;
      await img.decode();
      return squareJpeg(img, img.naturalWidth, img.naturalHeight);
    } catch {
      throw new Error("这张图片打不开，请换一张");
    } finally {
      URL.revokeObjectURL(u);
    }
  }
}

/** The front camera with a shutter button. Resolves with the avatar, `null` when cancelled; throws a readable error when there is no camera. */
export async function takePhoto(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("这个浏览器不能使用相机（需要 https 或 localhost）");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new Error(name === "NotAllowedError" || name === "SecurityError" ? "没有相机权限，请在浏览器或系统设置里允许使用相机" : "打不开相机，请改用“从相册选择”");
  }
  try {
    return await modal<string>((close) => {
      const video = h("video", { playsInline: true, muted: true, autoplay: true, class: "scan-video mirror" });
      video.srcObject = stream;
      void video.play().catch(() => {});
      const shoot = h("button", { class: "shutter", id: "shutter", title: "拍照", "aria-label": "拍照", onclick: () => {
        if (!video.videoWidth) return;
        close(squareJpeg(video, video.videoWidth, video.videoHeight));
      } });
      return h("div", { class: "dlg" }, h("h2", {}, "拍一张头像"), h("div", { class: "scan-frame round" }, video),
        h("div", { class: "row center-row" }, shoot), h("button", { class: "wide", onclick: () => close(null) }, "取消"));
    });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
