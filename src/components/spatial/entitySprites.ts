/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WikiSpriteImage } from '../../assets/wikiEntitySprites.ts';
import type { GridEntity } from '../../spatial/types.ts';

export type InserterRole = 'input' | 'output' | 'transfer';

export interface PipeNeighborMask {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export function directionToUnitVector(dir: number): { dx: number; dy: number } {
  const d = ((Math.round(dir) % 16) + 16) % 16;
  if (d === 0) return { dx: 0, dy: -1 };
  if (d === 4) return { dx: 1, dy: 0 };
  if (d === 8) return { dx: 0, dy: 1 };
  if (d === 12) return { dx: -1, dy: 0 };
  const rad = (d / 16) * Math.PI * 2;
  return { dx: Math.round(Math.sin(rad)), dy: Math.round(-Math.cos(rad)) };
}

export function buildEntitySpatialLookup(entities: GridEntity[]): Map<string, GridEntity> {
  const map = new Map<string, GridEntity>();
  for (const e of entities) {
    const baseX = Math.round(e.tileX + (e.bpOffsetX ?? 0));
    const baseY = Math.round(e.tileY + (e.bpOffsetY ?? 0));
    for (let dx = 0; dx < e.width; dx++) {
      for (let dy = 0; dy < e.height; dy++) {
        map.set(`${baseX + dx},${baseY + dy}`, e);
      }
    }
  }
  return map;
}

export function classifyInserterRole(
  ent: GridEntity,
  tileMap: Map<string, GridEntity>
): InserterRole {
  const { dx, dy } = directionToUnitVector(ent.direction);
  const reach = ent.inserterReach === 2 || ent.name.includes('long') ? 2 : 1;
  const cx = Math.round(ent.tileX + (ent.bpOffsetX ?? 0));
  const cy = Math.round(ent.tileY + (ent.bpOffsetY ?? 0));

  const pickupEnt = tileMap.get(`${cx - dx * reach},${cy - dy * reach}`);
  const dropEnt = tileMap.get(`${cx + dx * reach},${cy + dy * reach}`);

  if (dropEnt?.kind === 'machine' && pickupEnt?.kind !== 'machine') return 'input';
  if (pickupEnt?.kind === 'machine' && dropEnt?.kind !== 'machine') return 'output';
  if (dropEnt?.kind === 'machine') return 'input';
  if (pickupEnt?.kind === 'machine') return 'output';
  return 'transfer';
}

export function getPipeNeighborMask(
  ent: GridEntity,
  tileMap: Map<string, GridEntity>
): PipeNeighborMask {
  const tx = Math.round(ent.tileX + (ent.bpOffsetX ?? 0));
  const ty = Math.round(ent.tileY + (ent.bpOffsetY ?? 0));
  const connects = (nx: number, ny: number): boolean => {
    const nb = tileMap.get(`${nx},${ny}`);
    if (!nb) return false;
    return nb.kind === 'pipe' || nb.kind === 'pipe-to-ground' || nb.kind === 'machine';
  };
  return {
    n: connects(tx, ty - 1),
    e: connects(tx + 1, ty),
    s: connects(tx, ty + 1),
    w: connects(tx - 1, ty),
  };
}

function drawChamferedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number
) {
  const ch = Math.min(c, w * 0.25, h * 0.25);
  ctx.beginPath();
  ctx.moveTo(x + ch, y);
  ctx.lineTo(x + w - ch, y);
  ctx.lineTo(x + w, y + ch);
  ctx.lineTo(x + w, y + h - ch);
  ctx.lineTo(x + w - ch, y + h);
  ctx.lineTo(x + ch, y + h);
  ctx.lineTo(x, y + h - ch);
  ctx.lineTo(x, y + ch);
  ctx.closePath();
}

