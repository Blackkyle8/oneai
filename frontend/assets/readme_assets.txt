# OneAI Assets 📁

OneAI 프로젝트의 모든 정적 에셋과 리소스를 관리하는 폴더입니다.

## 📂 폴더 구조

```
assets/
├── 📄 manifest.json           # 에셋 관리 매니페스트
├── 🎨 css/
│   ├── 📄 icons.css           # 아이콘 시스템
│   ├── 📄 animations.css      # 애니메이션 라이브러리
│   └── 📄 themes.css          # 테마 시스템
├── 📜 js/
│   ├── 📄 images.js           # 이미지 유틸리티
│   └── 📄 sounds.js           # 사운드 시스템
├── 🖼️ images/
│   ├── 📁 logos/              # 브랜드 로고들
│   ├── 📁 ai-services/        # AI 서비스 아이콘들
│   ├── 📁 placeholders/       # 플레이스홀더 이미지들
│   └── 📁 illustrations/      # 일러스트레이션들
├── 🔤 fonts/
│   ├── 📁 inter/              # Inter 폰트 패밀리
│   └── 📁 jetbrains-mono/     # JetBrains Mono 폰트
├── 📊 data/
│   ├── 📄 ai-services.json    # AI 서비스 메타데이터
│   ├── 📄 countries.json      # 국가 정보
│   ├── 📄 languages.json      # 언어 정보
│   └── 📄 pricing-tiers.json  # 요금제 정보
└── 📄 README.md               # 이 파일
```

## 🎨 CSS 에셋

### icons.css
- **크기**: ~15KB
- **기능**: SVG 기반 아이콘 시스템
- **포함 내용**:
  - 다양한 크기의 아이콘 (xs ~ 3xl)
  - AI 서비스별 특화 아이콘
  - 애니메이션 아이콘 (spin, pulse, bounce)
  - 상태별 색상 시스템
  - 반응형 아이콘

```css
/* 사용 예시 */
.icon { /* 기본 아이콘 스타일 */ }
.icon--lg { /* 큰 아이콘 */ }
.ai-icon--gpt { /* ChatGPT 아이콘 */ }
.icon--spin { /* 회전 애니메이션 */ }
```

### animations.css
- **크기**: ~25KB
- **기능**: 종합 애니메이션 라이브러리
- **포함 내용**:
  - 입장/퇴장 애니메이션 (fade, slide, scale, bounce)
  - 연속 애니메이션 (spin, pulse, float, glow)
  - 호버 이펙트 (lift, grow, rotate, tilt)
  - 로딩 애니메이션 (spinner, dots, skeleton)
  - 특수 효과 (shimmer, gradient, morphing)

```css
/* 사용 예시 */
.anim-fade-in { /* 페이드 인 */ }
.anim-slide-up { /* 위로 슬라이드 */ }
.hover-lift { /* 호버 시 위로 */ }
.loading-spinner { /* 로딩 스피너 */ }
```

### themes.css
- **크기**: ~20KB
- **기능**: 다중 테마 시스템
- **포함 테마**:
  - `default` (다크 테마)
  - `light` (라이트 테마)
  - `neon` (네온 테마)
  - `forest` (포레스트 테마)
  - `ocean` (오션 테마)
  - `sunset` (선셋 테마)
  - `high-contrast` (고대비 모드)

```css
/* 테마 사용 예시 */
[data-theme="neon"] { /* 네온 테마 */ }
.glass-effect { /* 글래스모피즘 */ }
.gradient-bg-dynamic { /* 동적 그라디언트 */ }
```

## 📜 JavaScript 에셋

### images.js
- **크기**: ~12KB
- **기능**: 이미지 관리 시스템
- **주요 기능**:
  - Base64 인코딩된 로고/아이콘
  - 이미지 최적화 및 압축
  - Lazy Loading 지원
  - 드래그 앤 드롭 처리
  - 플레이스홀더 이미지 생성
  - 프로필 아바타 생성

```javascript
// 사용 예시
import { imageLoader, generateAvatarUrl, optimizeImage } from './assets/js/images.js';

// 이미지 로딩
const img = await imageLoader.loadImage('/path/to/image.jpg');

// 아바타 생성
const avatarUrl = generateAvatarUrl('홍길동');

// 이미지 최적화
const optimizedImage = await optimizeImage(file, 1920, 1080, 0.8);
```

### sounds.js
- **크기**: ~8KB
- **기능**: 웹 오디오 기반 사운드 시스템
- **주요 기능**:
  - UI 사운드 이펙트 (클릭, 호버, 성공, 오류)
  - 동적 사운드 생성 (Web Audio API)
  - 볼륨 조절 및 음소거
  - 사운드 설정 UI
  - 접근성 고려 (사용자 선택)

