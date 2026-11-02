/** 프로필 사진: 가운데를 정사각형으로 잘라 240px JPEG 데이터 주소로 바꾼다(내 정보·카풀 글 사진 등록 공용). */
export async function shrinkProfile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 240, 240);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 240, 240);
  return canvas.toDataURL("image/jpeg", 0.82);
}
