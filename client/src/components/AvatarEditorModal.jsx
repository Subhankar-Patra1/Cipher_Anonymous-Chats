import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { useAuth } from '../context/AuthContext';

const createImage = (url) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous'); 
        image.src = url;
    });

function getRadianAngle(degreeValue) {
    return (degreeValue * Math.PI) / 180;
}

/**
 * Returns the new bounding area of a rotated rectangle.
 */
function rotateSize(width, height, rotation) {
    const rotRad = getRadianAngle(rotation);
    return {
        width:
            Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
        height:
            Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    };
}

/**
 * This function was adapted from the one in the ReadMe of https://github.com/DominicTobias/react-image-crop
 */
async function getCroppedImg(
    imageSrc,
    pixelCrop,
    rotation = 0,
    size = 256, // Output size (width and height, square)
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

    // croppedAreaPixels values are bounding box relative
    // extract the cropped image using these values
    const data = ctx.getImageData(
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height
    );

    // set canvas width to final desired crop size - this will clear existing context
    canvas.width = size;
    canvas.height = size;

    // paste generated rotate image at the top left corner
    ctx.putImageData(data, 0, 0);

    // If we want to resize quality, we might need another pass or just drawImage
    // putImageData doesn't resize.
    // Wait, putImageData places the PIXELS directly. It doesn't scale.
    // If pixelCrop.width != size, we need to scale.
    // The previous logic putImageData puts the raw cropped pixels.
    // If the user zoomed out, pixelCrop width might be large.
    
    // Better approach:
    // 1. Create a temp canvas for the rotated, full image (as above)
    // 2. Create a second temp canvas for the crop (unscaled)
    // 3. Draw result to final canvas (scaled)
    
    // Let's restart the drawing part correctly for scaling:
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bBoxWidth;
    tempCanvas.height = bBoxHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
    tempCtx.rotate(rotRad);
    tempCtx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
    tempCtx.translate(-image.width / 2, -image.height / 2);
    tempCtx.drawImage(image, 0, 0);
    
    // Now draw from tempCanvas to final canvas
    // final canvas is already sized to `size` (e.g. 256)
    // But we need to take `pixelCrop` region from `tempCanvas` and draw it into `canvas`
    
    // IMPORTANT: pixelCrop coordinates are relative to the ROTATED image usually?
    // react-easy-crop documentation says pixelCrop is relative to the image in the DOM?
    
    // Actually, react-easy-crop returns pixelCrop relative to the media loaded.
    // If we rotate, we need to handle it.
    
    // Simplified approach: use the provided `pixelCrop` which is what we see.
    // But since we are rotating using canvas, we need to map it carefully.
    
    // Let's use the code structure that handles it correctly.
    // The code above (from libraries) usually does it right.
    // But `putImageData` definitely does NOT resize.
    
    // Let's render the crop to a canvas of size `pixelCrop.width` first
    const cutCanvas = document.createElement('canvas');
    cutCanvas.width = pixelCrop.width;
    cutCanvas.height = pixelCrop.height;
    const cutCtx = cutCanvas.getContext('2d');
    
    cutCtx.putImageData(data, 0, 0); // This places the cropped data 1:1
    
    // Now scale it down to target size
    // Clear the main canvas and resize it
    canvas.width = size;
    canvas.height = size;
    
    // Use high quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(cutCanvas, 0, 0, pixelCrop.width, pixelCrop.height, 0, 0, size, size);
    
    return new Promise((resolve, reject) => {
        canvas.toBlob((file) => {
            resolve(file);
        }, 'image/webp', 0.85); // WebP 85%
    });
}

