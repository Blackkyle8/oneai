/**
 * OneAI Images Utility
 * 이미지 관련 유틸리티 함수들과 Base64 인코딩된 에셋들
 */

// OneAI 로고 (SVG를 Base64로 인코딩)
export const ONEAI_LOGO = `data:image/svg+xml;base64,${btoa(`
<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#34d399;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- 배경 원 -->
  <circle cx="64" cy="64" r="60" fill="url(#logoGradient)" />
  
  <!-- 숫자 1 -->
  <text x="64" y="85" font-family="Inter, sans-serif" font-size="56" font-weight="700" 
        text-anchor="middle" fill="white">1</text>
  
  <!-- AI 칩 장식 -->
  <rect x="20" y="20" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)" />
  <rect x="100" y="20" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)" />
  <rect x="20" y="100" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)" />
  <rect x="100" y="100" width="8" height="8" rx="2" fill="rgba(255,255,255,0.3)" />
</svg>
`)}`;

// OneAI 파비콘 (32x32)
export const ONEAI_FAVICON = `data:image/svg+xml;base64,${btoa(`
<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="faviconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#34d399;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="16" cy="16" r="14" fill="url(#faviconGradient)" />
  <text x="16" y="22" font-family="Inter, sans-serif" font-size="18" font-weight="700" 
        text-anchor="middle" fill="white">1</text>
</svg>
`)}`;

// AI 서비스 로고들 (Base64 인코딩)
export const AI_SERVICE_LOGOS = {
    gpt: `data:image/svg+xml;base64,${btoa(`
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="gptGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#10a37f;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#1a7f72;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill="url(#gptGradient)" />
            <text x="32" y="40" font-family="Inter, sans-serif" font-size="20" font-weight="700" 
                  text-anchor="middle" fill="white">G</text>
        </svg>
    `)}`,
    
    claude: `data:image/svg+xml;base64,${btoa(`
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="claudeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ff6b35;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#f7931e;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill="url(#claudeGradient)" />
            <text x="32" y="40" font-family="Inter, sans-serif" font-size="20" font-weight="700" 
                  text-anchor="middle" fill="white">C</text>
        </svg>
    `)}`,
    
    gemini: `data:image/svg+xml;base64,${btoa(`
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="geminiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#4285f4;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#ea4335;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill="url(#geminiGradient)" />
            <text x="32" y="40" font-family="Inter, sans-serif" font-size="20" font-weight="700" 
                  text-anchor="middle" fill="white">✦</text>
        </svg>
    `)}`,
    
    midjourney: `data:image/svg+xml;base64,${btoa(`
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="midjourneyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#000000;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#333333;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill="url(#midjourneyGradient)" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
            <text x="32" y="40" font-family="Inter, sans-serif" font-size="20" font-weight="700" 
                  text-anchor="middle" fill="white">M</text>
        </svg>
    `)}`,
    
    perplexity: `data:image/svg+xml;base64,${btoa(`
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="perplexityGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#20c997;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#17a2b8;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill="url(#perplexityGradient)" />
            <text x="32" y="40" font-family="Inter, sans-serif" font-size="20" font-weight="700" 
                  text-anchor="middle" fill="white">⟐</text>
        </svg>
    `)}`
};

// 플레이스홀더 이미지 생성 함수
export function generatePlaceholderImage(width = 400, height = 300, text = 'OneAI', bgColor = '#10b981') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    
    // 그라디언트 배경
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, bgColor);
    gradient.addColorStop(1, '#34d399');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // 텍스트
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.min(width, height) / 8}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);
    
    return canvas.toDataURL();
}

// 이미지 최적화 함수
export function optimizeImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            // 비율 유지하면서 크기 조정
            let { width, height } = img;
            
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // 이미지 그리기
            ctx.drawImage(img, 0, 0, width, height);
            
            // 최적화된 데이터 URL 반환
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        
        img.src = URL.createObjectURL(file);
    });
}

