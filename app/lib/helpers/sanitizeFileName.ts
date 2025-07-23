export const sanitizeFileName = (name: string) => {
  // 1) normalisera åäö → aao, 2) tillåt bara a‑z, 0‑9, . _ -
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")      // diakrit bort
    .replace(/[^a-zA-Z0-9._-]/g, "_");    // allt annat → _
}