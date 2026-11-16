/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { spritePackStore } from '../../assets/spritePackStore.ts';
import type { ResourceDef } from '../../data/schema.ts';

interface ResourceIconProps {
  resource?: ResourceDef;
  iconPath?: string;
  id: string;
  size?: number;
  className?: string;
}

export const ResourceIcon: React.FC<ResourceIconProps> = ({
  resource,
  iconPath,
  id,
  size = 24,
  className = '',
}) => {
  const [, setSpriteTick] = useState(0);

  useEffect(() => {
    return spritePackStore.subscribe(() => setSpriteTick((t) => t + 1));
  }, []);

  const resolvedPath = iconPath ?? resource?.iconPath;
  const spriteUrl = spritePackStore.resolveUrl(id, resolvedPath);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [spriteUrl]);

  if (spriteUrl && !imgFailed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`shrink-0 rounded bg-[#0F141B] border border-[#2A3444] flex items-center justify-center overflow-hidden ${className}`}
      >
        <img
          src={spriteUrl}
          alt={resource?.name ?? id}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-[86%] h-[86%] object-contain"
        />
      </div>
    );
  }

  const color = resource?.color ?? '#94A3B8';
  const kind = resource?.kind ?? 'item';
  const subgroup = resource?.subgroup ?? '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="4"
        fill="#0F141B"
        stroke={color}
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />
      {kind === 'fluid' ? (
        <g>
          <path
            d="M12 5C12 5 7.2 10.4 7.2 13.9C7.2 16.5 9.3 18.6 12 18.6C14.7 18.6 16.8 16.5 16.8 13.9C16.8 10.4 12 5 12 5Z"
            fill={color}
            fillOpacity="0.9"
          />
          <path
            d="M10.2 14.2C10.2 15.3 11 16.2 12 16.3"
            stroke="#F8FAFC"
            strokeOpacity="0.65"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      ) : subgroup === 'science-pack' || id.includes('tech-card') ? (
        <g>
          {id.includes('tech-card') ? (
            <>
              <rect x="6" y="5.5" width="12" height="13" rx="1.5" fill="#1E293B" stroke={color} strokeWidth="1.3" />
              <rect x="8.2" y="8" width="7.6" height="5" rx="0.8" fill={color} fillOpacity="0.9" />
              <path d="M8.5 15.8H15.5" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path
                d="M9.5 5.5H14.5M10.5 5.5V9.5L7.2 15.8C6.8 16.6 7.4 17.5 8.3 17.5H15.7C16.6 17.5 17.2 16.6 16.8 15.8L13.5 9.5V5.5"
                stroke="#CBD5E1"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8.4 13.5H15.6L16.5 15.6C16.8 16.2 16.3 17 15.6 17H8.4C7.7 17 7.2 16.2 7.5 15.6L8.4 13.5Z"
                fill={color}
              />
            </>
          )}
        </g>
      ) : id.includes('circuit') || id.includes('processing-unit') || id.includes('electronic-components') || id.includes('ai-core') ? (
        <g>
          <rect x="6" y="6" width="12" height="12" rx="1.5" fill={color} fillOpacity="0.9" />
          <rect x="9" y="9" width="6" height="6" rx="0.75" fill="#0F141B" />
          <path d="M9 6V4.5M15 6V4.5M9 19.5V18M15 19.5V18M4.5 9H6M4.5 15H6M18 9H19.5M18 15H19.5" stroke="#CBD5E1" strokeWidth="1.1" />
        </g>
      ) : id.includes('belt') ? (
        <g>
          <rect x="5" y="7" width="14" height="10" rx="1.5" fill="#1E293B" stroke={color} strokeWidth="1.2" />
          <path d="M8.5 10L11.5 12L8.5 14M12.5 10L15.5 12L12.5 14" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : id.includes('inserter') ? (
        <g>
          <rect x="6.5" y="14" width="11" height="4" rx="1" fill={color} />
          <path d="M12 14L15 8L11 6" stroke="#E2E8F0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : id.includes('foundry') || id.includes('electromagnetic') || id.includes('cryogenic') || id.includes('kr-crusher') || id.includes('kr-filtration') || id.includes('kr-electrolysis') || id.includes('kr-atmospheric') || id.includes('assembling') || id.includes('furnace') || id.includes('chemical') ? (
        <g>
          <rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="#1E293B" stroke={color} strokeWidth="1.4" />
          <circle cx="12" cy="12" r="3.2" fill={color} fillOpacity="0.85" />
          <path d="M12 6.5V8.5M12 15.5V17.5M6.5 12H8.5M15.5 12H17.5" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      ) : id.includes('imersite') || id.includes('crystal') || id.includes('quartz') ? (
        <g>
          <polygon points="12,5 17,9.5 15,18 9,18 7,9.5" fill={color} fillOpacity="0.9" stroke="#F8FAFC" strokeOpacity="0.45" strokeWidth="0.9" />
          <path d="M12 5V18M7 9.5L12 11.5L17 9.5" stroke="#0F141B" strokeOpacity="0.45" strokeWidth="1" />
        </g>
      ) : id.includes('plate') || id.includes('brick') || id.includes('plastic') || id.includes('glass') || id.includes('metals') ? (
        <g>
          <path d="M6.5 9L12 6.5L17.5 9V15L12 17.5L6.5 15V9Z" fill={color} fillOpacity="0.88" />
          <path d="M6.5 9L12 11.5L17.5 9M12 11.5V17.5" stroke="#0F141B" strokeOpacity="0.55" strokeWidth="1.1" />
        </g>
      ) : id.includes('gear') || id.includes('engine') ? (
        <g>
          <circle cx="12" cy="12" r="4.2" stroke={color} strokeWidth="2.4" />
          <circle cx="12" cy="12" r="1.6" fill="#0F141B" />
          <path d="M12 5.5V7M12 17V18.5M5.5 12H7M17 12H18.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <circle cx="12" cy="12" r="5" fill={color} fillOpacity="0.88" />
          <text
            x="12"
            y="14.5"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="700"
            fill="#0B0E14"
            fontFamily="JetBrains Mono, monospace"
          >
            {(resource?.name ?? id).replace(/^K2\s+/i, '').slice(0, 2).toUpperCase()}
          </text>
        </g>
      )}
    </svg>
  );
};