// 이미지 파일 유효성 검사
export function validateImageFile(file, maxSize = 5 * 1024 * 1024) { // 기본 5MB
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (!validTypes.includes(file.type)) {
        throw new Error('지원하지 않는 이미지 형식입니다. JPEG, PNG, GIF, WebP만 업로드 가능합니다.');
    }
    
    if (file.size > maxSize) {
        throw new Error(`파일 크기가 너무 큽니다. 최대 ${maxSize / (1024 * 1024)}MB까지 업로드 가능합니다.`);
    }
    
    return true;
}

// 이미지 로딩 상태 관리
export class ImageLoader {
    constructor() {
        this.loadingImages = new Set();
        this.loadedImages = new Map();
        this.errorImages = new Set();
    }
    
    async loadImage(src, placeholder = null) {
        if (this.loadedImages.has(src)) {
            return this.loadedImages.get(src);
        }
        
        if (this.loadingImages.has(src)) {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.loadedImages.has(src)) {
                        clearInterval(checkInterval);
                        resolve(this.loadedImages.get(src));
                    } else if (this.errorImages.has(src)) {
                        clearInterval(checkInterval);
                        resolve(placeholder);
                    }
                }, 100);
            });
        }
        
        this.loadingImages.add(src);
        
        return new Promise((resolve) => {
            const img = new Image();
            
            img.onload = () => {
                this.loadingImages.delete(src);
                this.loadedImages.set(src, img);
                resolve(img);
            };
            
            img.onerror = () => {
                this.loadingImages.delete(src);
                this.errorImages.add(src);
                resolve(placeholder);
            };
            
            img.src = src;
        });
    }
    
    preloadImages(srcs) {
        return Promise.all(srcs.map(src => this.loadImage(src)));
    }
    
    clearCache() {
        this.loadedImages.clear();
        this.errorImages.clear();
    }
}

// 전역 이미지 로더 인스턴스
export const imageLoader = new ImageLoader();

// 프로필 아바타 생성 함수
export function generateAvatarUrl(name, size = 128, bgColor = null) {
    const initial = name.charAt(0).toUpperCase();
    const colors = [
        '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', 
        '#ef4444', '#06b6d4', '#84cc16', '#f97316'
    ];
    
    const selectedBgColor = bgColor || colors[name.length % colors.length];
    
    return `data:image/svg+xml;base64,${btoa(`
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${selectedBgColor}" />
            <text x="${size/2}" y="${size/2 + size/8}" font-family="Inter, sans-serif" 
                  font-size="${size/3}" font-weight="600" text-anchor="middle" fill="white">${initial}</text>
        </svg>
    `)}`;
}

// 업로드 상태 아이콘
export const UPLOAD_ICONS = {
    uploading: `data:image/svg+xml;base64,${btoa(`
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" stroke="#10b981" stroke-width="4" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
            </circle>
            <path d="M24 16V32M16 24L24 16L32 24" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `)}`,
    
    success: `data:image/svg+xml;base64,${btoa(`
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" fill="#10b981"/>
            <path d="M16 24L22 30L32 18" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `)}`,
    
    error: `data:image/svg+xml;base64,${btoa(`
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" fill="#ef4444"/>
            <path d="M18 18L30 30M30 18L18 30" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `)}`
};

// 이미지 Lazy Loading 유틸리티
export function setupLazyLoading(selector = 'img[data-src]') {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    imageObserver.unobserve(img);
                }
            });
        });

        document.querySelectorAll(selector).forEach(img => {
            imageObserver.observe(img);
        });
    }
}

// 이미지 드래그 앤 드롭 유틸리티
export function setupImageDropZone(element, callback) {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        element.classList.add('drag-over');
    });
    
    element.addEventListener('dragleave', (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');
    });
    
    element.addEventListener('drop', (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files).filter(file => 
            file.type.startsWith('image/')
        );
        
        if (files.length > 0) {
            callback(files);
        }
    });
}

// 기본 export
export default {
    ONEAI_LOGO,
    ONEAI_FAVICON,
    AI_SERVICE_LOGOS,
    UPLOAD_ICONS,
    generatePlaceholderImage,
    optimizeImage,
    validateImageFile,
    generateAvatarUrl,
    imageLoader,
    setupLazyLoading,
    setupImageDropZone
};