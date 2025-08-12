/**
 * One AI - Main JavaScript Module
 * 모든 One AI 기능을 통합하는 메인 스크립트
 * 
 * Features:
 * - 통합 인증 시스템
 * - AI 서비스 관리
 * - 모듈 간 통신
 * - 상태 관리
 * - 이벤트 시스템
 * - API 통신
 * - 로컬 스토리지 관리
 * - 테마 시스템
 * - 다국어 지원
 * - 토스트 알림
 * - 모달 관리
 */

// ===== GLOBAL NAMESPACE =====
window.OneAI = window.OneAI || {};

(function(OneAI) {
    'use strict';

    // ===== CONFIGURATION =====
    const CONFIG = {
        // API Configuration
        API_BASE_URL: process.env.NODE_ENV === 'production' 
            ? 'https://api.oneai.kr' 
            : 'http://localhost:3000',
        API_VERSION: 'v1',
        
        // Storage Keys
        STORAGE_KEYS: {
            USER: 'oneai_user',
            AUTH_TOKEN: 'oneai_token',
            SETTINGS: 'oneai_settings',
            AI_ENGINES: 'oneai_ai_engines',
            THEME: 'oneai_theme',
            LANGUAGE: 'oneai_language',
            SHARING_DATA: 'oneai_sharing',
            BUSINESS_DATA: 'oneai_business'
        },
        
        // Default Settings
        DEFAULTS: {
            theme: 'dark',
            language: 'ko',
            ai_engines: ['gpt', 'gemini', 'claude', 'perplexity'],
            notifications: true,
            auto_save: true
        },
        
        // Animation Durations
        ANIMATION: {
            FAST: 150,
            NORMAL: 250,
            SLOW: 350,
            TOAST: 4000
        }
    };

    // ===== STATE MANAGEMENT =====
    const State = {
        // User State
        user: null,
        isAuthenticated: false,
        
        // App State
        currentModule: 'home',
        currentTheme: 'dark',
        currentLanguage: 'ko',
        
        // AI Services State
        connectedAIServices: [],
        currentAIService: null,
        
        // UI State
        modals: new Set(),
        toasts: [],
        
        // Data State
        sharingData: [],
        businessData: [],
        communityData: []
    };

    // ===== UTILITY FUNCTIONS =====
    const Utils = {
        // DOM Utilities
        $: (selector) => document.querySelector(selector),
        $$: (selector) => document.querySelectorAll(selector),
        
        // Type Checking
        isObject: (obj) => obj !== null && typeof obj === 'object' && !Array.isArray(obj),
        isArray: (arr) => Array.isArray(arr),
        isString: (str) => typeof str === 'string',
        isFunction: (fn) => typeof fn === 'function',
        
        // String Utilities
        slugify: (text) => text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').trim('-'),
        capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
        truncate: (str, length = 100) => str.length > length ? str.substring(0, length) + '...' : str,
        
        // Number Utilities
        formatNumber: (num) => {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        },
        
        formatCurrency: (amount, currency = 'KRW') => {
            const formatter = new Intl.NumberFormat('ko-KR', {
                style: 'currency',
                currency: currency
            });
            return formatter.format(amount);
        },
        
        // Date Utilities
        formatDate: (date, options = {}) => {
            const defaultOptions = {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            return new Intl.DateTimeFormat(State.currentLanguage, { ...defaultOptions, ...options }).format(new Date(date));
        },
        
        getRelativeTime: (date) => {
            const now = new Date();
            const diff = now - new Date(date);
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            
            if (minutes < 1) return '방금 전';
            if (minutes < 60) return `${minutes}분 전`;
            if (hours < 24) return `${hours}시간 전`;
            if (days < 7) return `${days}일 전`;
            return Utils.formatDate(date);
        },
        
        // Validation Utilities
        validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        validatePassword: (password) => password.length >= 8,
        validateURL: (url) => {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        },
        
        // Async Utilities
        delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },
        
        throttle: (func, limit) => {
            let lastFunc;
            let lastRan;
            return function(...args) {
                if (!lastRan) {
                    func.apply(this, args);
                    lastRan = Date.now();
                } else {
                    clearTimeout(lastFunc);
                    lastFunc = setTimeout(() => {
                        if ((Date.now() - lastRan) >= limit) {
                            func.apply(this, args);
                            lastRan = Date.now();
                        }
                    }, limit - (Date.now() - lastRan));
                }
            };
        },
        
        // Security Utilities
        sanitizeHTML: (str) => {
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        },
        
        generateId: () => Math.random().toString(36).substr(2, 9),
        
        // Performance Utilities
        performanceLog: (label, fn) => {
            console.time(label);
            const result = fn();
            console.timeEnd(label);
            return result;
        }
    };

    // ===== STORAGE MANAGEMENT =====
    const Storage = {
        set: (key, value) => {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('Storage set error:', error);
                return false;
            }
        },
        
        get: (key, defaultValue = null) => {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.error('Storage get error:', error);
                return defaultValue;
            }
        },
        
        remove: (key) => {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error('Storage remove error:', error);
                return false;
            }
        },
        
        clear: () => {
            try {
                localStorage.clear();
                return true;
            } catch (error) {
                console.error('Storage clear error:', error);
                return false;
            }
        },
        
        // Specific data handlers
        saveUserData: (userData) => Storage.set(CONFIG.STORAGE_KEYS.USER, userData),
        getUserData: () => Storage.get(CONFIG.STORAGE_KEYS.USER),
        
        saveSettings: (settings) => Storage.set(CONFIG.STORAGE_KEYS.SETTINGS, settings),
        getSettings: () => Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, CONFIG.DEFAULTS),
        
        saveAIEngines: (engines) => Storage.set(CONFIG.STORAGE_KEYS.AI_ENGINES, engines),
        getAIEngines: () => Storage.get(CONFIG.STORAGE_KEYS.AI_ENGINES, CONFIG.DEFAULTS.ai_engines)
    };

    // ===== EVENT SYSTEM =====
    const EventBus = {
        events: {},
        
        on: (event, callback) => {
            if (!EventBus.events[event]) {
                EventBus.events[event] = [];
            }
            EventBus.events[event].push(callback);
        },
        
        off: (event, callback) => {
            if (EventBus.events[event]) {
                EventBus.events[event] = EventBus.events[event].filter(cb => cb !== callback);
            }
        },
        
        emit: (event, data) => {
            if (EventBus.events[event]) {
                EventBus.events[event].forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Event handler error for ${event}:`, error);
                    }
                });
            }
        },
        
        once: (event, callback) => {
            const onceCallback = (data) => {
                callback(data);
                EventBus.off(event, onceCallback);
            };
            EventBus.on(event, onceCallback);
        }
    };

    // ===== AUTHENTICATION SYSTEM =====
    const Auth = {
        login: async (email, password) => {
            try {
                const response = await API.post('/auth/login', { email, password });
                
                if (response.success) {
                    State.user = response.user;
                    State.isAuthenticated = true;
                    
                    Storage.saveUserData(response.user);
                    Storage.set(CONFIG.STORAGE_KEYS.AUTH_TOKEN, response.token);
                    
                    EventBus.emit('auth:login', response.user);
                    Toast.success('로그인 성공!');
                    
                    return { success: true, user: response.user };
                }
                
                return { success: false, error: response.message };
            } catch (error) {
                console.error('Login error:', error);
                return { success: false, error: '로그인 중 오류가 발생했습니다.' };
            }
        },
        
        logout: async () => {
            try {
                await API.post('/auth/logout');
                
                State.user = null;
                State.isAuthenticated = false;
                
                Storage.remove(CONFIG.STORAGE_KEYS.USER);
                Storage.remove(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
                
                EventBus.emit('auth:logout');
                Toast.info('로그아웃되었습니다.');
                
                // Redirect to login
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Logout error:', error);
            }
        },
        
        register: async (userData) => {
            try {
                const response = await API.post('/auth/register', userData);
                
                if (response.success) {
                    Toast.success('회원가입이 완료되었습니다!');
                    return { success: true };
                }
                
                return { success: false, error: response.message };
            } catch (error) {
                console.error('Register error:', error);
                return { success: false, error: '회원가입 중 오류가 발생했습니다.' };
            }
        },
        
        checkAuth: async () => {
            const token = Storage.get(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
            
            if (!token) {
                return false;
            }
            
            try {
                const response = await API.get('/auth/verify');
                
                if (response.success) {
                    State.user = response.user;
                    State.isAuthenticated = true;
                    return true;
                }
                
                // Invalid token
                Auth.logout();
                return false;
            } catch (error) {
                console.error('Auth check error:', error);
                return false;
            }
        },
        
        getCurrentUser: () => State.user,
        isAuthenticated: () => State.isAuthenticated
    };

    // ===== API COMMUNICATION =====
    const API = {
        request: async (endpoint, options = {}) => {
            const url = `${CONFIG.API_BASE_URL}/${CONFIG.API_VERSION}${endpoint}`;
            const token = Storage.get(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
            
            const defaultOptions = {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` })
                }
            };
            
            const config = { ...defaultOptions, ...options };
            
            try {
                const response = await fetch(url, config);
                const data = await response.json();
                
                // Handle unauthorized
                if (response.status === 401) {
                    Auth.logout();
                    throw new Error('Unauthorized');
                }
                
                return data;
            } catch (error) {
                console.error('API request error:', error);
                throw error;
            }
        },
        
        get: (endpoint, params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            const url = queryString ? `${endpoint}?${queryString}` : endpoint;
            return API.request(url, { method: 'GET' });
        },
        
        post: (endpoint, data) => API.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        
        put: (endpoint, data) => API.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        
        delete: (endpoint) => API.request(endpoint, { method: 'DELETE' })
    };

    // ===== TOAST NOTIFICATION SYSTEM =====
    const Toast = {
        container: null,
        
        init: () => {
            if (!Toast.container) {
                Toast.container = document.createElement('div');
                Toast.container.className = 'toast-container';
                Toast.container.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    max-width: 400px;
                `;
                document.body.appendChild(Toast.container);
            }
        },
        
        show: (message, type = 'info', duration = CONFIG.ANIMATION.TOAST) => {
            Toast.init();
            
            const toast = document.createElement('div');
            const toastId = Utils.generateId();
            
            toast.className = `toast toast--${type}`;
            toast.setAttribute('data-toast-id', toastId);
            toast.style.cssText = `
                background: var(--color-surface-elevated);
                border: 1px solid var(--surface-glass-border);
                border-radius: 8px;
                padding: 16px;
                backdrop-filter: blur(16px);
                transform: translateX(100%);
                transition: transform 200ms ease;
                max-width: 100%;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                border-left: 4px solid var(--color-${type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info'});
            `;
            
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };
            
            toast.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 16px;">${icons[type]}</span>
                    <span style="font-size: 14px; font-weight: 500; color: var(--text-primary);">${Utils.sanitizeHTML(message)}</span>
                    <button onclick="OneAI.Toast.remove('${toastId}')" style="
                        background: none;
                        border: none;
                        color: var(--text-tertiary);
                        font-size: 18px;
                        cursor: pointer;
                        margin-left: auto;
                        padding: 0;
                        width: 20px;
                        height: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">&times;</button>
                </div>
            `;
            
            Toast.container.appendChild(toast);
            State.toasts.push({ id: toastId, element: toast });
            
            // Animate in
            requestAnimationFrame(() => {
                toast.style.transform = 'translateX(0)';
            });
            
            // Auto remove
            if (duration > 0) {
                setTimeout(() => Toast.remove(toastId), duration);
            }
            
            EventBus.emit('toast:show', { id: toastId, message, type });
            
            return toastId;
        },
        
        remove: (toastId) => {
            const toastIndex = State.toasts.findIndex(t => t.id === toastId);
            if (toastIndex === -1) return;
            
            const toast = State.toasts[toastIndex];
            toast.element.style.transform = 'translateX(100%)';
            
            setTimeout(() => {
                if (toast.element.parentNode) {
                    toast.element.parentNode.removeChild(toast.element);
                }
                State.toasts.splice(toastIndex, 1);
            }, 200);
            
            EventBus.emit('toast:remove', { id: toastId });
        },
        
        success: (message, duration) => Toast.show(message, 'success', duration),
        error: (message, duration) => Toast.show(message, 'error', duration),
        warning: (message, duration) => Toast.show(message, 'warning', duration),
        info: (message, duration) => Toast.show(message, 'info', duration),
        
        clear: () => {
            State.toasts.forEach(toast => {
                if (toast.element.parentNode) {
                    toast.element.parentNode.removeChild(toast.element);
                }
            });
            State.toasts = [];
        }
    };

    // ===== MODAL MANAGEMENT =====
    const Modal = {
        show: (modalId) => {
            const modal = Utils.$(`#${modalId}`);
            if (!modal) {
                console.error(`Modal with id '${modalId}' not found`);
                return;
            }
            
            modal.classList.add('modal--show');
            State.modals.add(modalId);
            
            // Add escape key listener
            Modal.handleEscape = (e) => {
                if (e.key === 'Escape') {
                    Modal.hide(modalId);
                }
            };
            document.addEventListener('keydown', Modal.handleEscape);
            
            // Add outside click listener
            Modal.handleOutsideClick = (e) => {
                if (e.target === modal) {
                    Modal.hide(modalId);
                }
            };
            modal.addEventListener('click', Modal.handleOutsideClick);
            
            EventBus.emit('modal:show', { id: modalId });
        },
        
        hide: (modalId) => {
            const modal = Utils.$(`#${modalId}`);
            if (!modal) return;
            
            modal.classList.remove('modal--show');
            State.modals.delete(modalId);
            
            // Remove event listeners
            document.removeEventListener('keydown', Modal.handleEscape);
            modal.removeEventListener('click', Modal.handleOutsideClick);
            
            EventBus.emit('modal:hide', { id: modalId });
        },
        
        toggle: (modalId) => {
            State.modals.has(modalId) ? Modal.hide(modalId) : Modal.show(modalId);
        },
        
        hideAll: () => {
            State.modals.forEach(modalId => Modal.hide(modalId));
        },
        
        isOpen: (modalId) => State.modals.has(modalId)
    };

    // ===== THEME SYSTEM =====
    const Theme = {
        set: (theme) => {
            if (theme === 'light') {
                document.body.setAttribute('data-theme', 'light');
            } else {
                document.body.removeAttribute('data-theme');
            }
            
            State.currentTheme = theme;
            Storage.set(CONFIG.STORAGE_KEYS.THEME, theme);
            
            EventBus.emit('theme:change', { theme });
        },
        
        toggle: () => {
            const newTheme = State.currentTheme === 'dark' ? 'light' : 'dark';
            Theme.set(newTheme);
        },
        
        get: () => State.currentTheme,
        
        init: () => {
            const savedTheme = Storage.get(CONFIG.STORAGE_KEYS.THEME, CONFIG.DEFAULTS.theme);
            Theme.set(savedTheme);
        }
    };

    // ===== LANGUAGE SYSTEM =====
    const Language = {
        translations: {
            ko: {
                // Navigation
                'nav.home': '홈',
                'nav.community': 'AI 커뮤니티',
                'nav.sharing': 'AI 쉐어링',
                'nav.business': '비즈니스센터',
                'nav.profile': '마이페이지',
                
                // Common Actions
                'action.save': '저장',
                'action.cancel': '취소',
                'action.delete': '삭제',
                'action.edit': '편집',
                'action.create': '생성',
                'action.upload': '업로드',
                'action.download': '다운로드',
                'action.share': '공유',
                
                // Messages
                'message.success': '성공적으로 처리되었습니다.',
                'message.error': '오류가 발생했습니다.',
                'message.confirm': '정말로 진행하시겠습니까?',
                'message.loading': '로딩 중...',
                
                // Auth
                'auth.login': '로그인',
                'auth.logout': '로그아웃',
                'auth.register': '회원가입',
                'auth.email': '이메일',
                'auth.password': '비밀번호'
            },
            en: {
                // Navigation
                'nav.home': 'Home',
                'nav.community': 'AI Community',
                'nav.sharing': 'AI Sharing',
                'nav.business': 'Business Center',
                'nav.profile': 'My Page',
                
                // Common Actions
                'action.save': 'Save',
                'action.cancel': 'Cancel',
                'action.delete': 'Delete',
                'action.edit': 'Edit',
                'action.create': 'Create',
                'action.upload': 'Upload',
                'action.download': 'Download',
                'action.share': 'Share',
                
                // Messages
                'message.success': 'Successfully processed.',
                'message.error': 'An error occurred.',
                'message.confirm': 'Are you sure you want to proceed?',
                'message.loading': 'Loading...',
                
                // Auth
                'auth.login': 'Login',
                'auth.logout': 'Logout',
                'auth.register': 'Register',
                'auth.email': 'Email',
                'auth.password': 'Password'
            }
        },
        
        t: (key, params = {}) => {
            const translation = Language.translations[State.currentLanguage]?.[key] || key;
            
            // Replace parameters
            return Object.keys(params).reduce((text, param) => {
                return text.replace(`{${param}}`, params[param]);
            }, translation);
        },
        
        set: (lang) => {
            if (Language.translations[lang]) {
                State.currentLanguage = lang;
                Storage.set(CONFIG.STORAGE_KEYS.LANGUAGE, lang);
                EventBus.emit('language:change', { language: lang });
                
                // Update DOM elements with data-i18n attribute
                Utils.$$('[data-i18n]').forEach(element => {
                    const key = element.getAttribute('data-i18n');
                    element.textContent = Language.t(key);
                });
            }
        },
        
        get: () => State.currentLanguage,
        
        init: () => {
            const savedLang = Storage.get(CONFIG.STORAGE_KEYS.LANGUAGE, CONFIG.DEFAULTS.language);
            Language.set(savedLang);
        }
    };

    // ===== AI SERVICES MANAGEMENT =====
    const AIServices = {
        services: {
            'gpt': { 
                name: 'ChatGPT', 
                icon: '🤖', 
                url: 'https://chat.openai.com',
                gradient: 'var(--ai-gpt-gradient)'
            },
            'gemini': { 
                name: 'Gemini', 
                icon: '✦', 
                url: 'https://gemini.google.com',
                gradient: 'var(--ai-gemini-gradient)'
            },
            'claude': { 
                name: 'Claude', 
                icon: '🧠', 
                url: 'https://claude.ai',
                gradient: 'var(--ai-claude-gradient)'
            },
            'perplexity': { 
                name: 'Perplexity', 
                icon: '⟐', 
                url: 'https://www.perplexity.ai',
                gradient: 'var(--ai-perplexity-gradient)'
            },
            'midjourney': { 
                name: 'Midjourney', 
                icon: '🎨', 
                url: 'https://www.midjourney.com',
                gradient: 'var(--ai-midjourney-gradient)'
            }
        },
        
        getConnected: () => State.connectedAIServices,
        
        connect: (serviceId) => {
            if (AIServices.services[serviceId] && !State.connectedAIServices.includes(serviceId)) {
                State.connectedAIServices.push(serviceId);
                Storage.saveAIEngines(State.connectedAIServices);
                EventBus.emit('ai:connect', { serviceId });
                Toast.success(`${AIServices.services[serviceId].name} 연결됨`);
            }
        },
        
        disconnect: (serviceId) => {
            const index = State.connectedAIServices.indexOf(serviceId);
            if (index > -1) {
                State.connectedAIServices.splice(index, 1);
                Storage.saveAIEngines(State.connectedAIServices);
                EventBus.emit('ai:disconnect', { serviceId });
                Toast.info(`${AIServices.services[serviceId].name} 연결 해제됨`);
            }
        },
        
        open: (serviceId) => {
            const service = AIServices.services[serviceId];
            if (service) {
                State.currentAIService = serviceId;
                EventBus.emit('ai:open', { serviceId, service });
                
                // Open in new tab (web environment)
                window.open(service.url, '_blank');
                Toast.info(`${service.name} 새 창에서 열림`);
            }
        },
        
        init: () => {
            State.connectedAIServices = Storage.getAIEngines();
        }
    };

    // ===== MODULE ROUTER =====
    const Router = {
        routes: {
            'home': '/main.html',
            'community': '/community.html',
            'sharing': '/sharing.html',
            'business': '/business.html',
            'profile': '/profile.html'
        },
        
        navigate: (module) => {
            if (Router.routes[module]) {
                State.currentModule = module;
                EventBus.emit('route:change', { module, url: Router.routes[module] });
                
                // Update URL without reload
                if (window.history.pushState) {
                    window.history.pushState({ module }, '', Router.routes[module]);
                }
            }
        },
        
        getCurrentModule: () => State.currentModule,
        
        init: () => {
            // Handle browser back/forward
            window.addEventListener('popstate', (event) => {
                if (event.state && event.state.module) {
                    State.currentModule = event.state.module;
                    EventBus.emit('route:change', { module: event.state.module });
                }
            });
        }
    };

    // ===== FORM UTILITIES =====
    const Form = {
        validate: (formElement) => {
            const errors = [];
            const formData = new FormData(formElement);
            const data = Object.fromEntries(formData);
            
            // Email validation
            if (data.email && !Utils.validateEmail(data.email)) {
                errors.push({ field: 'email', message: '올바른 이메일 주소를 입력해주세요.' });
            }
            
            // Password validation
            if (data.password && !Utils.validatePassword(data.password)) {
                errors.push({ field: 'password', message: '비밀번호는 8자 이상이어야 합니다.' });
            }
            
            // URL validation
            if (data.url && !Utils.validateURL(data.url)) {
                errors.push({ field: 'url', message: '올바른 URL을 입력해주세요.' });
            }
            
            return { isValid: errors.length === 0, errors, data };
        },
        
        serialize: (formElement) => {
            const formData = new FormData(formElement);
            return Object.fromEntries(formData);
        },
        
        reset: (formElement) => {
            formElement.reset();
            // Clear custom validation states
            Utils.$$('.form-error', formElement).forEach(error => error.remove());
            Utils.$$('.form-input--error', formElement).forEach(input => 
                input.classList.remove('form-input--error')
            );
        },
        
        showErrors: (formElement, errors) => {
            // Clear previous errors
            Utils.$$('.form-error', formElement).forEach(error => error.remove());
            Utils.$$('.form-input--error', formElement).forEach(input => 
                input.classList.remove('form-input--error')
            );
            
            // Show new errors
            errors.forEach(error => {
                const field = formElement.querySelector(`[name="${error.field}"]`);
                if (field) {
                    field.classList.add('form-input--error');
                    
                    const errorElement = document.createElement('div');
                    errorElement.className = 'form-error';
                    errorElement.textContent = error.message;
                    
                    field.parentNode.appendChild(errorElement);
                }
            });
        }
    };

    // ===== ANIMATION UTILITIES =====
    const Animation = {
        fadeIn: (element, duration = CONFIG.ANIMATION.NORMAL) => {
            element.style.opacity = '0';
            element.style.transition = `opacity ${duration}ms ease`;
            
            requestAnimationFrame(() => {
                element.style.opacity = '1';
            });
            
            return new Promise(resolve => setTimeout(resolve, duration));
        },
        
        fadeOut: (element, duration = CONFIG.ANIMATION.NORMAL) => {
            element.style.transition = `opacity ${duration}ms ease`;
            element.style.opacity = '0';
            
            return new Promise(resolve => setTimeout(resolve, duration));
        },
        
        slideDown: (element, duration = CONFIG.ANIMATION.NORMAL) => {
            const height = element.scrollHeight;
            element.style.height = '0';
            element.style.overflow = 'hidden';
            element.style.transition = `height ${duration}ms ease`;
            
            requestAnimationFrame(() => {
                element.style.height = height + 'px';
            });
            
            return new Promise(resolve => {
                setTimeout(() => {
                    element.style.height = '';
                    element.style.overflow = '';
                    resolve();
                }, duration);
            });
        },
        
        slideUp: (element, duration = CONFIG.ANIMATION.NORMAL) => {
            const height = element.scrollHeight;
            element.style.height = height + 'px';
            element.style.overflow = 'hidden';
            element.style.transition = `height ${duration}ms ease`;
            
            requestAnimationFrame(() => {
                element.style.height = '0';
            });
            
            return new Promise(resolve => setTimeout(resolve, duration));
        }
    };

    // ===== INITIALIZATION =====
    const init = async () => {
        console.log('🚀 One AI 시스템 초기화 시작...');
        
        try {
            // Initialize core systems
            Theme.init();
            Language.init();
            AIServices.init();
            Router.init();
            
            // Check authentication
            const isAuth = await Auth.checkAuth();
            
            // Initialize UI components
            initializeEventListeners();
            
            // Emit ready event
            EventBus.emit('app:ready', { 
                authenticated: isAuth,
                user: State.user,
                theme: State.currentTheme,
                language: State.currentLanguage
            });
            
            console.log('✅ One AI 시스템 초기화 완료');
            
            // Show welcome message
            setTimeout(() => {
                Toast.success('One AI에 오신 것을 환영합니다! 🎉');
            }, 1000);
            
        } catch (error) {
            console.error('❌ One AI 초기화 실패:', error);
            Toast.error('시스템 초기화 중 오류가 발생했습니다.');
        }
    };

    // ===== EVENT LISTENERS =====
    const initializeEventListeners = () => {
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // ESC to close modals
            if (e.key === 'Escape') {
                Modal.hideAll();
            }
            
            // Ctrl/Cmd + K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                EventBus.emit('shortcut:search');
            }
            
            // Ctrl/Cmd + Shift + T for theme toggle
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                Theme.toggle();
            }
        });
        
        // Handle form submissions
        document.addEventListener('submit', (e) => {
            if (e.target.classList.contains('ajax-form')) {
                e.preventDefault();
                handleFormSubmission(e.target);
            }
        });
        
        // Handle clicks on elements with data-action attributes
        document.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action) {
                handleDataAction(action, e.target, e);
            }
        });
        
        // Network status
        window.addEventListener('online', () => {
            Toast.success('인터넷 연결이 복구되었습니다.');
            EventBus.emit('network:online');
        });
        
        window.addEventListener('offline', () => {
            Toast.warning('인터넷 연결이 끊어졌습니다.');
            EventBus.emit('network:offline');
        });
    };

    // Handle form submissions
    const handleFormSubmission = async (form) => {
        const validation = Form.validate(form);
        
        if (!validation.isValid) {
            Form.showErrors(form, validation.errors);
            return;
        }
        
        const action = form.getAttribute('data-endpoint');
        const method = form.getAttribute('data-method') || 'POST';
        
        try {
            const submitButton = form.querySelector('[type="submit"]');
            const originalText = submitButton.textContent;
            
            submitButton.disabled = true;
            submitButton.textContent = Language.t('message.loading');
            
            const response = await API.request(action, {
                method: method.toUpperCase(),
                body: JSON.stringify(validation.data)
            });
            
            if (response.success) {
                Toast.success(response.message || Language.t('message.success'));
                Form.reset(form);
                EventBus.emit('form:success', { form, response });
            } else {
                Toast.error(response.message || Language.t('message.error'));
            }
            
            submitButton.disabled = false;
            submitButton.textContent = originalText;
            
        } catch (error) {
            console.error('Form submission error:', error);
            Toast.error(Language.t('message.error'));
        }
    };

    // Handle data-action clicks
    const handleDataAction = (action, element, event) => {
        const actions = {
            'modal-show': () => {
                const modalId = element.getAttribute('data-modal');
                if (modalId) Modal.show(modalId);
            },
            'modal-hide': () => {
                const modalId = element.getAttribute('data-modal');
                if (modalId) Modal.hide(modalId);
            },
            'theme-toggle': () => Theme.toggle(),
            'ai-connect': () => {
                const serviceId = element.getAttribute('data-service');
                if (serviceId) AIServices.connect(serviceId);
            },
            'ai-open': () => {
                const serviceId = element.getAttribute('data-service');
                if (serviceId) AIServices.open(serviceId);
            },
            'confirm': () => {
                const message = element.getAttribute('data-message') || Language.t('message.confirm');
                if (confirm(message)) {
                    const callback = element.getAttribute('data-callback');
                    if (callback && window[callback]) {
                        window[callback](element, event);
                    }
                }
            }
        };
        
        if (actions[action]) {
            actions[action]();
        }
    };

    // ===== PUBLIC API =====
    OneAI.version = '1.0.0';
    OneAI.config = CONFIG;
    OneAI.state = State;
    OneAI.utils = Utils;
    OneAI.storage = Storage;
    OneAI.events = EventBus;
    OneAI.auth = Auth;
    OneAI.api = API;
    OneAI.toast = Toast;
    OneAI.modal = Modal;
    OneAI.theme = Theme;
    OneAI.language = Language;
    OneAI.ai = AIServices;
    OneAI.router = Router;
    OneAI.form = Form;
    OneAI.animation = Animation;
    OneAI.init = init;

    // Convenience methods for global access
    OneAI.Toast = Toast; // For onclick handlers
    OneAI.Modal = Modal; // For onclick handlers

})(window.OneAI);

// ===== AUTO-INITIALIZATION =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', OneAI.init);
} else {
    OneAI.init();
}

// ===== GLOBAL ERROR HANDLING =====
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    OneAI.toast.error('예상치 못한 오류가 발생했습니다.');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    OneAI.toast.error('네트워크 요청 중 오류가 발생했습니다.');
});

// ===== EXPORT FOR MODULE SYSTEMS =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OneAI;
}

if (typeof define === 'function' && define.amd) {
    define([], () => OneAI);
}