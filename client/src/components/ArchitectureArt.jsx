import React from 'react';

export default function ArchitectureArt() {
  return (
    <div className="architecture-art" aria-hidden="true">
      <svg className="architecture-drawing" viewBox="0 0 640 340" fill="none" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="building-glass" x1="320" y1="78" x2="320" y2="253" gradientUnits="userSpaceOnUse">
            <stop stopColor="#AAB7FF" stopOpacity=".2" />
            <stop offset="1" stopColor="#2045FF" stopOpacity=".03" />
          </linearGradient>
          <linearGradient id="ground-fade" x1="320" y1="232" x2="320" y2="340" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F2F0ED" stopOpacity=".15" />
            <stop offset="1" stopColor="#F2F0ED" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="edge-fade" x1="0" y1="170" x2="640" y2="170" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F2F0ED" stopOpacity="0" />
            <stop offset=".16" stopColor="#F2F0ED" stopOpacity=".58" />
            <stop offset=".84" stopColor="#F2F0ED" stopOpacity=".58" />
            <stop offset="1" stopColor="#F2F0ED" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d="M0 241 187 214h266l187 27v99H0V241Z" fill="url(#ground-fade)" />
        <g stroke="url(#edge-fade)" strokeLinecap="round">
          <path d="m0 244 187-30h266l187 30M0 269l188-22h264l188 22M0 299l190-14h260l190 14M46 340l153-93m-87 93 98-90m63 90 21-91m73 91-21-91m162 91-98-90m164 90-153-93" strokeOpacity=".4" strokeWidth="1" />
          <path d="M0 325h640" strokeOpacity=".32" />
        </g>

        <g stroke="#F2F0ED" strokeLinecap="round" strokeLinejoin="round">
          <path d="M0 116 193 143v115L0 280V116Zm640 0-193 27v115l193 22V116Z" fill="#F2F0ED" fillOpacity=".025" strokeOpacity=".38" strokeWidth="1.1" />
          <path d="M0 137 193 160M0 158l193 21M0 181l193 18M640 137l-193 23m193-2-193 21m193 2-193 18" strokeOpacity=".2" strokeWidth="1" />
          <path d="M41 132v129m36-123v116m37-110v103M599 132v129m-36-123v116m-37-110v103" strokeOpacity=".24" strokeWidth="1" />
        </g>

        <g stroke="#F2F0ED" strokeLinecap="round" strokeLinejoin="round">
          <path d="M201 252V112l119-52 119 52v140H201Z" fill="#F2F0ED" fillOpacity=".035" strokeOpacity=".76" strokeWidth="1.35" />
          <path d="M221 252V124l99-43 99 43v128H221Z" strokeOpacity=".42" strokeWidth="1" />
          <path d="M260 252V143c0-39 26-66 60-66s60 27 60 66v109H260Z" fill="url(#building-glass)" strokeOpacity=".84" strokeWidth="1.25" />
          <path d="M260 174h120m-120 34h120m-91-126v170m61-170v170m-68-18h25v18h-25zm51 0h25v18h-25z" strokeOpacity=".63" strokeWidth="1" />
          <path d="M201 112 320 60l119 52" stroke="#2045FF" strokeOpacity=".95" strokeWidth="2.5" />
          <path d="M221 124h198M201 252h238" strokeOpacity=".5" strokeWidth="1.1" />
        </g>

        <g stroke="#F2F0ED" strokeLinecap="round" strokeLinejoin="round">
          <path d="M100 259V62m0 126L65 82m35 90 37-102M100 142 55 107m45 4 39-39M542 259V62m0 126-35-106m35 90 37-102m-37 72 45-35m-45 4-39-39M167 249V100m0 95-27-84m27 70 28-79m-28 58-34-34M473 249V100m0 95-27-84m27 70 28-79m-28 58 34-34" strokeOpacity=".55" strokeWidth="1.45" />
          <path d="m65 82-17-24 30 15m-7 29-31-9 28-9m32-2 27-20-2 28m-25 21-28-13m507-6-17-24 30 15m-7 29-31-9 28-9m32-2 27-20-2 28m-25 21-28-13" strokeOpacity=".34" strokeWidth=".9" />
          <path d="m140 113-13-18 24 12m-4 22-24-8 22-7m334-1 13-18-24 12m4 22 24-8-22-7" strokeOpacity=".28" strokeWidth=".8" />
        </g>

        <g stroke="#2045FF" strokeLinecap="round">
          <path d="M201 252V112l119-52 119 52v140" strokeOpacity=".7" strokeWidth="1.25" />
          <path d="M76 280h488" strokeOpacity=".72" strokeWidth="1.5" />
        </g>
        <g fill="#2045FF"><circle cx="201" cy="252" r="2.5" /><circle cx="439" cy="252" r="2.5" /><circle cx="320" cy="60" r="2.5" /></g>
      </svg>
    </div>
  );
}