import React, { useRef, useState } from 'react';

const BigTextName = () => {
  const svgRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: -200, y: -200 });

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    
    // Convert screen coordinates to SVG coordinates
    const scaleX = 600 / rect.width;  // viewBox width / actual width
    const scaleY = 120 / rect.height; // viewBox height / actual height
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: -200, y: -200 });
  };

  return (
    <section className="relative w-full overflow-hidden bg-transparent mb-10 select-none pointer-events-none">
      <div className="container mx-auto px-4 flex justify-center items-center">
        <div className="big-text-container pointer-events-auto cursor-default">
          <svg 
            ref={svgRef}
            className="big-text-svg"
            viewBox="0 0 600 120"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <mask id="spotlight-mask">
                <rect width="100%" height="100%" fill="black" />
                <circle 
                  cx={mousePos.x}
                  cy={mousePos.y}
                  r="80"
                  fill="white"
                />
              </mask>
            </defs>
            
            {/* Outline layer - always visible */}
            <text
              x="50%"
              y="50%"
              dominantBaseline="middle"
              textAnchor="middle"
              className="big-text-outline-svg"
            >
              CIPHER
            </text>
            
            {/* Fill layer - masked spotlight */}
            <text
              x="50%"
              y="50%"
              dominantBaseline="middle"
              textAnchor="middle"
              className="big-text-fill-svg"
              mask="url(#spotlight-mask)"
            >
              CIPHER
            </text>
          </svg>
        </div>
      </div>
    </section>
  );
};

export default BigTextName;
