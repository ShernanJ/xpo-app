export function normalizeXAvatarUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!normalized.includes("pbs.twimg.com/profile_images/")) {
    return normalized;
  }

  return normalized.replace(/_(normal|bigger|mini)(\.[a-z0-9]+)(\?.*)?$/i, "_400x400$2$3");
}

export function normalizeXHeaderUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!normalized.includes("pbs.twimg.com/profile_banners/")) {
    return normalized;
  }

  if (/\/\d+x\d+(\?.*)?$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized.replace(/\/+$/g, "")}/1500x500`;
}