```javascript
// 사용 예시
import { soundManager } from './assets/js/sounds.js';

// 사운드 재생
soundManager.play('click');
soundManager.play('success');

// 볼륨 조절
soundManager.setVolume(0.5);

// 사운드 활성화/비활성화
soundManager.setEnabled(false);
```

## 🖼️ 이미지 에셋

### 로고들 (logos/)
- `oneai-logo.svg` - 메인 로고 (128x128)
- `oneai-favicon.ico` - 파비콘 (32x32)
- `oneai-logo-white.svg` - 화이트 로고

### AI 서비스 아이콘들 (ai-services/)
- `chatgpt-logo.svg` - ChatGPT 로고
- `claude-logo.svg` - Claude 로고
- `gemini-logo.svg` - Gemini 로고
- `midjourney-logo.svg` - Midjourney 로고
- `perplexity-logo.svg` - Perplexity 로고

### 플레이스홀더들 (placeholders/)
- `user-avatar.svg` - 기본 사용자 아바타
- `image-placeholder.svg` - 이미지 플레이스홀더
- `ai-thinking.gif` - AI 응답 대기 애니메이션

### 일러스트레이션들 (illustrations/)
- `welcome-illustration.svg` - 환영 화면
- `empty-state.svg` - 빈 상태
- `error-404.svg` - 404 에러
- `error-500.svg` - 서버 에러

## 🔤 폰트 에셋

### Inter 폰트 패밀리
- **용도**: 기본 UI 폰트
- **지원 굵기**: 300, 400, 500, 600, 700, 800
- **형식**: WOFF2, WOFF, TTF

### JetBrains Mono
- **용도**: 코드 블록, 터미널
- **지원 굵기**: 400, 500, 700
- **형식**: WOFF2, WOFF

## 📊 데이터 에셋

### ai-services.json
AI 서비스들의 메타데이터
```json
{
  "gpt": {
    "name": "ChatGPT",
    "url": "https://chat.openai.com",
    "pricing": "$20/month",
    "features": ["텍스트 생성", "코딩", "분석"]
  }
}
```

### countries.json
국가 코드 및 이름 데이터 (국제화 지원)

### languages.json
지원 언어 목록 (다국어 지원)

### pricing-tiers.json
요금제 정보 (구독 플랜, 가격, 기능)

## 🚀 사용 방법

### HTML에서 CSS 로드
```html
<!-- 기본 테마 및 아이콘 -->
<link rel="stylesheet" href="./assets/css/themes.css">
<link rel="stylesheet" href="./assets/css/icons.css">
<link rel="stylesheet" href="./assets/css/animations.css">
```

### JavaScript 모듈 import
```javascript
// ES6 모듈
import { soundManager } from './assets/js/sounds.js';
import { imageLoader, generateAvatarUrl } from './assets/js/images.js';

// 또는 script 태그로
<script src="./assets/js/sounds.js"></script>
<script src="./assets/js/images.js"></script>
```

### 테마 전환
```javascript
// 테마 변경
document.documentElement.setAttribute('data-theme', 'neon');

// 테마 설정 저장
localStorage.setItem('theme', 'dark');
```

### 애니메이션 적용
```html
<!-- CSS 클래스로 애니메이션 적용 -->
<div class="anim-fade-in anim-delay-200">페이드 인 효과</div>
<button class="hover-lift">호버 시 위로</button>
<div class="loading-spinner"></div>
```

### 아이콘 사용
```html
<!-- 기본 아이콘 -->
<i class="icon icon--lg icon-search"></i>

<!-- AI 서비스 아이콘 -->
<div class="ai-icon ai-icon--gpt">G</div>

<!-- 애니메이션 아이콘 -->
<i class="icon icon-spin"></i>
```

## ⚡ 성능 최적화

### 번들링 전략
```javascript
// 핵심 CSS (Critical)
core.css = themes.css + icons.css + animations.css

// 지연 로딩 (Lazy Loading)
- 폰트: 페이지 로드 후
- 일러스트레이션: 필요 시점
- 사운드: 사용자 상호작용 후
```

### 압축 및 캐싱
- **Gzip**: 모든 텍스트 파일
- **Brotli**: 최신 브라우저 지원
- **Cache-Control**: 1년 캐싱
- **Service Worker**: 오프라인 지원

### 이미지 최적화
```javascript
// WebP 지원 확인 및 fallback
const supportsWebP = await checkWebPSupport();
const imageUrl = supportsWebP ? 'image.webp' : 'image.jpg';

// Lazy Loading
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.src = entry.target.dataset.src;
    }
  });
});
```

