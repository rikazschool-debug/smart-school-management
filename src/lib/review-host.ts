/** Demo buttons only in the review (preview / local) environment, never on the published site. */
export const isReviewHost = (h: string) =>
  h === "localhost" || h.startsWith("127.") || h.startsWith("id-preview--") || h.includes("preview--") || h.endsWith(".lovableproject.com");
