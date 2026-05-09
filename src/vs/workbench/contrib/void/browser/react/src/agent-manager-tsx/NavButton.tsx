/*--------------------------------------------------------------------------------------
 *  Copyright 2025 The A-Coder Corporation PTY LTD. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  badge?: number | string;
}

export const NavButton = memo(({ active, onClick, icon: Icon, title, badge }: NavButtonProps) => {
  return (
    <button
      onClick={onClick}
      className="relative w-full flex items-center justify-center focus:outline-none"
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {/* Double-bezel outer shell */}
      <div className="p-[3px] rounded-xl transition-all duration-300" style={{
        backgroundColor: active ? 'rgba(255,255,255,0.04)' : 'transparent',
        boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)' : 'none',
      }}>
        {/* Inner core */}
        <div
          className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300"
          style={{
            backgroundColor: active ? 'rgba(255,255,255,0.03)' : 'transparent',
            boxShadow: active ? 'inset 0 1px 1px rgba(255,255,255,0.06)' : 'none',
          }}
        >
          <Icon
            className={active ? 'text-void-accent' : 'text-void-fg-4'}
            strokeWidth={active ? 2 : 1.5}
            style={{
              width: '18px',
              height: '18px',
              transition: 'all 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          />
          {/* Breathing active indicator */}
          {active && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-void-accent border border-void-bg-2" style={{ animation: 'breathe 2s ease-in-out infinite' }} />
          )}
          {/* Badge */}
          {badge !== undefined && (
            <div className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-void-accent text-white text-[9px] font-bold flex items-center justify-center border border-void-bg-2">
              {badge}
            </div>
          )}
        </div>
      </div>
    </button>
  );
});

NavButton.displayName = 'NavButton';
