/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LoadedSpriteStats {
  totalFiles: number;
  matchedByPath: number;
  matchedByName: number;
  detectedPacks: string[];
}

type Listener = () => void;

class SpritePackStore {
  private urlByNormalizedPath = new Map<string, string>();
  private urlByBasename = new Map<string, string>();
  private imageByUrl = new Map<string, HTMLImageElement>();
  private listeners = new Set<Listener>();
  private detectedPacks = new Set<string>();
  private totalFiles = 0;

  private normalizePath(rawPath: string): string {
    return rawPath
      .replace(/\\/g, '/')
      .replace(/^__([^/]+)__\//, '$1/')
      .replace(/^\/+/, '')
      .toLowerCase();
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async loadFromFileList(files: FileList | File[]): Promise<LoadedSpriteStats> {
    const fileArray = Array.from(files).filter((f) =>
      /\.(png|webp|jpg|jpeg)$/i.test(f.name)
    );

    let matchedByPath = 0;
    let matchedByName = 0;

    for (const file of fileArray) {
      const rel = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(
        /\\/g,
        '/'
      );
      const lowerRel = rel.toLowerCase();
      const url = URL.createObjectURL(file);

      // Index full relative path and common Factorio sub-roots (base/..., space-age/..., Krastorio2Assets/...)
      const segments = lowerRel.split('/');
      for (let i = 0; i < segments.length; i++) {
        const sub = segments.slice(i).join('/');
        if (!this.urlByNormalizedPath.has(sub)) {
          this.urlByNormalizedPath.set(sub, url);
          matchedByPath++;
        }
        if (segments[i] === 'base' || segments[i] === 'space-age' || segments[i].includes('krastorio')) {
          this.detectedPacks.add(segments[i]);
        }
      }

      // Index basename (e.g., "foundry.png" -> "foundry" and "kr-crusher.png" -> "kr-crusher")
      const filename = segments[segments.length - 1];
      const stem = filename.replace(/\.[^.]+$/, '');
      // Prefer item/fluid/entity icons over item-group/entity/tech sheets when indexing by stem
      const isIcon = lowerRel.includes('/icons/') || lowerRel.includes('\\icons\\');
      const isIgnoredAux =
        lowerRel.includes('shadow') ||
        lowerRel.includes('reflection') ||
        lowerRel.includes('/technology/') ||
        lowerRel.includes('/achievement/') ||
        lowerRel.includes('/tips-and-tricks/');
      if (!isIgnoredAux && (isIcon || !this.urlByBasename.has(stem))) {
        this.urlByBasename.set(stem, url);
        matchedByName++;
      }

      this.totalFiles++;
      // Preload image into cache asynchronously
      const img = new Image();
      img.src = url;
      this.imageByUrl.set(url, img);
    }

    this.notify();

    return {
      totalFiles: this.totalFiles,
      matchedByPath,
      matchedByName,
      detectedPacks: Array.from(this.detectedPacks),
    };
  }

  clear(): void {
    for (const url of new Set([
      ...this.urlByNormalizedPath.values(),
      ...this.urlByBasename.values(),
    ])) {
      URL.revokeObjectURL(url);
    }
    this.urlByNormalizedPath.clear();
    this.urlByBasename.clear();
    this.imageByUrl.clear();
    this.detectedPacks.clear();
    this.totalFiles = 0;
    this.notify();
  }

  getStats(): LoadedSpriteStats {
    return {
      totalFiles: this.totalFiles,
      matchedByPath: this.urlByNormalizedPath.size,
      matchedByName: this.urlByBasename.size,
      detectedPacks: Array.from(this.detectedPacks),
    };
  }

  resolveUrl(id: string, iconPath?: string): string | undefined {
    if (iconPath) {
      const normalized = this.normalizePath(iconPath);
      const exact = this.urlByNormalizedPath.get(normalized);
      if (exact) return exact;

      // Try stripping leading mod folder (e.g., base/graphics/icons/foo.png -> graphics/icons/foo.png)
      const slashIdx = normalized.indexOf('/');
      if (slashIdx !== -1) {
        const withoutMod = normalized.slice(slashIdx + 1);
        const match = this.urlByNormalizedPath.get(withoutMod);
        if (match) return match;
      }
    }

    const cleanId = id.toLowerCase();
    return (
      this.urlByBasename.get(cleanId) ??
      this.urlByBasename.get(cleanId.replace(/^kr-/, '')) ??
      this.urlByNormalizedPath.get(`graphics/icons/${cleanId}.png`) ??
      this.urlByNormalizedPath.get(`base/graphics/icons/${cleanId}.png`) ??
      this.urlByNormalizedPath.get(`space-age/graphics/icons/${cleanId}.png`)
    );
  }

  resolveGroupUrl(
    groupId: string,
    iconPath?: string,
    fallbackItemId?: string,
    fallbackIconPath?: string
  ): string | undefined {
    const cleanGroup = groupId.toLowerCase();
    const candidates = [
      iconPath ? this.normalizePath(iconPath) : undefined,
      `base/graphics/item-group/${cleanGroup}.png`,
      `space-age/graphics/item-group/${cleanGroup}.png`,
      `graphics/item-group/${cleanGroup}.png`,
    ].filter((c): c is string => Boolean(c));

    for (const candidate of candidates) {
      const exact = this.urlByNormalizedPath.get(candidate);
      if (exact) return exact;
      const slashIdx = candidate.indexOf('/');
      if (slashIdx !== -1) {
        const stripped = this.urlByNormalizedPath.get(candidate.slice(slashIdx + 1));
        if (stripped) return stripped;
      }
    }

    if (fallbackItemId) {
      return this.resolveUrl(fallbackItemId, fallbackIconPath);
    }
    return undefined;
  }

  resolveImage(id: string, iconPath?: string): HTMLImageElement | undefined {
    const url = this.resolveUrl(id, iconPath);
    if (!url) return undefined;
    let img = this.imageByUrl.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      this.imageByUrl.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : undefined;
  }
}

export const spritePackStore = new SpritePackStore();
