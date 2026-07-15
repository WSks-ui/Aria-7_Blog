export const calculateReadingProgress = (
  scrollY: number,
  start: number,
  scrollHeight: number,
  viewportHeight: number,
): number => {
  const end = start + scrollHeight - viewportHeight;
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (scrollY - start) / (end - start)));
};

