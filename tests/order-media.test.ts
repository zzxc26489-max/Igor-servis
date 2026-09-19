import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderMediaPath,
  mediaExtension,
  validateOrderMediaFile,
} from "../src/lib/orderMedia.ts";

test("order media path is scoped by workshop and order", () => {
  assert.equal(
    buildOrderMediaPath("workshop-1", "ord/12", "media:1", "photo.JPG", "image/jpeg"),
    "workshop-1/ord_12/media_1.jpg",
  );
});

test("media validation rejects unsupported and oversized files", () => {
  assert.match(validateOrderMediaFile({ size: 100, type: "application/pdf" }) ?? "", /JPG/);
  assert.match(validateOrderMediaFile({ size: 26 * 1024 * 1024, type: "video/mp4" }) ?? "", /25 МБ/);
  assert.equal(validateOrderMediaFile({ size: 2 * 1024 * 1024, type: "image/webp" }), null);
});

test("media extension falls back to mime type", () => {
  assert.equal(mediaExtension("camera", "video/quicktime"), "mov");
});


test("media extension falls back to MIME when filename has no dot", () => {
  assert.equal(mediaExtension("photo", "image/jpeg"), "jpg");
  assert.equal(mediaExtension("scan", "image/png"), "png");
  assert.equal(mediaExtension("clip", "video/quicktime"), "mov");
});
