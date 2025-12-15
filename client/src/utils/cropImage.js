export const createImage = (url) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous'); 
        image.src = url;
    });

export function getRadianAngle(degreeValue) {
    return (degreeValue * Math.PI) / 180;
}

/**
 * Returns the new bounding area of a rotated rectangle.
 */
export function rotateSize(width, height, rotation) {
    const rotRad = getRadianAngle(rotation);
    return {
        width:
            Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
        height:
            Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    };
}

/**
 * External utility to crop image
 */
export default async function getCroppedImg(
    imageSrc,
    pixelCrop,
    rotation = 0,
    size = null, // Optional fixed output size
    flip = { horizontal: false, vertical: false }
) {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return null;
    }

    const rotRad = getRadianAngle(rotation);

    // calculate bounding box of the rotated image
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
        image.width,
        image.height,
        rotation
    );

    // set canvas size to match the bounding box
    canvas.width = bBoxWidth;
    canvas.height = bBoxHeight;

    // translate canvas context to a central location to allow rotating and flipping around the center
    ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
    ctx.rotate(rotRad);
    ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
    ctx.translate(-image.width / 2, -image.height / 2);

    // draw rotated image
    ctx.drawImage(image, 0, 0);

    // If no crop provided, return the full rotated image
    if (!pixelCrop) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((file) => {
                if (file) resolve(file);
                else reject(new Error('Canvas is empty'));
            }, 'image/png');
        });
    }

    // croppedAreaPixels values are bounding box relative
    // extract the cropped image using these values
    const data = ctx.getImageData(
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height
    );

    // set canvas width to final desired crop size - this will clear existing context
    // If size is provided, we scale to it. If not, we use the crop size.
    const targetWidth = size || pixelCrop.width;
    const targetHeight = size || pixelCrop.height;

    // We can't use putImageData with scaling.
    // So we use an intermediate canvas.
    const cutCanvas = document.createElement('canvas');
    cutCanvas.width = pixelCrop.width;
    cutCanvas.height = pixelCrop.height;
    const cutCtx = cutCanvas.getContext('2d');
    cutCtx.putImageData(data, 0, 0);

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Quality settings
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(cutCanvas, 0, 0, pixelCrop.width, pixelCrop.height, 0, 0, targetWidth, targetHeight);

    return new Promise((resolve, reject) => {
        canvas.toBlob((file) => {
            if (file) resolve(file);
            else reject(new Error('Canvas is empty'));
        }, 'image/jpeg', 0.85); // [FIX] Optimize to JPEG 85% to reduce size drastically (was PNG)
    });
}
