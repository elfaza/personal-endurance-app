export async function compressMealPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))
    throw new Error(
      "Choose a JPEG, PNG or WebP photo. If HEIC cannot open, export it as JPEG first.",
    );
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error(
        "This photo could not be opened. Try a JPEG, PNG or WebP file.",
      );
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      640 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.75, 0.6, 0.45, 0.3]) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (atob(encoded.split(",")[1]).length <= 48000) return encoded;
    }
    throw new Error(
      "This photo has too much detail for a Sheet preview. Crop it closer to the meal and try again.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