## 🎯 접근성 (Accessibility)

### 애니메이션 제어
```css
/* 사용자가 애니메이션 비활성화 선택 시 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 고대비 모드
```javascript
// 고대비 모드 감지 및 적용
if (window.matchMedia('(prefers-contrast: high)').matches) {
  document.documentElement.setAttribute('data-theme', 'high-contrast');
}
```

### 스크린 리더 지원
```html
<!-- 의미있는 alt 텍스트 -->
<img src="logo.svg" alt="OneAI 로고 - AI 통합 플랫폼">

<!-- aria-label 제공 -->
<button aria-label="메뉴 열기" class="icon icon-menu"></button>

<!-- 상태 정보 제공 -->
<div aria-live="polite" id="status">로딩 중...</div>
```

## 🔧 개발 도구

### 에셋 빌드 스크립트
```bash
# CSS 최적화
npm run build:css

# 이미지 압축
npm run optimize:images

# 폰트 서브셋 생성
npm run subset:fonts

# 전체 빌드
npm run build:assets
```

### 개발 서버 설정
```javascript
// Hot reload 설정
const watcher = chokidar.watch('./assets/**/*');
watcher.on('change', (path) => {
  if (path.endsWith('.css')) {
    reloadCSS();
  } else if (path.endsWith('.js')) {
    reloadJS();
  }
});
```

### 테스트 환경
```bash
# 시각적 회귀 테스트
npm run test:visual

# 성능 테스트
npm run test:performance

# 접근성 테스트
npm run test:a11y
```

## 📱 반응형 지원

### 브레이크포인트
```css
/* 모바일 퍼스트 */
@media (min-width: 768px) { /* 태블릿 */ }
@media (min-width: 1024px) { /* 데스크톱 */ }
@media (min-width: 1440px) { /* 대형 화면 */ }
```

### 아이콘 크기 조정
```css
/* 자동 크기 조정 */
.icon {
  width: clamp(16px, 4vw, 24px);
  height: clamp(16px, 4vw, 24px);
}
```

### 터치 친화적 크기
```css
/* 최소 터치 타겟 크기 44px */
.btn, .icon-clickable {
  min-width: 44px;
  min-height: 44px;
}
```

## 🌐 국제화 (i18n)

### 폰트 지원
```css
/* 다국어 폰트 스택 */
font-family: 
  'Inter', 
  'Noto Sans CJK KR',  /* 한국어 */
  'Noto Sans CJK JP',  /* 일본어 */
  'Noto Sans CJK SC',  /* 중국어 간체 */
  sans-serif;
```

### RTL 지원
```css
/* 우측에서 좌측 텍스트 지원 */
[dir="rtl"] .icon-arrow-right::before {
  transform: scaleX(-1);
}
```

## 🚨 주의사항

### 브라우저 호환성
- **IE 11**: 제한적 지원 (기본 기능만)
- **Safari**: webkit 접두사 필요
- **Chrome/Firefox**: 완전 지원

### 파일 크기 제한
- **CSS**: 50KB 이하
- **JavaScript**: 100KB 이하
- **이미지**: 개별 500KB 이하
- **폰트**: 200KB 이하

### 성능 가이드라인
```javascript
// 좋은 예
import { soundManager } from './sounds.js'; // 필요한 것만

// 나쁜 예
import * as everything from './all-assets.js'; // 전체 로드
```

## 🔄 업데이트 가이드

### 버전 관리
```json
{
  "version": "1.0.0",
  "assets": {
    "css/themes.css": "1.0.0",
    "js/sounds.js": "1.0.1"
  }
}
```

### 마이그레이션
```javascript
// v1.0.0 → v1.1.0
// 변경사항: 새로운 테마 추가
if (version < '1.1.0') {
  migrateLegacyThemes();
}
```

### 호환성 확인
```bash
# 이전 버전과 호환성 체크
npm run compatibility:check

# 브레이킹 체인지 감지
npm run breaking:detect
```

## 📞 지원 및 문의

### 문제 신고
- **GitHub Issues**: 버그 리포트
- **Discord**: 실시간 지원
- **이메일**: assets@oneai.com

### 기여 방법
1. Fork 저장소
2. Feature 브랜치 생성
3. 변경사항 커밋
4. Pull Request 제출

### 라이선스
- **코드**: MIT 라이선스
- **폰트**: SIL Open Font License
- **아이콘**: ISC 라이선스

---

**OneAI Assets v1.0.0** | 최종 업데이트: 2024-08-11