export function drawChamferedWikiSprite(
  ctx: CanvasRenderingContext2D,
  img: WikiSpriteImage,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  strokeColor?: string,
  lineWidth = 1.4,
  cropFrac = 0.09
) {
  const imgW = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const imgH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (imgW <= 0 || imgH <= 0) return;

  const minDim = Math.min(w, h);
  const pad = Math.max(1, zoom * 0.045);
  const rx = x + pad;
  const ry = y + pad;
  const rw = Math.max(2, w - pad * 2);
  const rh = Math.max(2, h - pad * 2);

  ctx.save();
  drawChamferedRect(ctx, rx, ry, rw, rh, minDim * 0.1);
  ctx.clip();

  const sx = imgW * cropFrac;
  const sy = imgH * cropFrac;
  const sw = Math.max(1, imgW * (1 - cropFrac * 2));
  const sh = Math.max(1, imgH * (1 - cropFrac * 2));
  ctx.drawImage(img, sx, sy, sw, sh, rx, ry, rw, rh);
  ctx.restore();

  if (strokeColor) {
    drawChamferedRect(ctx, rx, ry, rw, rh, minDim * 0.1);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawToothedGear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  teeth: number,
  angle: number,
  fill: string,
  stroke: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.48;
    const a3 = a0 + step * 0.72;
    if (i === 0) ctx.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    else ctx.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    ctx.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    ctx.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(0.9, outerR * 0.14);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, innerR * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#0F141D';
  ctx.fill();
  ctx.restore();
}

export function drawTransportBeltSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  tSec: number,
  beltColor: string,
  getLaneItemInfo: (itemId: string) => { color: string; img?: HTMLImageElement },
  wikiSprite?: WikiSpriteImage
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = (ent.direction / 16) * Math.PI * 2;
  const speed = ent.name.includes('superior')
    ? 4.0
    : ent.name.includes('turbo')
      ? 3.4
      : ent.name.includes('express')
        ? 2.8
        : ent.name.includes('fast')
          ? 2.1
          : 1.4;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const half = zoom * 0.46;
  const railW = Math.max(1.4, zoom * 0.11);
  const imgW = wikiSprite
    ? wikiSprite instanceof HTMLImageElement
      ? wikiSprite.naturalWidth
      : wikiSprite.width
    : 0;
  const imgH = wikiSprite
    ? wikiSprite instanceof HTMLImageElement
      ? wikiSprite.naturalHeight
      : wikiSprite.height
    : 0;
  const hasWiki = Boolean(wikiSprite && imgW > 0 && imgH > 0);

  if (hasWiki && wikiSprite) {
    // Official Factorio Wiki Underground_belt_entity.png crops (source flows South +Y; rotate PI -> local -Y forward)
    const crop =
      ent.kind === 'underground-belt'
        ? ent.undergroundType === 'output'
          ? { sx: 0.428, sy: 0.672, sw: 0.144, sh: 0.144 }
          : { sx: 0.428, sy: 0.172, sw: 0.144, sh: 0.144 }
        : { sx: 0.431, sy: 0.015, sw: 0.138, sh: 0.138 };

    const tilePad = zoom * 0.49;
    ctx.save();
    ctx.rotate(Math.PI);
    ctx.beginPath();
    ctx.rect(-tilePad, -tilePad, tilePad * 2, tilePad * 2);
    ctx.clip();
    ctx.drawImage(
      wikiSprite,
      imgW * crop.sx,
      imgH * crop.sy,
      imgW * crop.sw,
      imgH * crop.sh,
      -tilePad,
      -tilePad,
      tilePad * 2,
      tilePad * 2
    );
    ctx.restore();

    if (ent.kind === 'underground-belt') {
      ctx.strokeStyle = beltColor;
      ctx.lineWidth = Math.max(1.1, zoom * 0.06);
      ctx.strokeRect(-tilePad + 0.5, -tilePad + 0.5, tilePad * 2 - 1, tilePad * 2 - 1);
    }
  } else {
    // Dark rubber belt bed
    ctx.fillStyle = '#181D26';
    ctx.fillRect(-half, -half, half * 2, half * 2);

    // Side metal guide rails
    ctx.fillStyle = '#333C4D';
    ctx.fillRect(-half, -half, railW, half * 2);
    ctx.fillRect(half - railW, -half, railW, half * 2);

    // Tier color trim strips along inner rails
    ctx.fillStyle = beltColor;
    ctx.fillRect(-half + railW, -half, Math.max(0.9, zoom * 0.045), half * 2);
    ctx.fillRect(
      half - railW - Math.max(0.9, zoom * 0.045),
      -half,
      Math.max(0.9, zoom * 0.045),
      half * 2
    );

    // Static ribbed belt slats + directional chevron
    if (zoom >= 8) {
      const slatCount = 3;
      const spacing = (half * 2) / slatCount;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
      ctx.lineWidth = Math.max(1, zoom * 0.045);
      for (let i = 1; i < slatCount; i++) {
        const sy = -half + i * spacing;
        ctx.beginPath();
        ctx.moveTo(-half + railW + 1, sy);
        ctx.lineTo(half - railW - 1, sy);
        ctx.stroke();
      }
    }

    // Crisp static directional chevron pointing forward (-Y in local space)
    ctx.strokeStyle = beltColor;
    ctx.lineWidth = Math.max(1.4, zoom * 0.095);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-zoom * 0.19, zoom * 0.12);
    ctx.lineTo(0, -zoom * 0.1);
    ctx.lineTo(zoom * 0.19, zoom * 0.12);
    ctx.stroke();
  }

  // Static dual-lane carried items
  if (ent.beltLanes && zoom >= 11) {
    const drawLaneItem = (itemId: string | undefined, laneOffsetX: number) => {
      if (!itemId) return;
      const info = getLaneItemInfo(itemId);
      const itemSize = Math.max(3.6, zoom * 0.24);
      const itemY = -zoom * 0.16;
      if (info.img) {
        ctx.drawImage(
          info.img,
          laneOffsetX - itemSize / 2,
          itemY - itemSize / 2,
          itemSize,
          itemSize
        );
      } else {
        ctx.fillStyle = info.color;
        ctx.beginPath();
        ctx.arc(laneOffsetX, itemY, itemSize * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0B0E14';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    };
    drawLaneItem(ent.beltLanes.left, -zoom * 0.2);
    drawLaneItem(ent.beltLanes.right, zoom * 0.2);
  }
  void tSec;
  void speed;

  // Underground Belt steel hood portal vector fallback when Wiki sprite is still loading
  if (!hasWiki && ent.kind === 'underground-belt') {
    const isInput = ent.undergroundType !== 'output';
    // Input dives underground toward front (-Y); Output emerges from underground at back (+Y)
    const hoodY = isInput ? -half : 0;
    const hoodH = half;

    // Dark tunnel shadow
    ctx.fillStyle = '#090C12';
    ctx.fillRect(-half + railW * 0.4, hoodY, half * 2 - railW * 0.8, hoodH);

    // Metallic hooded cover with beveled arch & tier-colored lip
    ctx.fillStyle = '#3B4558';
    drawChamferedRect(
      ctx,
      -half,
      isInput ? -half : hoodH * 0.15,
      half * 2,
      hoodH * 0.85,
      zoom * 0.12
    );
    ctx.fill();
    ctx.strokeStyle = beltColor;
    ctx.lineWidth = Math.max(1.4, zoom * 0.085);
    ctx.stroke();

    // Portal mouth arc indicator
    ctx.fillStyle = '#0B0E14';
    ctx.fillRect(
      -half * 0.65,
      isInput ? -zoom * 0.08 : zoom * 0.02,
      half * 1.3,
      zoom * 0.08
    );
  }

  ctx.restore();
}

export function drawSplitterSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  tSec: number,
  beltColor: string,
  wikiSprite?: WikiSpriteImage
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = (ent.direction / 16) * Math.PI * 2;
  const span = zoom * 1.92;
  const depth = zoom * 0.92;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const imgW = wikiSprite
    ? wikiSprite instanceof HTMLImageElement
      ? wikiSprite.naturalWidth
      : wikiSprite.width
    : 0;
  const imgH = wikiSprite
    ? wikiSprite instanceof HTMLImageElement
      ? wikiSprite.naturalHeight
      : wikiSprite.height
    : 0;

  if (wikiSprite && imgW > 0 && imgH > 0) {
    // Official Factorio Wiki Splitter_entity_anim.gif frame-0 static crop (source flows South +Y; rotate PI -> local -Y forward)
    const sx = imgW * 0.383;
    const sy = imgH * 0.415;
    const sw = imgW * 0.277;
    const sh = imgH * 0.142;

    ctx.save();
    ctx.rotate(Math.PI);
    drawChamferedRect(ctx, -zoom * 0.98, -zoom * 0.5, zoom * 1.96, zoom * 1.0, zoom * 0.1);
    ctx.clip();
    ctx.drawImage(wikiSprite, sx, sy, sw, sh, -zoom * 0.98, -zoom * 0.5, zoom * 1.96, zoom * 1.0);
    ctx.restore();

    drawChamferedRect(ctx, -zoom * 0.98, -zoom * 0.5, zoom * 1.96, zoom * 1.0, zoom * 0.1);
    ctx.strokeStyle = beltColor;
    ctx.lineWidth = Math.max(1.1, zoom * 0.06);
    ctx.stroke();

    ctx.restore();
    void tSec;
    return;
  }

  // Two parallel belt beds running underneath (-Y is forward)
  for (const laneX of [-zoom * 0.5, zoom * 0.5]) {
    ctx.fillStyle = '#181D26';
    ctx.fillRect(laneX - zoom * 0.4, -depth / 2, zoom * 0.8, depth);
    ctx.strokeStyle = beltColor;
    ctx.lineWidth = Math.max(1, zoom * 0.06);
    ctx.beginPath();
    ctx.moveTo(laneX - zoom * 0.16, depth * 0.34);
    ctx.lineTo(laneX, depth * 0.16);
    ctx.lineTo(laneX + zoom * 0.16, depth * 0.34);
    ctx.moveTo(laneX - zoom * 0.16, -depth * 0.24);
    ctx.lineTo(laneX, -depth * 0.42);
    ctx.lineTo(laneX + zoom * 0.16, -depth * 0.24);
    ctx.stroke();
  }

  // Heavy industrial cross-bridge housing
  const barH = depth * 0.54;
  drawChamferedRect(ctx, -span / 2, -barH / 2, span, barH, zoom * 0.12);
  ctx.fillStyle = '#2B3547';
  ctx.fill();
  ctx.strokeStyle = beltColor;
  ctx.lineWidth = Math.max(1.4, zoom * 0.09);
  ctx.stroke();

  // Static balanced pusher bar in center
  ctx.fillStyle = beltColor;
  ctx.fillRect(-span * 0.22, -barH * 0.22, span * 0.44, barH * 0.44);

  // Center divider cap
  ctx.fillStyle = '#0F141D';
  ctx.fillRect(-zoom * 0.08, -barH * 0.38, zoom * 0.16, barH * 0.76);

  ctx.restore();
  void tSec;
}

export function drawPipeSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  fluidColor: string,
  mask: PipeNeighborMask
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rOuter = zoom * 0.28;
  const rInner = zoom * 0.15;
  const half = zoom * 0.49;

  ctx.save();
  ctx.translate(cx, cy);

  if (ent.kind === 'pipe-to-ground') {
    const angle = (ent.direction / 16) * Math.PI * 2;
    ctx.rotate(angle);
    // Floor socket
    ctx.fillStyle = '#0D121A';
    ctx.beginPath();
    ctx.arc(0, -zoom * 0.08, rOuter * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = Math.max(1.2, zoom * 0.07);
    ctx.stroke();

    // Elbow pipe diving into ground
    ctx.fillStyle = '#334155';
    ctx.fillRect(-rOuter, 0, rOuter * 2, half);
    ctx.fillStyle = fluidColor;
    ctx.fillRect(-rInner, 0, rInner * 2, half);
    ctx.beginPath();
    ctx.arc(0, 0, rOuter, 0, Math.PI * 2);
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rInner * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = fluidColor;
    ctx.fill();
    ctx.restore();
    return;
  }

  // Connected Factorio pipe arms
  const hasAny = mask.n || mask.e || mask.s || mask.w;
  const n = hasAny ? mask.n : true;
  const s = hasAny ? mask.s : true;
  const e = mask.e;
  const west = mask.w;

  ctx.fillStyle = '#2A3647';
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = Math.max(1, zoom * 0.06);

  if (n) ctx.fillRect(-rOuter, -half, rOuter * 2, half);
  if (s) ctx.fillRect(-rOuter, 0, rOuter * 2, half);
  if (west) ctx.fillRect(-half, -rOuter, half, rOuter * 2);
  if (e) ctx.fillRect(0, -rOuter, half, rOuter * 2);

  // Center junction hub + sight glass
  ctx.beginPath();
  ctx.arc(0, 0, rOuter * 1.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Fluid core sight lines
  ctx.fillStyle = fluidColor;
  if (n) ctx.fillRect(-rInner * 0.7, -half, rInner * 1.4, half);
  if (s) ctx.fillRect(-rInner * 0.7, 0, rInner * 1.4, half);
  if (west) ctx.fillRect(-half, -rInner * 0.7, half, rInner * 1.4);
  if (e) ctx.fillRect(0, -rInner * 0.7, half, rInner * 1.4);

  ctx.beginPath();
  ctx.arc(0, 0, rInner, 0, Math.PI * 2);
  ctx.fill();

  // Flange collars at tile edges
  if (zoom >= 12) {
    ctx.fillStyle = '#475569';
    const fThick = Math.max(1.5, zoom * 0.08);
    if (n) ctx.fillRect(-rOuter * 1.15, -half, rOuter * 2.3, fThick);
    if (s) ctx.fillRect(-rOuter * 1.15, half - fThick, rOuter * 2.3, fThick);
    if (west) ctx.fillRect(-half, -rOuter * 1.15, fThick, rOuter * 2.3);
    if (e) ctx.fillRect(half - fThick, -rOuter * 1.15, fThick, rOuter * 2.3);
  }

  ctx.restore();
}

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

export function drawInserterSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  tSec: number,
  animateFlow: boolean,
  role: InserterRole,
  tierColor: string,
  itemColor?: string
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const baseAngle = (ent.direction / 16) * Math.PI * 2;
  const isLong = ent.inserterReach === 2 || ent.name.includes('long');
  const reach = isLong ? zoom * 0.88 : zoom * 0.56;

  // Distinct role cue colors so Input (into machine) vs Output (out of machine) is immediately legible
  const roleColor =
    role === 'input' ? '#22D3EE' : role === 'output' ? '#F59E0B' : '#94A3B8';
  const roleGlow =
    role === 'input'
      ? 'rgba(34, 211, 238, 0.22)'
      : role === 'output'
        ? 'rgba(245, 158, 11, 0.22)'
        : 'rgba(148, 163, 184, 0.14)';

  ctx.save();
  ctx.translate(cx, cy);
  // Orient local coordinates so local -Y = drop direction (+dir), local +Y = pickup direction (-dir)
  ctx.rotate(baseAngle);

  // 1. FIXED DIRECTIONAL PEDESTAL BASE (never rotates with arm!)
  const padR = zoom * 0.34;
  drawChamferedRect(ctx, -padR, -padR, padR * 2, padR * 2, zoom * 0.09);
  ctx.fillStyle = '#171E29';
  ctx.fill();
  ctx.strokeStyle = roleColor;
  ctx.lineWidth = Math.max(1.25, zoom * 0.075);
  ctx.stroke();

  // Pickup tail cradle on +Y (rear) side
  ctx.fillStyle = roleGlow;
  ctx.fillRect(-zoom * 0.18, zoom * 0.14, zoom * 0.36, zoom * 0.22);

  // Bold FIXED drop-direction chevron pointing to -Y (drop target)
  const tipY = -zoom * 0.45;
  ctx.fillStyle = roleColor;
  ctx.beginPath();
  ctx.moveTo(0, tipY);
  ctx.lineTo(-zoom * 0.18, tipY + zoom * 0.22);
  ctx.lineTo(0, tipY + zoom * 0.14);
  ctx.lineTo(zoom * 0.18, tipY + zoom * 0.22);
  ctx.closePath();
  ctx.fill();

  // Center shoulder turret ring (tier color)
  ctx.beginPath();
  ctx.arc(0, 0, zoom * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#0F141D';
  ctx.fill();
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = Math.max(1.4, zoom * 0.08);
  ctx.stroke();

  // 2. STATIC ARTICULATED MECHANICAL ARM
  // Static pose clearly pointing toward drop side with distinct left/right bias per role
  const swingSide = role === 'output' ? -1 : 1;
  const armAngle = role === 'output' ? -0.22 : 0.22;
  const holdingItem = true;
  const extFactor = 0.86;
  void tSec;
  void animateFlow;
  void smoothstep;

  const targetX = Math.sin(armAngle) * reach * extFactor;
  const targetY = -Math.cos(armAngle) * reach * extFactor;
  // Bent elbow joint halfway out
  const elbowBias = zoom * 0.14 * swingSide;
  const midX = targetX * 0.48 + (-Math.cos(armAngle)) * elbowBias;
  const midY = targetY * 0.48 + (-Math.sin(armAngle)) * elbowBias;

  // Upper arm (shoulder -> elbow)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0B0E14';
  ctx.lineWidth = Math.max(3, zoom * 0.16);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(midX, midY);
  ctx.lineTo(targetX, targetY);
  ctx.stroke();

  ctx.strokeStyle = tierColor;
  ctx.lineWidth = Math.max(1.8, zoom * 0.1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(midX, midY);
  ctx.lineTo(targetX, targetY);
  ctx.stroke();

  // Elbow rivet
  ctx.fillStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.arc(midX, midY, Math.max(1.3, zoom * 0.065), 0, Math.PI * 2);
  ctx.fill();

  // Articulated pincer claw at wrist
  const wristAngle = Math.atan2(targetY - midY, targetX - midX);
  ctx.save();
  ctx.translate(targetX, targetY);
  ctx.rotate(wristAngle);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = Math.max(1.2, zoom * 0.06);
  const clawOpen = holdingItem ? zoom * 0.06 : zoom * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, -clawOpen * 0.5);
  ctx.lineTo(zoom * 0.11, -clawOpen);
  ctx.moveTo(0, clawOpen * 0.5);
  ctx.lineTo(zoom * 0.11, clawOpen);
  ctx.stroke();

  if (holdingItem) {
    ctx.fillStyle = itemColor ?? roleColor;
    ctx.beginPath();
    ctx.arc(zoom * 0.06, 0, Math.max(1.8, zoom * 0.095), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0B0E14';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();

  // Fixed filter indicator badge on pedestal when inserter has item filters (e.g. mixed-wagon sorting)
  if (ent.isFiltered && zoom >= 8) {
    const bx = zoom * 0.24;
    const by = zoom * 0.22;
    const r = Math.max(2.2, zoom * 0.12);
    ctx.fillStyle = '#0B0E14';
    ctx.beginPath();
    ctx.moveTo(bx, by - r);
    ctx.lineTo(bx + r, by);
    ctx.lineTo(bx, by + r);
    ctx.lineTo(bx - r, by);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = Math.max(1, zoom * 0.05);
    ctx.stroke();

    ctx.fillStyle = itemColor ?? '#E879F9';
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawMachineVectorSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  tSec: number,
  animateFlow: boolean,
  accent: string,
  isStageSelected: boolean
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const minDim = Math.min(w, h);
  const isK2 = ent.name.startsWith('kr-');

  // Outer armored chassis
  const pad = Math.max(1.5, zoom * 0.06);
  drawChamferedRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, minDim * 0.1);
  ctx.fillStyle = isK2 ? '#1E1A2D' : '#1E2634';
  ctx.fill();
  ctx.strokeStyle = isStageSelected ? '#F59E0B' : isK2 ? '#8B5CF6' : '#475569';
  ctx.lineWidth = isStageSelected ? 2.2 : Math.max(1.2, zoom * 0.06);
  ctx.stroke();

  // Four corner structural mounting clamps
  if (zoom >= 10) {
    const cSz = minDim * 0.14;
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + pad + 2, y + pad + 2, cSz, cSz * 0.45);
    ctx.fillRect(x + w - pad - 2 - cSz, y + pad + 2, cSz, cSz * 0.45);
    ctx.fillRect(x + pad + 2, y + h - pad - 2 - cSz * 0.45, cSz, cSz * 0.45);
    ctx.fillRect(x + w - pad - 2 - cSz, y + h - pad - 2 - cSz * 0.45, cSz, cSz * 0.45);
  }

  // Recessed inner work bay
  const inset = minDim * 0.14;
  drawChamferedRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, minDim * 0.08);
  ctx.fillStyle = '#11161F';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, zoom * 0.045);
  ctx.stroke();

  // Tier indicator stripe along top rim for assemblers / furnaces
  const tierColor = ent.name.includes('3') || ent.name.includes('advanced')
    ? '#FACC15'
    : ent.name.includes('2')
      ? '#38BDF8'
      : ent.name.includes('1')
        ? '#94A3B8'
        : accent;

  if (ent.name.includes('foundry') || ent.name.includes('furnace')) {
    // Heat sink fins on left & right
    if (zoom >= 10) {
      ctx.fillStyle = '#334155';
      for (let i = 0; i < 3; i++) {
        const fy = y + h * (0.24 + i * 0.22);
        ctx.fillRect(x + pad + 1, fy, w * 0.09, h * 0.1);
        ctx.fillRect(x + w - pad - 1 - w * 0.09, fy, w * 0.09, h * 0.1);
      }
    }
    // Static smelting crucible
    const pulse = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.29, 0, Math.PI * 2);
    ctx.fillStyle = '#29211B';
    ctx.fill();
    ctx.strokeStyle = '#78716C';
    ctx.lineWidth = Math.max(1.2, zoom * 0.07);
    ctx.stroke();

    const grad = ctx.createRadialGradient(cx, cy, minDim * 0.04, cx, cy, minDim * 0.23);
    grad.addColorStop(0, `rgba(254, 240, 138, ${pulse})`);
    grad.addColorStop(0.6, `rgba(249, 115, 22, ${pulse})`);
    grad.addColorStop(1, 'rgba(154, 52, 18, 0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (ent.name.includes('electromagnetic')) {
    // Twin copper induction coils + static plasma bridge
    for (const sx of [-w * 0.18, w * 0.18]) {
      ctx.beginPath();
      ctx.arc(cx + sx, cy, minDim * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#2A1D12';
      ctx.fill();
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = Math.max(1.6, zoom * 0.09);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + sx, cy, minDim * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
    }
    ctx.strokeStyle = '#E879F9';
    ctx.lineWidth = Math.max(1.4, zoom * 0.065);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.18, cy);
    ctx.lineTo(cx + w * 0.18, cy);
    ctx.stroke();
  } else if (ent.name.includes('cryogenic')) {
    // Twin frosted coolant tanks + manifold bridge
    ctx.fillStyle = '#0E3A4D';
    ctx.strokeStyle = '#22D3EE';
    ctx.lineWidth = Math.max(1.1, zoom * 0.05);
    for (const sx of [-w * 0.18, w * 0.18]) {
      drawChamferedRect(ctx, cx + sx - w * 0.11, cy - h * 0.24, w * 0.22, h * 0.48, minDim * 0.06);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#67E8F9';
    ctx.fillRect(cx - w * 0.18, cy - h * 0.05, w * 0.36, h * 0.1);
  } else if (
    ent.name.includes('chemical') ||
    ent.name.includes('refinery') ||
    ent.name.includes('filtration') ||
    ent.name.includes('electrolysis') ||
    ent.name.includes('condenser')
  ) {
    // Dual pressurized reaction vats + cross pipe
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = Math.max(1.6, zoom * 0.08);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.18, cy - h * 0.12);
    ctx.lineTo(cx + w * 0.18, cy + h * 0.12);
    ctx.stroke();
    for (const [vx, vy, col] of [
      [-w * 0.18, -h * 0.12, '#0EA5E9'],
      [w * 0.18, h * 0.12, '#10B981'],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx + vx, cy + vy, minDim * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = '#182433';
      ctx.fill();
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = Math.max(1.1, zoom * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + vx, cy + vy, minDim * 0.085, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }
  } else if (ent.name.includes('centrifuge')) {
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      const rx = cx + Math.cos(a) * minDim * 0.2;
      const ry = cy + Math.sin(a) * minDim * 0.2;
      ctx.beginPath();
      ctx.arc(rx, ry, minDim * 0.11, 0, Math.PI * 2);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.strokeStyle = '#4ADE80';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#22C55E';
    ctx.fill();
  } else if (ent.name.includes('lab')) {
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.26)';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else {
    // Assembling machine / crusher / rocket silo: static twin toothed gears + tier bar
    drawToothedGear(
      ctx,
      cx - minDim * 0.1,
      cy + minDim * 0.06,
      minDim * 0.22,
      minDim * 0.16,
      8,
      0,
      '#475569',
      tierColor
    );
    drawToothedGear(
      ctx,
      cx + minDim * 0.16,
      cy - minDim * 0.12,
      minDim * 0.14,
      minDim * 0.1,
      6,
      0,
      '#64748B',
      '#CBD5E1'
    );
    ctx.fillStyle = tierColor;
    ctx.fillRect(cx - w * 0.24, y + inset * 0.55, w * 0.48, Math.max(2, zoom * 0.08));
  }
  void tSec;
  void animateFlow;
}

export function drawBeaconVectorSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  tSec: number,
  animateFlow: boolean,
  isStageSelected: boolean
) {
  const isSingularity = ent.name.includes('singularity');
  const bAccent = isSingularity ? '#A855F7' : '#38BDF8';
  const cx = x + w / 2;
  const cy = y + h / 2;
  const minDim = Math.min(w, h);

  drawChamferedRect(ctx, x + 2, y + 2, w - 4, h - 4, minDim * 0.16);
  ctx.fillStyle = '#18212F';
  ctx.fill();
  ctx.strokeStyle = isStageSelected ? '#F59E0B' : bAccent;
  ctx.lineWidth = Math.max(1.3, zoom * 0.065);
  ctx.stroke();

  // 4 corner emitter pylons
  ctx.fillStyle = '#334155';
  for (const [px, py] of [
    [x + w * 0.2, y + h * 0.2],
    [x + w * 0.8, y + h * 0.2],
    [x + w * 0.2, y + h * 0.8],
    [x + w * 0.8, y + h * 0.8],
  ]) {
    ctx.beginPath();
    ctx.arc(px, py, minDim * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // Static radial dish ring
  ctx.save();
  ctx.strokeStyle = bAccent;
  ctx.globalAlpha *= 0.7;
  ctx.lineWidth = Math.max(1.2, zoom * 0.055);
  ctx.beginPath();
  ctx.arc(cx, cy, minDim * 0.31, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  void tSec;
  void animateFlow;

  // Crystalline emitter core
  ctx.fillStyle = bAccent;
  ctx.beginPath();
  ctx.moveTo(cx, cy - minDim * 0.2);
  ctx.lineTo(cx + minDim * 0.2, cy);
  ctx.lineTo(cx, cy + minDim * 0.2);
  ctx.lineTo(cx - minDim * 0.2, cy);
  ctx.closePath();
  ctx.fill();
}

export function drawElectricPoleVectorSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const minDim = Math.min(w, h);
  const isBigOrSub = ent.name.includes('substation') || ent.name.includes('big');

  if (ent.name.includes('substation')) {
    drawChamferedRect(ctx, x + 2, y + 2, w - 4, h - 4, minDim * 0.14);
    ctx.fillStyle = '#1E2736';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = Math.max(1.2, zoom * 0.06);
    ctx.stroke();

    // 4 transformer coils
    ctx.fillStyle = '#B45309';
    for (const [ox, oy] of [
      [-0.22, -0.22],
      [0.22, -0.22],
      [-0.22, 0.22],
      [0.22, 0.22],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + w * ox, cy + h * oy, minDim * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cross busbar
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = Math.max(1.2, zoom * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.2);
    ctx.lineTo(x + w * 0.8, y + h * 0.8);
    ctx.moveTo(x + w * 0.8, y + h * 0.2);
    ctx.lineTo(x + w * 0.2, y + h * 0.8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#38BDF8';
    ctx.fill();
    return;
  }

  if (isBigOrSub) {
    // Big electric pole lattice X-frame
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = Math.max(1.5, zoom * 0.07);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y + h * 0.18);
    ctx.lineTo(x + w * 0.82, y + h * 0.82);
    ctx.moveTo(x + w * 0.82, y + h * 0.18);
    ctx.lineTo(x + w * 0.18, y + h * 0.82);
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + w * 0.12, cy - minDim * 0.08, w * 0.76, minDim * 0.16);
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.14, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Medium / small electric pole: footing + crossbar + 3 copper/cyan insulator caps
  ctx.fillStyle = '#242F3E';
  ctx.beginPath();
  ctx.arc(cx, cy, minDim * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = Math.max(1.5, zoom * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.14, cy);
  ctx.lineTo(x + w * 0.86, cy);
  ctx.stroke();

  for (const ix of [x + w * 0.2, cx, x + w * 0.8]) {
    ctx.fillStyle = ix === cx ? '#F59E0B' : '#38BDF8';
    ctx.beginPath();
    ctx.arc(ix, cy, Math.max(1.6, minDim * 0.11), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawGroundObstacleVectorSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  tSec: number,
  animateFlow: boolean
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const minDim = Math.min(w, h);

  if (ent.name.includes('roboport')) {
    drawChamferedRect(ctx, x + 2, y + 2, w - 4, h - 4, minDim * 0.08);
    ctx.fillStyle = '#272018';
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = Math.max(1.6, zoom * 0.07);
    ctx.stroke();

    // Landing pad + hangar doors
    ctx.fillStyle = '#141820';
    ctx.fillRect(x + w * 0.16, y + h * 0.16, w * 0.68, h * 0.68);
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + w * 0.16, y + h * 0.16, w * 0.68, h * 0.68);

    // Dual hangar doors + center split
    ctx.fillStyle = '#78350F';
    ctx.fillRect(x + w * 0.24, y + h * 0.34, w * 0.24, h * 0.32);
    ctx.fillRect(x + w * 0.52, y + h * 0.34, w * 0.24, h * 0.32);

    // 4 glowing robot charging pads
    ctx.fillStyle = '#34D399';
    for (const [px, py] of [
      [0.24, 0.24],
      [0.76, 0.24],
      [0.24, 0.76],
      [0.76, 0.76],
    ]) {
      ctx.beginPath();
      ctx.arc(x + w * px, y + h * py, minDim * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }

    // Static corner radar dish
    ctx.save();
    ctx.translate(x + w * 0.8, y + h * 0.2);
    ctx.rotate(0.4);
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, minDim * 0.08, -1.1, 1.1);
    ctx.stroke();
    ctx.restore();
    void tSec;
    void animateFlow;
    return;
  }

  if (ent.name.includes('gate')) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#CA8A04';
    ctx.fillRect(x + w * 0.18, y + h * 0.24, w * 0.64, h * 0.52);
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    return;
  }

  if (ent.name.includes('wall')) {
    drawChamferedRect(ctx, x + 1, y + 1, w - 2, h - 2, minDim * 0.12);
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Masonry parapet seam
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(x + 2, cy);
    ctx.lineTo(x + w - 2, cy);
    ctx.stroke();
    return;
  }

  if (ent.name.includes('solar-panel')) {
    drawChamferedRect(ctx, x + 2, y + 2, w - 4, h - 4, minDim * 0.06);
    ctx.fillStyle = '#0C2344';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 3x3 photovoltaic silicon cells
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w * i) / 3, y + 3);
      ctx.lineTo(x + (w * i) / 3, y + h - 3);
      ctx.moveTo(x + 3, y + (h * i) / 3);
      ctx.lineTo(x + w - 3, y + (h * i) / 3);
      ctx.stroke();
    }
    return;
  }

  if (ent.name.includes('accumulator')) {
    drawChamferedRect(ctx, x + 2, y + 2, w - 4, h - 4, minDim * 0.14);
    ctx.fillStyle = '#1D2532';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#0B1320';
    ctx.fill();
    ctx.strokeStyle = '#22D3EE';
    ctx.stroke();
    return;
  }

  if (ent.name.includes('chest')) {
    const chestColor = ent.name.includes('passive')
      ? '#EF4444'
      : ent.name.includes('requester')
        ? '#3B82F6'
        : ent.name.includes('storage')
          ? '#EAB308'
          : ent.name.includes('buffer')
            ? '#22C55E'
            : ent.name.includes('active')
              ? '#A855F7'
              : '#94A3B8';
    drawChamferedRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, minDim * 0.14);
    ctx.fillStyle = '#272D38';
    ctx.fill();
    ctx.strokeStyle = chestColor;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = chestColor;
    ctx.fillRect(x + w * 0.26, y + h * 0.26, w * 0.48, h * 0.48);
    return;
  }

  // Generic beveled equipment pad
  drawChamferedRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, minDim * 0.14);
  ctx.fillStyle = '#262B36';
  ctx.fill();
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawRailSignalVectorSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  cx: number,
  cy: number,
  w: number,
  h: number,
  zoom: number
) {
  const isChain = ent.name.includes('chain');
  const r = Math.max(2.8, Math.min(w, h) * 0.36);

  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = Math.max(0.9, zoom * 0.06);
  ctx.stroke();

  ctx.fillStyle = isChain ? '#38BDF8' : '#22C55E';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTrainStopVectorSprite(
  ctx: CanvasRenderingContext2D,
  ent: GridEntity,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
  cx: number,
  cy: number,
  isActiveStop: boolean,
  isSelectingStop: boolean
) {
  const minDim = Math.min(w, h);
  drawChamferedRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, minDim * 0.14);
  ctx.fillStyle = isActiveStop ? '#7F1D1D' : '#451A1A';
  ctx.fill();
  ctx.strokeStyle = isActiveStop ? '#F59E0B' : isSelectingStop ? '#22D3EE' : '#EF4444';
  ctx.lineWidth = Math.max(isActiveStop ? 2.2 : 1.4, zoom * 0.1);
  ctx.stroke();

  // Hazard stop bar + glowing beacon dome
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(x + w * 0.2, y + h * 0.22, w * 0.6, Math.max(2, h * 0.12));

  if (isActiveStop || isSelectingStop) {
    ctx.save();
    ctx.strokeStyle = isActiveStop ? 'rgba(245, 158, 11, 0.7)' : 'rgba(34, 211, 238, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    ctx.restore();
  }

  ctx.fillStyle = isActiveStop ? '#FDE68A' : '#FCA5A5';
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.08, Math.max(2.2, minDim * 0.22), 0, Math.PI * 2);
  ctx.fill();
  void ent;
}
