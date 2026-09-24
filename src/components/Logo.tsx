import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className = "w-12 h-12", showText = false }: LogoProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Butterfly Wings - Left */}
        <path
          d="M100 100C100 100 60 40 30 60C0 80 40 140 100 100Z"
          fill="#38a89d"
          fillOpacity="0.8"
        />
        <path
          d="M100 100C100 100 50 120 40 150C30 180 90 180 100 100Z"
          fill="#38a89d"
          fillOpacity="0.6"
        />
        
        {/* Butterfly Wings - Right */}
        <path
          d="M100 100C100 100 140 40 170 60C200 80 160 140 100 100Z"
          fill="#38a89d"
          fillOpacity="0.8"
        />
        <path
          d="M100 100C100 100 150 120 160 150C170 180 110 180 100 100Z"
          fill="#38a89d"
          fillOpacity="0.6"
        />

        {/* Body */}
        <rect x="97" y="70" width="6" height="70" rx="3" fill="#4a1d33" />
        
        {/* Antennas */}
        <path d="M98 75C90 60 80 65 80 65" stroke="#4a1d33" strokeWidth="2" strokeLinecap="round" />
        <path d="M102 75C110 60 120 65 120 65" stroke="#4a1d33" strokeWidth="2" strokeLinecap="round" />

        {/* Letters CB */}
        <text
          x="100"
          y="115"
          textAnchor="middle"
          fontFamily="Arial, sans-serif"
          fontSize="24"
          fontWeight="bold"
          fill="#fdf8e1"
        >
          CB
        </text>
      </svg>
      {showText && (
        <div className="mt-2 text-center">
          <h1 className="text-xl font-black text-[#4a1d33] tracking-[0.2em] uppercase">
            Consigna Beauty
          </h1>
          <p className="text-[10px] font-bold text-[#38a89d] uppercase tracking-[0.3em] mt-1">
            Solução de Vendas
          </p>
        </div>
      )}
    </div>
  );
}
