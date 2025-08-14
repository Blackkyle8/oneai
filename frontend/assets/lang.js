/**
 * One AI Language System
 * 모든 모듈에서 공통으로 사용하는 다국어 지원 시스템
 */

window.OneAILang = (function() {
    'use strict';

    // 설정
    const CONFIG = {
        STORAGE_KEY: 'oneai_language',
        DEFAULT_LANG: 'ko',
        FALLBACK_LANG: 'en'
    };

    // 상태 관리
    let currentLanguage = localStorage.getItem(CONFIG.STORAGE_KEY) || CONFIG.DEFAULT_LANG;
    let listeners = [];

    // 언어별 정보
    const LANGUAGE_INFO = {
        ko: { flag: '🇰🇷', name: 'Korean', native: '한국어' },
        en: { flag: '🇺🇸', name: 'English', native: 'English' },
        ja: { flag: '🇯🇵', name: 'Japanese', native: '日本語' },
        zh: { flag: '🇨🇳', name: 'Chinese', native: '中文' },
        es: { flag: '🇪🇸', name: 'Spanish', native: 'Español' },
        fr: { flag: '🇫🇷', name: 'French', native: 'Français' },
        de: { flag: '🇩🇪', name: 'German', native: 'Deutsch' },
        pt: { flag: '🇵🇹', name: 'Portuguese', native: 'Português' },
        ru: { flag: '🇷🇺', name: 'Russian', native: 'Русский' },
        it: { flag: '🇮🇹', name: 'Italian', native: 'Italiano' }
    };

    // 번역 데이터
    const TRANSLATIONS = {
        ko: {
            // Navigation
            'nav.home': '홈',
            'nav.community': 'AI 커뮤니티',
            'nav.sharing': 'AI 쉐어링',
            'nav.business': '비즈니스센터',
            'nav.healthcare': '헬스케어',
            'nav.profile': '마이페이지',
            'nav.login': '로그인',
            'nav.logout': '로그아웃',
            'nav.aiContent': '🎨 AI 콘텐츠',
            'nav.qna': '❓ Q&A',
            'nav.tutorials': '📚 튜토리얼',

            // Common Actions
            'action.save': '저장',
            'action.cancel': '취소',
            'action.delete': '삭제',
            'action.edit': '편집',
            'action.create': '생성',
            'action.upload': '업로드',
            'action.download': '다운로드',
            'action.share': '공유',
            'action.copy': '복사',
            'action.paste': '붙여넣기',
            'action.search': '검색',
            'action.filter': '필터',
            'action.sort': '정렬',
            'action.refresh': '새로고침',
            'action.settings': '설정',
            'action.help': '도움말',
            'action.close': '닫기',
            'action.confirm': '확인',
            'action.apply': '적용',
            'action.reset': '초기화',
            'action.back': '← 뒤로',
            'action.write': '✍️ 글쓰기',
            'action.login': '로그인',

            // Menu
            'menu.profile': '프로필',
            'menu.logout': '로그아웃',

            // Tutorial specific
            'action.writeTutorial': '📝 튜토리얼 작성',

            // Messages
            'message.success': '성공적으로 처리되었습니다.',
            'message.error': '오류가 발생했습니다.',
            'message.warning': '주의가 필요합니다.',
            'message.info': '정보입니다.',
            'message.confirm': '정말로 진행하시겠습니까?',
            'message.loading': '로딩 중...',
            'message.saving': '저장 중...',
            'message.uploading': '업로드 중...',
            'message.processing': '처리 중...',
            'message.notFound': '찾을 수 없습니다.',
            'message.networkError': '네트워크 오류가 발생했습니다.',

            // Language
            'language.title': '언어 설정',
            'language.description': '사용할 언어를 선택하세요',
            'language.changed': '언어가 {language}로 변경되었습니다',
            'language.current': '현재 언어',

            // Auth
            'auth.login': '로그인',
            'auth.logout': '로그아웃',
            'auth.register': '회원가입',
            'auth.email': '이메일',
            'auth.password': '비밀번호',
            'auth.confirmPassword': '비밀번호 확인',
            'auth.forgotPassword': '비밀번호 찾기',
            'auth.rememberMe': '로그인 상태 유지',

            // Content
            'content.title': '제목',
            'content.description': '설명',
            'content.category': '카테고리',
            'content.tags': '태그',
            'content.author': '작성자',
            'content.date': '날짜',
            'content.views': '조회수',
            'content.likes': '좋아요',
            'content.comments': '댓글',
            'content.shares': '공유',

            // File Upload
            'upload.title': '파일 업로드',
            'upload.dragDrop': '파일을 드래그하여 놓거나 클릭하여 업로드',
            'upload.selectFiles': '파일 선택',
            'upload.maxSize': '최대 크기: {size}',
            'upload.allowedTypes': '허용된 형식: {types}',
            'upload.progress': '업로드 진행률: {percent}%',
            'upload.complete': '업로드 완료',
            'upload.failed': '업로드 실패',

            // Errors
            'error.required': '필수 항목입니다',
            'error.invalid': '올바르지 않은 형식입니다',
            'error.tooShort': '너무 짧습니다 (최소 {min}자)',
            'error.tooLong': '너무 깁니다 (최대 {max}자)',
            'error.notMatched': '일치하지 않습니다',
            'error.emailInvalid': '올바른 이메일 주소를 입력하세요',
            'error.passwordWeak': '비밀번호가 너무 약합니다',

            // Time
            'time.now': '방금 전',
            'time.minutesAgo': '{minutes}분 전',
            'time.hoursAgo': '{hours}시간 전',
            'time.daysAgo': '{days}일 전',
            'time.weeksAgo': '{weeks}주 전',
            'time.monthsAgo': '{months}개월 전',
            'time.yearsAgo': '{years}년 전'
        },

        en: {
            // Navigation
            'nav.home': 'Home',
            'nav.community': 'AI Community',
            'nav.sharing': 'AI Sharing',
            'nav.business': 'Business Center',
            'nav.healthcare': 'Healthcare',
            'nav.profile': 'My Page',
            'nav.login': 'Login',
            'nav.logout': 'Logout',
            'nav.aiContent': '🎨 AI Content',
            'nav.qna': '❓ Q&A',
            'nav.tutorials': '📚 Tutorials',

            // Common Actions
            'action.save': 'Save',
            'action.cancel': 'Cancel',
            'action.delete': 'Delete',
            'action.edit': 'Edit',
            'action.create': 'Create',
            'action.upload': 'Upload',
            'action.download': 'Download',
            'action.share': 'Share',
            'action.copy': 'Copy',
            'action.paste': 'Paste',
            'action.search': 'Search',
            'action.filter': 'Filter',
            'action.sort': 'Sort',
            'action.refresh': 'Refresh',
            'action.settings': 'Settings',
            'action.help': 'Help',
            'action.close': 'Close',
            'action.confirm': 'Confirm',
            'action.apply': 'Apply',
            'action.reset': 'Reset',
            'action.back': '← Back',
            'action.write': '✍️ Write',
            'action.login': 'Login',

            // Menu
            'menu.profile': 'Profile',
            'menu.logout': 'Logout',

            // Tutorial specific
            'action.writeTutorial': '📝 Write Tutorial',

            // Messages
            'message.success': 'Successfully processed.',
            'message.error': 'An error occurred.',
            'message.warning': 'Warning required.',
            'message.info': 'Information.',
            'message.confirm': 'Are you sure you want to proceed?',
            'message.loading': 'Loading...',
            'message.saving': 'Saving...',
            'message.uploading': 'Uploading...',
            'message.processing': 'Processing...',
            'message.notFound': 'Not found.',
            'message.networkError': 'Network error occurred.',

            // Language
            'language.title': 'Language Settings',
            'language.description': 'Select your preferred language',
            'language.changed': 'Language changed to {language}',
            'language.current': 'Current Language',

            // Auth
            'auth.login': 'Login',
            'auth.logout': 'Logout',
            'auth.register': 'Register',
            'auth.email': 'Email',
            'auth.password': 'Password',
            'auth.confirmPassword': 'Confirm Password',
            'auth.forgotPassword': 'Forgot Password',
            'auth.rememberMe': 'Remember Me',

            // Content
            'content.title': 'Title',
            'content.description': 'Description',
            'content.category': 'Category',
            'content.tags': 'Tags',
            'content.author': 'Author',
            'content.date': 'Date',
            'content.views': 'Views',
            'content.likes': 'Likes',
            'content.comments': 'Comments',
            'content.shares': 'Shares',

            // File Upload
            'upload.title': 'File Upload',
            'upload.dragDrop': 'Drag and drop files or click to upload',
            'upload.selectFiles': 'Select Files',
            'upload.maxSize': 'Max size: {size}',
            'upload.allowedTypes': 'Allowed types: {types}',
            'upload.progress': 'Upload progress: {percent}%',
            'upload.complete': 'Upload complete',
            'upload.failed': 'Upload failed',

            // Errors
            'error.required': 'Required field',
            'error.invalid': 'Invalid format',
            'error.tooShort': 'Too short (minimum {min} characters)',
            'error.tooLong': 'Too long (maximum {max} characters)',
            'error.notMatched': 'Does not match',
            'error.emailInvalid': 'Please enter a valid email address',
            'error.passwordWeak': 'Password is too weak',

            // Time
            'time.now': 'Just now',
            'time.minutesAgo': '{minutes} minutes ago',
            'time.hoursAgo': '{hours} hours ago',
            'time.daysAgo': '{days} days ago',
            'time.weeksAgo': '{weeks} weeks ago',
            'time.monthsAgo': '{months} months ago',
            'time.yearsAgo': '{years} years ago'
        }
    };

    // 번역 함수
    function translate(key, params = {}) {
        let translation = TRANSLATIONS[currentLanguage]?.[key] || 
                         TRANSLATIONS[CONFIG.FALLBACK_LANG]?.[key] || 
                         key;
        
        // 매개변수 치환
        Object.keys(params).forEach(param => {
            const placeholder = `{${param}}`;
            translation = translation.replace(new RegExp(placeholder, 'g'), params[param]);
        });
        
        return translation;
    }

    // 언어 변경
    function setLanguage(lang) {
        if (!LANGUAGE_INFO[lang]) {
            console.warn(`Language '${lang}' is not supported`);
            return false;
        }

        const previousLanguage = currentLanguage;
        currentLanguage = lang;
        
        // 로컬 스토리지에 저장
        localStorage.setItem(CONFIG.STORAGE_KEY, lang);
        
        // HTML lang 속성 업데이트
        document.documentElement.lang = lang;
        
        // 다른 탭/페이지에 언어 변경 알림 (localStorage event 사용)
        localStorage.setItem('oneai_language_change_event', JSON.stringify({
            language: lang,
            timestamp: Date.now()
        }));
        
        // 이벤트 발생
        listeners.forEach(callback => {
            try {
                callback(lang, previousLanguage);
            } catch (error) {
                console.error('Language change listener error:', error);
            }
        });
        
        // DOM 업데이트
        updateDOM();
        
        return true;
    }

    // DOM 요소 업데이트
    function updateDOM() {
        // data-i18n 속성이 있는 요소들 업데이트
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = element.getAttribute('data-i18n-params');
            
            let parsedParams = {};
            if (params) {
                try {
                    parsedParams = JSON.parse(params);
                } catch (e) {
                    console.warn('Invalid i18n params:', params);
                }
            }
            
            element.textContent = translate(key, parsedParams);
        });

        // placeholder 텍스트 업데이트
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = translate(key);
        });

        // title 속성 업데이트
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = translate(key);
        });
    }

    // 언어 변경 리스너 등록
    function onLanguageChange(callback) {
        if (typeof callback === 'function') {
            listeners.push(callback);
        }
    }

    // 언어 변경 리스너 제거
    function offLanguageChange(callback) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    // 언어 선택 모달 생성
    function createLanguageModal() {
        const modal = document.createElement('div');
        modal.className = 'oneai-language-modal-overlay';
        modal.innerHTML = `
            <div class="oneai-language-modal">
                <div class="oneai-language-modal-header">
                    <h2 data-i18n="language.title">${translate('language.title')}</h2>
                    <p data-i18n="language.description">${translate('language.description')}</p>
                    <button class="oneai-language-modal-close" onclick="OneAILang.closeLanguageModal()">&times;</button>
                </div>
                <div class="oneai-language-grid">
                    ${Object.keys(LANGUAGE_INFO).map(lang => `
                        <button class="oneai-language-option ${lang === currentLanguage ? 'active' : ''}" 
                                onclick="OneAILang.selectLanguage('${lang}')">
                            <div class="oneai-language-flag">${LANGUAGE_INFO[lang].flag}</div>
                            <div class="oneai-language-info">
                                <div class="oneai-language-name">${LANGUAGE_INFO[lang].name}</div>
                                <div class="oneai-language-native">${LANGUAGE_INFO[lang].native}</div>
                            </div>
                            <div class="oneai-language-check">✓</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeLanguageModal();
            }
        });

        return modal;
    }

    // 언어 선택
    function selectLanguage(lang) {
        if (setLanguage(lang)) {
            closeLanguageModal();
            showToast(translate('language.changed', { language: LANGUAGE_INFO[lang].native }), 'success');
        }
    }

    // 언어 모달 열기
    function showLanguageModal() {
        // 기존 모달이 있으면 제거
        closeLanguageModal();
        createLanguageModal();
    }

    // 언어 모달 닫기
    function closeLanguageModal() {
        const modal = document.querySelector('.oneai-language-modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    // 토스트 메시지 표시
    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `oneai-toast oneai-toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // 애니메이션 효과
        setTimeout(() => toast.classList.add('show'), 10);
        
        // 자동 제거
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // 초기화
    function init() {
        // 저장된 언어 설정 불러오기
        const savedLanguage = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (savedLanguage && LANGUAGE_INFO[savedLanguage]) {
            currentLanguage = savedLanguage;
        }
        
        // HTML lang 속성 설정
        document.documentElement.lang = currentLanguage;
        
        // 다른 탭에서 언어 변경 감지
        window.addEventListener('storage', function(e) {
            if (e.key === 'oneai_language_change_event' && e.newValue) {
                try {
                    const eventData = JSON.parse(e.newValue);
                    if (eventData.language && LANGUAGE_INFO[eventData.language]) {
                        const previousLanguage = currentLanguage;
                        currentLanguage = eventData.language;
                        document.documentElement.lang = currentLanguage;
                        
                        // 리스너들에게 알림
                        listeners.forEach(callback => {
                            try {
                                callback(currentLanguage, previousLanguage);
                            } catch (error) {
                                console.error('Language cross-tab listener error:', error);
                            }
                        });
                        
                        // DOM 업데이트
                        updateDOM();
                    }
                } catch (error) {
                    console.error('Language storage event parsing error:', error);
                }
            }
        });
        
        // DOM이 로드된 후 업데이트
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateDOM);
        } else {
            updateDOM();
        }
        
        // 페이지 로드 시 언어 변경 이벤트 발생 (다른 스크립트들이 언어를 인식할 수 있도록)
        setTimeout(() => {
            listeners.forEach(callback => {
                try {
                    callback(currentLanguage, currentLanguage);
                } catch (error) {
                    console.error('Language init listener error:', error);
                }
            });
        }, 100);
    }

    // 공개 API
    return {
        // 메인 함수들
        t: translate,
        translate: translate,
        setLanguage: setLanguage,
        getCurrentLanguage: () => currentLanguage,
        getSupportedLanguages: () => Object.keys(LANGUAGE_INFO),
        getLanguageInfo: (lang) => LANGUAGE_INFO[lang] || null,
        getAllLanguageInfo: () => LANGUAGE_INFO,
        
        // DOM 관련
        updateDOM: updateDOM,
        
        // 이벤트 관련
        onLanguageChange: onLanguageChange,
        offLanguageChange: offLanguageChange,
        
        // UI 관련
        showLanguageModal: showLanguageModal,
        closeLanguageModal: closeLanguageModal,
        selectLanguage: selectLanguage,
        
        // 유틸리티
        init: init,
        showToast: showToast
    };
})();

// 자동 초기화
OneAILang.init();