export default function AvatarEditorModal({ isOpen, onClose, ...props }) {
    const { token, updateUser } = useAuth();
    const [imageSrc, setImageSrc] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const onFileChange = async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            // Validate size ( < 8MB)
            if (file.size > 8 * 1024 * 1024) {
                 setError("File is too large (max 8MB)");
                 return;
            }
            if (!file.type.startsWith('image/')) {
                setError("Please select an image file");
                return;
            }
            
            setError(null);
            let imageDataUrl = await readFile(file);
            setImageSrc(imageDataUrl);
        }
    };

    const readFile = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result), false);
            reader.readAsDataURL(file);
        });
    };

    const handleSave = async () => {
        if (!imageSrc || !croppedAreaPixels) return;

        setLoading(true);
        setError(null);

        try {
            // Generate two blobs
            const avatarBlob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation, 256);
            const thumbBlob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation, 64);

            const presignUrl = props.uploadUrl || `${import.meta.env.VITE_API_URL}/api/users/me/avatar/presign`;
            const completeUrl = props.completeUrl || `${import.meta.env.VITE_API_URL}/api/users/me/avatar/complete`;

            // Get presigned URLs
            const res = await fetch(presignUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    files: [
                        { type: 'avatar', contentType: 'image/webp', filename: 'avatar.webp' },
                        { type: 'thumb', contentType: 'image/webp', filename: 'thumb.webp' }
                    ]
                })
            });

            if (!res.ok) throw new Error('Failed to get upload URL');
            const { uploads } = await res.json();

            // Upload to S3
            await Promise.all(uploads.map(async (u) => {
                const blob = u.type === 'avatar' ? avatarBlob : thumbBlob;
                await fetch(u.url, {
                    method: 'PUT',
                    headers: u.headers,
                    body: blob
                });
            }));

            // Complete
            const completeRes = await fetch(completeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    uploads: uploads.map(u => ({ type: u.type, key: u.key }))
                })
            });

            if (!completeRes.ok) throw new Error('Failed to save avatar');
            const data = await completeRes.json();

            if (props.onSuccess) {
                props.onSuccess(data);
            } else {
                updateUser({ avatar_url: data.avatar_url, avatar_thumb_url: data.avatar_thumb_url });
            }
            onClose();

        } catch (err) {
            console.error(err);
            setError(err.message || 'Error uploading avatar');
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async () => {
        if (!confirm("Are you sure you want to remove this photo?")) return;
        setLoading(true);
        try {
             const deleteUrl = props.deleteUrl || `${import.meta.env.VITE_API_URL}/api/users/me/avatar`;
             const res = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                if (props.onSuccess) {
                    props.onSuccess({ avatar_url: null, avatar_thumb_url: null });
                } else {
                    updateUser({ avatar_url: null, avatar_thumb_url: null });
                }
                setImageSrc(null);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-colors duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh] transition-colors">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center transition-colors">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Edit Profile Photo</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {!imageSrc ? (
                        <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <span className="material-symbols-outlined text-4xl mb-2">cloud_upload</span>
                            <span>Click to upload or drag & drop</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={onFileChange}
                                className="absolute opacity-0 inset-0 cursor-pointer"
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 h-full">
                            <div className="relative w-full h-64 bg-black rounded-lg overflow-hidden">
                                <Cropper
                                    image={imageSrc}
                                    crop={crop}
                                    zoom={zoom}
                                    rotation={rotation}
                                    aspect={1}
                                    onCropChange={setCrop}
                                    onCropComplete={onCropComplete}
                                    onZoomChange={setZoom}
                                    onRotationChange={setRotation}
                                />
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Zoom</label>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(e.target.value)}
                                    className="w-full accent-violet-500"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Rotation</label>
                                <input
                                    type="range"
                                    value={rotation}
                                    min={0}
                                    max={360}
                                    step={1}
                                    aria-labelledby="Rotation"
                                    onChange={(e) => setRotation(e.target.value)}
                                    className="w-full accent-violet-500"
                                />
                            </div>
                            
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={() => setImageSrc(null)}
                                    className="text-sm text-red-500 hover:underline mr-auto"
                                >
                                    Choose different image
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {error && <div className="text-red-500 text-sm text-center">{error}</div>}
                    
                </div>
                
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between gap-3 bg-gray-50 dark:bg-slate-900 transition-colors">
                     <button
                        onClick={handleRemove}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        disabled={loading}
                    >
                        Remove Photo
                    </button>
                    
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!imageSrc || loading}
                            className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
