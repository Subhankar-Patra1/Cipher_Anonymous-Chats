import { useEffect, useRef, useState } from 'react';
import QRCodeStyling from 'qr-code-styling';


export default function CipherQRCode({ 
    value, 
    size = 240, 
    bgColor = "transparent",
    fgColor = "#ffffff", // Telegram style uses solid white dots on dark background
    logoImage = "/Cipher.svg" 
}) {
    const ref = useRef(null);
    const [qrCode] = useState(() => new QRCodeStyling({
        width: size,
        height: size,
        margin: 0,
        data: value || "https://cipher.chat", // Fallback so it always renders beautifully
        image: logoImage,
        qrOptions: {
            errorCorrectionLevel: 'M' // Increased to 'M' (15% recovery) to allow a much larger logo in the center
        },
        dotsOptions: {
            color: fgColor,
            type: "rounded" // This creates the exact "liquid" continuous blob effect
        },
        backgroundOptions: {
            color: bgColor,
        },
        imageOptions: {
            crossOrigin: "anonymous",
            margin: 4,
            imageSize: 0.5,
            hideBackgroundDots: false // Removes the black square cutout behind the logo
        },
        cornersSquareOptions: {
            color: fgColor,
            type: "extra-rounded" // Squircle corners
        },
        cornersDotOptions: {
            color: fgColor,
            type: "dot" // Round inner dots
        }
    }));

    useEffect(() => {
        if (ref.current) {
            // Append the QR code exactly once
            ref.current.innerHTML = '';
            qrCode.append(ref.current);
        }
    }, [qrCode]);

    useEffect(() => {
        qrCode.update({
            width: size,
            height: size,
            data: value || "https://cipher.chat",
            image: logoImage,
            qrOptions: {
                errorCorrectionLevel: 'M'
            }
        });
    }, [value, size, logoImage, qrCode]);

    return (
        <div ref={ref} className="overflow-hidden" style={{ width: size, height: size }} />
    );
}
