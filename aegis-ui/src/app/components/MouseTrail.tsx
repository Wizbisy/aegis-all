'use client';
import { useEffect, useState } from 'react';

export default function MouseTrail() {
  const [position, setPosition] = useState({ x: -1000, y: -1000 });

  useEffect(() => {
    let animationFrameId: number;
    let targetX = -1000;
    let targetY = -1000;
    let currentX = -1000;
    let currentY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      if (targetX === -1000) {
        currentX = e.clientX;
        currentY = e.clientY;
      }
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const animate = () => {
      if (targetX !== -1000) {
        currentX += (targetX - currentX) * 0.15;
        currentY += (targetY - currentY) * 0.15;
        setPosition({ x: currentX, y: currentY });
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div 
      className="pointer-events-none fixed z-0 hidden dark:block mix-blend-screen transition-opacity duration-1000"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        opacity: position.x === -1000 ? 0 : 1, 
      }}
    >
      <div className="w-[800px] h-[800px] rounded-full bg-[#00A360] opacity-[0.08] blur-[120px] dark:bg-[#00F396] dark:opacity-[0.08]"></div>
    </div>
  );
}
