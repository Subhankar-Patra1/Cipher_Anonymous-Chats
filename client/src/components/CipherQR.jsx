import { useState, useEffect, useMemo } from 'react';
import QRCodeLib from 'qrcode';

// Telegram-style QR Code rendered as PNG image (enables native right-click save/copy)
const CipherQR = ({ value, size = 280 }) => {
    const [imgSrc, setImgSrc] = useState(null);

    const modules = useMemo(() => {
        if (!value) return null;
        try {
            const qr = QRCodeLib.create(value, { errorCorrectionLevel: 'L' });
            return qr.modules;
        } catch (e) {
            console.error('[QR] Generation error:', e);
            return null;
        }
    }, [value]);

    useEffect(() => {
        if (!modules) return;

        const moduleCount = modules.size;
        const margin = 2;
        const totalModules = moduleCount + margin * 2;
        const cellSize = size / totalModules;
        const scale = 2; // 2x for crisp rendering
        const canvasSize = size * scale;

        const isFinderPattern = (row, col) => (
            (row < 7 && col < 7) ||
            (row < 7 && col >= moduleCount - 7) ||
            (row >= moduleCount - 7 && col < 7)
        );

        const isFinderSeparator = (row, col) => (
            (row === 7 && col < 8) || (col === 7 && row < 8) ||
            (row === 7 && col >= moduleCount - 8) || (col === moduleCount - 8 && row < 8) ||
            (row === moduleCount - 8 && col < 8) || (col === 7 && row >= moduleCount - 8)
        );

        const isDark = (row, col) => {
            if (row < 0 || row >= moduleCount || col < 0 || col >= moduleCount) return false;
            return (modules.data[row * moduleCount + col] & 1) === 1;
        };

        const logoRadius = 4.8;
        const mid = moduleCount / 2;
        const tailOffset = 0.5;
        const isCenter = (row, col) => {
            const dr = row - mid + 0.5 - tailOffset;
            const dc = col - mid + 0.5;
            return Math.sqrt(dr * dr + dc * dc) < logoRadius;
        };

        const isSkipped = (row, col) => (
            isFinderPattern(row, col) || isFinderSeparator(row, col) || isCenter(row, col)
        );

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        const s = cellSize * scale;
        const o = 0.5 * scale;

        // No background fill — transparent

        // Data modules
        ctx.fillStyle = 'white';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (!isDark(row, col) || isSkipped(row, col)) continue;
                const x = (col + margin) * s - o / 2;
                const y = (row + margin) * s - o / 2;
                ctx.fillRect(x, y, s + o, s + o);
            }
        }

        // Finder patterns
        const drawFinder = (offsetRow, offsetCol) => {
            const x = (offsetCol + margin) * s;
            const y = (offsetRow + margin) * s;
            const outerSize = 7 * s;
            const outerR = outerSize * 0.28;
            const midSize = 5 * s;
            const midR = midSize * 0.24;
            const innerSize = 3 * s;
            const innerR = innerSize * 0.22;

            // Outer white ring
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.roundRect(x, y, outerSize, outerSize, outerR);
            ctx.fill();
            // Cut out the gap (transparent)
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.roundRect(x + s, y + s, midSize, midSize, midR);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            // Inner white square
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.roundRect(x + 2 * s, y + 2 * s, innerSize, innerSize, innerR);
            ctx.fill();
        };

        drawFinder(0, 0);
        drawFinder(0, moduleCount - 7);
        drawFinder(moduleCount - 7, 0);

        // Logo
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.onload = () => {
            const cx = canvasSize / 2;
            const cy = canvasSize / 2;
            const logoCircleR = s * logoRadius / scale * scale;
            const logoImgR = logoCircleR * 0.75;

            // Draw logo
            ctx.drawImage(logoImg, cx - logoImgR, cy - logoImgR, logoImgR * 2, logoImgR * 2);

            setImgSrc(canvas.toDataURL('image/png'));
        };
        logoImg.src = '/logo.png';
    }, [modules, size]);

    if (!imgSrc) {
        return <div style={{ width: size, height: size }} />;
    }

    return (
        <img
            src={imgSrc}
            width={size}
            height={size}
            alt="QR Code - Scan to login"
            style={{ display: 'block' }}
        />
    );
};

export default CipherQR;
