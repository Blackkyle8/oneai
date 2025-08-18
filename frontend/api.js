/**
 * One AI Frontend API Client v1.0
 * 백엔드 API와의 통신을 담당하는 클라이언트 모듈
 * 
 * 기능:
 * - RESTful API 통신
 * - 인증 관리 (JWT)
 * - 에러 핸들링
 * - 요청/응답 인터셉터
 * - 로딩 상태 관리
 * - 재시도 로직
 * - 오프라인 지원
 */

class OneAIClient {
    constructor() {
        this.baseURL = this.getAPIBaseURL();
        this.token = this.getStoredToken();
        this.requestQueue = [];
        this.isOnline = navigator.onLine;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.userCache = new UserDataCache();
        
        this.initializeEventListeners();
        this.setupRequestInterceptors();
    }

    /**
     * API Base URL 결정 (환경별)
     */
    getAPIBaseURL() {
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3000/api';
        } else if (hostname.includes('github.dev') || hostname.includes('codespaces')) {
            // GitHub Codespaces 환경 - 백엔드 3000번 포트로 직접 연결
            const backendURL = window.location.protocol + '//' + hostname.replace('-8000.', '-3000.');
            return backendURL + '/api';
        } else if (hostname.includes('staging')) {
            return 'https://api-staging.oneai.com/api';
        } else {
            return 'https://api.oneai.com/api';
        }
    }

    /**
     * 저장된 토큰 가져오기
     */
    getStoredToken() {
        return localStorage.getItem('oneai_token') || sessionStorage.getItem('oneai_token');
    }

    /**
     * 토큰 저장
     */
    setToken(token, remember = false) {
        this.token = token;
        if (remember) {
            localStorage.setItem('oneai_token', token);
            sessionStorage.removeItem('oneai_token');
        } else {
            sessionStorage.setItem('oneai_token', token);
            localStorage.removeItem('oneai_token');
        }
    }

    /**
     * 토큰 제거
     */
    removeToken() {
        this.token = null;
        localStorage.removeItem('oneai_token');
        sessionStorage.removeItem('oneai_token');
    }

    /**
     * 이벤트 리스너 초기화
     */
    initializeEventListeners() {
        // 온라인/오프라인 상태 감지
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processQueuedRequests();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
        });

        // 페이지 언로드시 진행중인 요청 취소
        window.addEventListener('beforeunload', () => {
            this.cancelAllRequests();
        });
    }

    /**
     * 요청 인터셉터 설정
     */
    setupRequestInterceptors() {
        // 글로벌 에러 핸들러
        window.addEventListener('unhandledrejection', (event) => {
            if (event.reason && event.reason.name === 'APIError') {
                this.handleGlobalError(event.reason);
                event.preventDefault();
            }
        });
    }

    /**
     * HTTP 요청 메서드
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const requestId = this.generateRequestId();

        // 기본 옵션 설정
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Request-ID': requestId,
            },
            credentials: 'include',
        };

        // 인증 헤더 추가
        if (this.token) {
            defaultOptions.headers['Authorization'] = `Bearer ${this.token}`;
        }

        // 옵션 병합
        const finalOptions = this.mergeOptions(defaultOptions, options);

        // 오프라인 상태에서 요청 큐에 추가
        if (!this.isOnline && options.offline !== false) {
            return this.queueRequest(url, finalOptions);
        }

        // 로딩 상태 시작
        if (options.showLoading !== false) {
            this.showLoading(requestId);
        }

        try {
            const response = await this.performRequest(url, finalOptions);
            
            // 응답 처리
            const result = await this.handleResponse(response, options);
            
            // 로딩 상태 종료
            this.hideLoading(requestId);
            
            return result;
            
        } catch (error) {
            this.hideLoading(requestId);
            
            // 재시도 로직
            if (this.shouldRetry(error, options)) {
                return this.retryRequest(url, finalOptions, options);
            }
            
            throw this.handleError(error, options);
        }
    }

    /**
     * 실제 HTTP 요청 수행
     */
    async performRequest(url, options) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response;
            
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    /**
     * 응답 처리
     */
    async handleResponse(response, options) {
        // 토큰 만료 체크
        if (response.status === 401) {
            this.handleTokenExpiry();
            throw new APIError('인증이 만료되었습니다. 다시 로그인해주세요.', 401);
        }

        // 에러 응답 체크
        if (!response.ok) {
            const errorData = await this.safeParseJSON(response);
            throw new APIError(
                errorData?.message || `HTTP ${response.status}`,
                response.status,
                errorData
            );
        }

        // 성공 응답 파싱
        const contentType = response.headers.get('Content-Type');
        
        if (contentType?.includes('application/json')) {
            return await response.json();
        } else if (contentType?.includes('text/')) {
            return await response.text();
        } else {
            return await response.blob();
        }
    }

    /**
     * 안전한 JSON 파싱
     */
    async safeParseJSON(response) {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    /**
     * 에러 처리
     */
    handleError(error, options) {
        console.error('API Error:', error);

        // 네트워크 에러
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return new APIError('네트워크 연결을 확인해주세요.', 0);
        }

        // 타임아웃 에러
        if (error.name === 'AbortError') {
            return new APIError('요청 시간이 초과되었습니다.', 0);
        }

        // API 에러
        if (error instanceof APIError) {
            return error;
        }

        // 기타 에러
        return new APIError('알 수 없는 오류가 발생했습니다.', 0);
    }

    /**
     * 글로벌 에러 핸들러
     */
    handleGlobalError(error) {
        if (window.OneAI && typeof window.OneAI.showToast === 'function') {
            window.OneAI.showToast(error.message, 'error');
        } else {
            alert(error.message);
        }
    }

    /**
     * 토큰 만료 처리
     */
    handleTokenExpiry() {
        this.removeToken();
        this.userCache.clearUserData(); // 캐시 클리어 추가
        
        // 로그인 페이지로 리다이렉트 (현재 페이지가 로그인 페이지가 아닌 경우)
        if (!window.location.pathname.includes('login')) {
            window.location.href = '/login.html';
        }
    }

    /**
     * 재시도 여부 판단
     */
    shouldRetry(error, options) {
        if (options.retry === false) return false;
        if (error.status === 401 || error.status === 403) return false;
        if ((options._retryCount || 0) >= this.retryAttempts) return false;
        
        return error.status >= 500 || error.status === 0;
    }

    /**
     * 요청 재시도
     */
    async retryRequest(url, options, originalOptions) {
        const retryCount = (originalOptions._retryCount || 0) + 1;
        const delay = this.retryDelay * Math.pow(2, retryCount - 1); // 지수 백오프
        
        await this.sleep(delay);
        
        return this.performRequest(url, {
            ...options,
            _retryCount: retryCount
        });
    }

    /**
     * 요청 큐에 추가 (오프라인용)
     */
    queueRequest(url, options) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                url,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });
        });
    }

    /**
     * 큐된 요청들 처리
     */
    async processQueuedRequests() {
        const now = Date.now();
        const validRequests = this.requestQueue.filter(
            req => now - req.timestamp < 300000 // 5분 이내 요청만 처리
        );

        this.requestQueue = [];

        for (const req of validRequests) {
            try {
                const result = await this.performRequest(req.url, req.options);
                req.resolve(result);
            } catch (error) {
                req.reject(error);
            }
        }
    }

    /**
     * 모든 요청 취소
     */
    cancelAllRequests() {
        this.requestQueue.forEach(req => {
            req.reject(new APIError('요청이 취소되었습니다.', 0));
        });
        this.requestQueue = [];
    }

    /**
     * 옵션 병합
     */
    mergeOptions(defaultOptions, userOptions) {
        const merged = { ...defaultOptions, ...userOptions };
        
        // 헤더 병합
        if (userOptions.headers) {
            merged.headers = { ...defaultOptions.headers, ...userOptions.headers };
        }
        
        return merged;
    }

    /**
     * 요청 ID 생성
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 로딩 상태 표시
     */
    showLoading(requestId) {
        document.body.style.cursor = 'wait';
        
        // 커스텀 로딩 인디케이터가 있다면 사용
        if (window.OneAI && typeof window.OneAI.showLoading === 'function') {
            window.OneAI.showLoading(requestId);
        }
    }

    /**
     * 로딩 상태 숨김
     */
    hideLoading(requestId) {
        document.body.style.cursor = 'default';
        
        if (window.OneAI && typeof window.OneAI.hideLoading === 'function') {
            window.OneAI.hideLoading(requestId);
        }
    }

    /**
     * 유틸리티: 지연
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== HTTP 메서드 헬퍼들 =====

    /**
     * GET 요청
     */
    async get(endpoint, params = {}, options = {}) {
        const url = new URL(endpoint, this.baseURL);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });

        return this.request(url.pathname + url.search, {
            ...options,
            method: 'GET'
        });
    }

    /**
     * POST 요청
     */
    async post(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT 요청
     */
    async put(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * PATCH 요청
     */
    async patch(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE 요청
     */
    async delete(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'DELETE'
        });
    }

    /**
     * 파일 업로드
     */
    async upload(endpoint, file, options = {}) {
        const formData = new FormData();
        formData.append('file', file);

        // 추가 필드가 있다면 FormData에 추가
        if (options.fields) {
            Object.keys(options.fields).forEach(key => {
                formData.append(key, options.fields[key]);
            });
        }

        return this.request(endpoint, {
            ...options,
            method: 'POST',
            headers: {
                // Content-Type을 설정하지 않음 (브라우저가 자동으로 boundary 설정)
                ...(options.headers || {})
            },
            body: formData
        });
    }

    /**
     * 캐시를 활용한 사용자 정보 조회 개선
     */
    async getUserWithCache() {
        // 캐시에서 먼저 확인
        const cached = this.userCache.get('current_user');
        if (cached) {
            return cached;
        }
        
        // 캐시에 없으면 API 호출
        try {
            const response = await this.get('/users/me');
            const userData = response.data || response;
            
            // 캐시에 저장
            this.userCache.set('current_user', userData);
            
            return userData;
        } catch (error) {
            console.error('사용자 정보 조회 실패:', error);
            throw error;
        }
    }

    /**
     * 실시간 사용자 상태 업데이트를 위한 WebSocket 연결 (선택사항)
     */
    initializeWebSocket() {
        if (!this.token) return;
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${this.token}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket 연결됨');
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('WebSocket 메시지 파싱 오류:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket 연결 종료');
                // 재연결 로직 (필요시)
                setTimeout(() => {
                    if (this.token) {
                        this.initializeWebSocket();
                    }
                }, 5000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket 오류:', error);
            };
            
        } catch (error) {
            console.error('WebSocket 연결 실패:', error);
        }
    }

    /**
     * WebSocket 메시지 처리
     */
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'user_update':
                // 사용자 정보 업데이트
                this.userCache.set('current_user', data.user);
                this.notifyUserUpdate(data.user);
                break;
                
            case 'stats_update':
                // 통계 정보 업데이트
                this.userCache.set('user_stats', data.stats);
                this.notifyStatsUpdate(data.stats);
                break;
                
            case 'notification':
                // 새 알림
                this.notifyNewNotification(data.notification);
                break;
        }
    }

    /**
     * 사용자 업데이트 알림
     */
    notifyUserUpdate(user) {
        window.dispatchEvent(new CustomEvent('oneai:user:updated', {
            detail: { user }
        }));
    }

    /**
     * 통계 업데이트 알림
     */
    notifyStatsUpdate(stats) {
        window.dispatchEvent(new CustomEvent('oneai:stats:updated', {
            detail: { stats }
        }));
    }

    /**
     * 새 알림 알림
     */
    notifyNewNotification(notification) {
        window.dispatchEvent(new CustomEvent('oneai:notification:new', {
            detail: { notification }
        }));
    }
}

/**
 * 사용자 데이터 캐싱 관리
 */
class UserDataCache {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5분
    }
    
    set(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
    
    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        // 캐시 만료 체크
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    clear() {
        this.cache.clear();
    }
    
    clearUserData() {
        // 사용자 관련 캐시만 제거
        for (const [key] of this.cache) {
            if (key.includes('user') || key.includes('profile') || key.includes('stats')) {
                this.cache.delete(key);
            }
        }
    }
}

/**
 * API 에러 클래스
 */
class APIError extends Error {
    constructor(message, status = 0, data = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}

/**
 * One AI API 모듈
 * 각 기능별 API 엔드포인트를 정의
 */
class OneAIAPI {
    constructor() {
        this.client = new OneAIClient();
    }

    // ===== 인증 관련 API =====
    
    /**
     * 로그인
     */
    async login(email, password, remember = false) {
        const response = await this.client.post('/auth/login', {
            email,
            password
        });

        if (response.token) {
            this.client.setToken(response.token, remember);
        }

        return response;
    }

    /**
     * 회원가입
     */
    async register(userData) {
        return this.client.post('/auth/register', userData);
    }

    /**
     * 로그아웃
     */
    async logout() {
        try {
            await this.client.post('/auth/logout');
        } finally {
            this.client.removeToken();
        }
    }

    /**
     * 토큰 갱신
     */
    async refreshToken() {
        const response = await this.client.post('/auth/refresh');
        if (response.token) {
            this.client.setToken(response.token);
        }
        return response;
    }

    /**
     * 비밀번호 재설정 요청
     */
    async requestPasswordReset(email) {
        return this.client.post('/auth/password-reset', { email });
    }

    /**
     * 비밀번호 재설정
     */
    async resetPassword(token, newPassword) {
        return this.client.post('/auth/password-reset/confirm', {
            token,
            password: newPassword
        });
    }

    // ===== 사용자 관련 API =====

    /**
     * 현재 사용자 정보 조회
     */
    async getCurrentUser() {
        return this.client.get('/users/me');
    }

    /**
     * 사용자 프로필 정보 조회 (getCurrentUser의 별칭)
     */
    async getUserProfile() {
        return this.getCurrentUser();
    }

    /**
     * 사용자 프로필 업데이트
     */
    async updateProfile(profileData) {
        return this.client.patch('/users/me', profileData);
    }

    /**
     * 프로필 이미지 업로드
     */
    async uploadProfileImage(imageFile) {
        return this.client.upload('/users/me/avatar', imageFile);
    }

    /**
     * 사용자 설정 조회
     */
    async getUserSettings() {
        return this.client.get('/users/me/settings');
    }

    /**
     * 사용자 설정 업데이트
     */
    async updateUserSettings(settings) {
        return this.client.patch('/users/me/settings', settings);
    }

    /**
     * 사용자 통계 정보 조회
     */
    async getUserStats(userId = null, period = '30d') {
        try {
            const endpoint = userId ? `/users/${userId}/stats` : '/users/me/stats';
            const response = await this.client.get(endpoint, { period });
            
            if (response.success && response.data) {
                const stats = response.data;
                
                // 통계 데이터를 프론트엔드에서 사용하기 쉬운 형태로 변환
                return {
                    consecutive_days: stats.consecutive_days || stats.streak || 0,
                    total_conversations: stats.total_conversations || stats.conversations?.total || 0,
                    saved_items: stats.saved_items || stats.bookmarks || 0,
                    satisfaction_rating: stats.satisfaction_rating || stats.rating || 0,
                    monthly_conversations: stats.monthly_conversations || stats.conversations?.monthly || 0,
                    total_usage_hours: stats.total_usage_hours || stats.usage_time?.total || 0,
                    cost_savings: stats.cost_savings || stats.savings || 0,
                    favorite_prompts: stats.favorite_prompts || stats.prompts?.favorite || 0,
                    // 추가 통계
                    weekly_usage: stats.weekly_usage || [],
                    growth_rate: stats.growth_rate || 0,
                    avg_session_time: stats.avg_session_time || 0
                };
            }
            
            return null;
        } catch (error) {
            console.error('사용자 통계 조회 실패:', error);
            return null;
        }
    }

    /**
     * 사용자의 최근 활동 조회
     */
    async getRecentActivity(userId = null, limit = 10) {
        try {
            const endpoint = userId ? `/users/${userId}/activity` : '/users/me/activity';
            const response = await this.client.get(endpoint, { limit });
            
            if (response.success && response.data) {
                // 활동 데이터를 프론트엔드에서 사용하기 쉬운 형태로 변환
                return response.data.map(activity => ({
                    type: activity.type || 'ai',
                    title: activity.title || activity.description || '활동 내역',
                    time: this.formatActivityTime(activity.created_at || activity.timestamp),
                    icon: this.getActivityIcon(activity.type)
                }));
            }
            
            return null;
        } catch (error) {
            console.error('최근 활동 조회 실패:', error);
            return null;
        }
    }

    /**
     * 활동 시간 포맷팅 헬퍼
     */
    formatActivityTime(timestamp) {
        if (!timestamp) return '시간 미상';
        
        const now = new Date();
        const activityTime = new Date(timestamp);
        const diffMs = now - activityTime;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMinutes < 1) return '방금 전';
        if (diffMinutes < 60) return `${diffMinutes}분 전`;
        if (diffHours < 24) return `${diffHours}시간 전`;
        if (diffDays < 7) return `${diffDays}일 전`;
        
        return activityTime.toLocaleDateString('ko-KR');
    }

    /**
     * 활동 타입별 아이콘 반환
     */
    getActivityIcon(type) {
        const icons = {
            'ai_conversation': '🤖',
            'ai': '🤖',
            'sharing_join': '🤝',
            'sharing': '🤝',
            'share': '🤝',
            'setting': '⚙️',
            'settings': '⚙️',
            'profile_update': '👤',
            'profile': '👤',
            'subscription': '💳',
            'payment': '💳',
            'file_upload': '📁',
            'file': '📁',
            'notification': '🔔',
            'login': '🔑',
            'logout': '🚪'
        };
        
        return icons[type] || '📋';
    }

    /**
     * 사용자 구독 정보 조회
     */
    async getSubscriptionInfo() {
        try {
            const response = await this.client.get('/users/me/subscription');
            
            if (response.success && response.data) {
                const subscription = response.data;
                
                // 구독 정보를 프론트엔드에서 사용하기 쉬운 형태로 변환
                return {
                    type: subscription.plan || subscription.type || 'Free',
                    status: subscription.status || 'active',
                    price: subscription.price || 0,
                    next_billing_date: subscription.next_billing_date || subscription.next_payment || null,
                    usage_limit: subscription.usage_limit || subscription.limits?.usage || 'unlimited',
                    concurrent_sessions: subscription.concurrent_sessions || subscription.limits?.sessions || 1,
                    features: subscription.features || [],
                    created_at: subscription.created_at || subscription.subscribed_at,
                    expires_at: subscription.expires_at || subscription.valid_until
                };
            }
            
            return null;
        } catch (error) {
            console.error('구독 정보 조회 실패:', error);
            return null;
        }
    }

    /**
     * 사용자 사용량 통계 조회
     */
    async getUsageStats(period = '7d') {
        return this.client.get('/users/me/usage', { period });
    }

    /**
     * 주간 사용량 데이터 조회
     */
    async getWeeklyUsage() {
        try {
            // 일간 사용량 데이터를 7일치 가져와서 주간 배열로 변환
            const response = await this.client.get('/users/me/usage/weekly');
            
            if (response.success && response.data) {
                return response.data.weekly || response.data;
            }
            
            // 실패시 getUsageStats에서 주간 데이터 추출 시도
            const usageStats = await this.getUsageStats('7d');
            if (usageStats && usageStats.data && usageStats.data.daily) {
                return usageStats.data.daily.map(day => day.count || 0);
            }
            
            return null;
        } catch (error) {
            console.error('주간 사용량 조회 실패:', error);
            return null;
        }
    }

    /**
     * 알림 설정 조회
     */
    async getNotificationSettings() {
        return this.client.get('/users/me/notifications/settings');
    }

    /**
     * 알림 설정 업데이트
     */
    async updateNotificationSettings(settings) {
        try {
            const response = await this.client.patch('/users/me/notifications/settings', settings);
            
            if (response.success) {
                // 로컬 사용자 정보도 업데이트
                if (window.OneAIAuth && window.OneAIAuth.currentUser) {
                    const updatedUser = { 
                        ...window.OneAIAuth.currentUser,
                        settings: {
                            ...window.OneAIAuth.currentUser.settings,
                            notifications: settings.enabled !== undefined ? settings.enabled : settings.notifications
                        }
                    };
                    window.OneAIAuth.updateUser(updatedUser);
                }
            }
            
            return response;
        } catch (error) {
            console.error('알림 설정 업데이트 실패:', error);
            throw error;
        }
    }

    /**
     * 이메일 변경
     */
    async changeEmail(newEmail, currentPassword) {
        return this.client.patch('/users/me/email', {
            email: newEmail,
            password: currentPassword
        });
    }

    /**
     * 비밀번호 변경
     */
    async changePassword(currentPassword, newPassword) {
        return this.client.patch('/users/me/password', {
            currentPassword,
            newPassword
        });
    }

    /**
     * 언어 설정 변경
     */
    async changeLanguage(language) {
        return this.client.patch('/users/me/language', { language });
    }

    /**
     * 계정 삭제
     */
    async deleteAccount(password) {
        return this.client.delete('/users/me', {
            body: JSON.stringify({ password }),
            headers: { 'Content-Type': 'application/json' }
        });
    }

    /**
     * 프로필 기본 정보만 빠르게 조회 (캐시 활용)
     */
    async getBasicProfile() {
        try {
            // 캐시에서 먼저 확인
            const cached = this.client.userCache.get('basic_profile');
            if (cached) {
                return cached;
            }
            
            const response = await this.client.get('/users/me/basic');
            
            if (response.success && response.data) {
                // 캐시에 저장
                this.client.userCache.set('basic_profile', response.data);
                return response.data;
            }
            
            // 실패시 getCurrentUser로 대체
            return this.getCurrentUser();
            
        } catch (error) {
            console.error('기본 프로필 조회 실패:', error);
            // 오류시 OneAIAuth에서 가져오기
            return window.OneAIAuth?.getCurrentUser() || null;
        }
    }

    /**
     * 저장된 항목 수 조회 (북마크, 즐겨찾기 등)
     */
    async getSavedItemsCount() {
        try {
            const response = await this.client.get('/users/me/saved-items/count');
            return response.data?.count || 0;
        } catch (error) {
            console.error('저장된 항목 수 조회 실패:', error);
            return 0;
        }
    }

    /**
     * 사용자 만족도 평점 조회
     */
    async getUserSatisfactionRating() {
        try {
            const response = await this.client.get('/users/me/satisfaction');
            return response.data?.rating || 0;
        } catch (error) {
            console.error('만족도 평점 조회 실패:', error);
            return 0;
        }
    }

    /**
     * 비용 절약 금액 계산 (쉐어링 통한 절약액)
     */
    async getCostSavings() {
        try {
            const response = await this.client.get('/users/me/cost-savings');
            return response.data?.total_savings || 0;
        } catch (error) {
            console.error('비용 절약 정보 조회 실패:', error);
            return 0;
        }
    }

    /**
     * 즐겨찾는 프롬프트 수 조회
     */
    async getFavoritePromptsCount() {
        try {
            const response = await this.client.get('/users/me/prompts/favorites/count');
            return response.data?.count || 0;
        } catch (error) {
            console.error('즐겨찾는 프롬프트 수 조회 실패:', error);
            return 0;
        }
    }

    /**
     * 개선된 사용자 통계 조회 - 모든 데이터 한 번에
     */
    async getCompleteUserStats(period = '30d') {
        try {
            // 여러 API를 병렬로 호출하여 완전한 통계 데이터 수집
            const [
                basicStats,
                savedItems,
                satisfaction,
                costSavings,
                favoritePrompts
            ] = await Promise.allSettled([
                this.getUserStats(null, period),
                this.getSavedItemsCount(),
                this.getUserSatisfactionRating(),
                this.getCostSavings(),
                this.getFavoritePromptsCount()
            ]);

            // 기본 통계 데이터
            const stats = basicStats.status === 'fulfilled' ? basicStats.value : {};
            
            // 추가 데이터 병합
            return {
                ...stats,
                saved_items: savedItems.status === 'fulfilled' ? savedItems.value : 0,
                satisfaction_rating: satisfaction.status === 'fulfilled' ? satisfaction.value : 0,
                cost_savings: costSavings.status === 'fulfilled' ? costSavings.value : 0,
                favorite_prompts: favoritePrompts.status === 'fulfilled' ? favoritePrompts.value : 0,
                // 계산된 추가 통계
                growth_rate: this.calculateGrowthRate(stats),
                avg_session_time: this.calculateAvgSessionTime(stats)
            };
        } catch (error) {
            console.error('완전한 사용자 통계 조회 실패:', error);
            return null;
        }
    }

    /**
     * 주간 사용량 데이터 안정적 조회
     */
    async getReliableWeeklyUsage() {
        try {
            // 1차 시도: 전용 주간 API
            let response = await this.client.get('/users/me/usage/weekly');
            if (response.success && response.data?.weekly) {
                return response.data.weekly;
            }

            // 2차 시도: 7일 통계에서 추출
            response = await this.client.get('/users/me/usage/daily', { days: 7 });
            if (response.success && Array.isArray(response.data)) {
                return response.data.map(day => day.conversations || day.count || 0);
            }

            // 3차 시도: 일반 사용량 통계에서 추출
            response = await this.getUsageStats('7d');
            if (response?.data?.daily) {
                return response.data.daily.slice(-7).map(day => day.count || 0);
            }

            // 실패 시 더미 데이터 반환 (차트 깨짐 방지)
            console.warn('주간 사용량 데이터 조회 실패 - 더미 데이터 사용');
            return [0, 0, 0, 0, 0, 0, 0];

        } catch (error) {
            console.error('주간 사용량 조회 실패:', error);
            return [0, 0, 0, 0, 0, 0, 0]; // 기본값 반환
        }
    }

    /**
     * 최근 활동 안정적 조회 및 표준화
     */
    async getStandardizedRecentActivity(limit = 10) {
        try {
            const response = await this.client.get('/users/me/activity', { limit });
            
            if (!response.success || !Array.isArray(response.data)) {
                return this.generateDefaultActivity();
            }

            // 활동 데이터 표준화
            return response.data.map(activity => {
                return {
                    type: this.standardizeActivityType(activity.type || activity.action),
                    title: this.generateActivityTitle(activity),
                    time: this.formatActivityTime(activity.created_at || activity.timestamp),
                    icon: this.getActivityIcon(activity.type || activity.action)
                };
            });

        } catch (error) {
            console.error('최근 활동 조회 실패:', error);
            return this.generateDefaultActivity();
        }
    }

    /**
     * 활동 타입 표준화
     */
    standardizeActivityType(type) {
        const typeMap = {
            'conversation': 'ai_conversation',
            'chat': 'ai_conversation',
            'ai_chat': 'ai_conversation',
            'join_sharing': 'sharing_join',
            'sharing_join': 'sharing_join',
            'setting_update': 'setting',
            'profile_edit': 'profile_update'
        };
        
        return typeMap[type] || type || 'ai';
    }

    /**
     * 활동 제목 생성
     */
    generateActivityTitle(activity) {
        if (activity.title) return activity.title;
        if (activity.description) return activity.description;
        
        // 타입별 기본 제목 생성
        const titleMap = {
            'ai_conversation': 'AI와 대화',
            'sharing_join': '쉐어링 참여',
            'setting': '설정 변경',
            'profile_update': '프로필 수정',
            'login': '로그인',
            'file_upload': '파일 업로드'
        };
        
        const type = this.standardizeActivityType(activity.type || activity.action);
        return titleMap[type] || '활동';
    }

    /**
     * 기본 활동 데이터 생성 (API 실패 시)
     */
    generateDefaultActivity() {
        return [
            {
                type: 'ai',
                title: '최근 활동 내역이 없습니다',
                time: '정보 없음',
                icon: '📋'
            }
        ];
    }

    /**
     * 성장률 계산 헬퍼
     */
    calculateGrowthRate(stats) {
        if (!stats || !stats.monthly_conversations || !stats.previous_month_conversations) {
            return 0;
        }
        
        const current = stats.monthly_conversations;
        const previous = stats.previous_month_conversations;
        
        if (previous === 0) return current > 0 ? 100 : 0;
        
        return Math.round(((current - previous) / previous) * 100);
    }

    /**
     * 평균 세션 시간 계산
     */
    calculateAvgSessionTime(stats) {
        if (!stats || !stats.total_usage_hours || !stats.total_sessions) {
            return 0;
        }
        
        return Math.round((stats.total_usage_hours / stats.total_sessions) * 60); // 분 단위
    }

    /**
     * 사용자 데이터 전체 새로고침
     */
    async refreshAllUserData() {
        try {
            // 캐시 클리어
            this.client.userCache.clear();
            
            // 모든 사용자 관련 데이터를 병렬로 새로 가져오기
            const [profile, subscription, stats, activity] = await Promise.allSettled([
                this.getCurrentUser(),
                this.getSubscriptionInfo(),
                this.getUserStats(),
                this.getRecentActivity()
            ]);
            
            return {
                profile: profile.status === 'fulfilled' ? profile.value : null,
                subscription: subscription.status === 'fulfilled' ? subscription.value : null,
                stats: stats.status === 'fulfilled' ? stats.value : null,
                activity: activity.status === 'fulfilled' ? activity.value : null
            };
        } catch (error) {
            console.error('사용자 데이터 새로고침 실패:', error);
            throw error;
        }
    }

    // ===== AI 엔진 관련 API =====

    /**
     * 연결된 AI 엔진 목록 조회
     */
    async getConnectedAIEngines() {
        return this.client.get('/ai-engines');
    }

    /**
     * AI 엔진 추가
     */
    async addAIEngine(engineData) {
        return this.client.post('/ai-engines', engineData);
    }

    /**
     * AI 엔진 제거
     */
    async removeAIEngine(engineId) {
        return this.client.delete(`/ai-engines/${engineId}`);
    }

    /**
     * 사용 가능한 AI 엔진 목록
     */
    async getAvailableAIEngines() {
        return this.client.get('/ai-engines/available');
    }

    // ===== 커뮤니티 관련 API =====

    /**
     * 게시글 목록 조회
     */
    async getPosts(params = {}) {
        return this.client.get('/community/posts', params);
    }

    /**
     * 게시글 상세 조회
     */
    async getPost(postId) {
        return this.client.get(`/community/posts/${postId}`);
    }

    /**
     * 게시글 작성
     */
    async createPost(postData) {
        return this.client.post('/community/posts', postData);
    }

    /**
     * 게시글 수정
     */
    async updatePost(postId, postData) {
        return this.client.patch(`/community/posts/${postId}`, postData);
    }

    /**
     * 게시글 삭제
     */
    async deletePost(postId) {
        return this.client.delete(`/community/posts/${postId}`);
    }

    /**
     * 댓글 목록 조회
     */
    async getComments(postId) {
        return this.client.get(`/community/posts/${postId}/comments`);
    }

    /**
     * 댓글 작성
     */
    async createComment(postId, commentData) {
        return this.client.post(`/community/posts/${postId}/comments`, commentData);
    }

    /**
     * 좋아요/취소
     */
    async toggleLike(postId) {
        return this.client.post(`/community/posts/${postId}/like`);
    }

    /**
     * 콘텐츠 업로드 (이미지, 파일)
     */
    async uploadContent(file, type = 'image') {
        return this.client.upload('/community/upload', file, {
            fields: { type }
        });
    }

    // ===== 쉐어링 관련 API =====

    /**
     * 쉐어링 목록 조회
     */
    async getSharings(params = {}) {
        return this.client.get('/sharing', params);
    }

    /**
     * 쉐어링 상세 조회
     */
    async getSharing(sharingId) {
        return this.client.get(`/sharing/${sharingId}`);
    }

    /**
     * 쉐어링 생성
     */
    async createSharing(sharingData) {
        return this.client.post('/sharing', sharingData);
    }

    /**
     * 쉐어링 참여
     */
    async joinSharing(sharingId, applicationData) {
        return this.client.post(`/sharing/${sharingId}/join`, applicationData);
    }

    /**
     * 쉐어링 탈퇴
     */
    async leaveSharing(sharingId) {
        return this.client.post(`/sharing/${sharingId}/leave`);
    }

    /**
     * 내 쉐어링 목록
     */
    async getMySharings() {
        return this.client.get('/sharing/my');
    }

    /**
     * 쉐어링 결제 (레거시)
     */
    async processPayment(sharingId, paymentData) {
        return this.client.post(`/sharing/${sharingId}/payment`, paymentData);
    }

    // ===== 결제 관련 API =====

    /**
     * 결제 인텐트 생성 (일회성 결제)
     * @param {number} amount - 결제 금액 (원)
     * @param {string} sharingId - 쉐어링 ID (선택사항)
     * @param {string} description - 결제 설명
     * @param {object} metadata - 추가 메타데이터
     */
    async createPaymentIntent(amount, sharingId = null, description = '', metadata = {}) {
        const payload = {
            amount,
            currency: 'krw',
            description: description || `One AI 결제 - ${amount.toLocaleString()}원`,
            metadata: {
                ...metadata,
                ...(sharingId && { sharingId })
            }
        };

        return this.client.post('/payment/create-intent', payload);
    }

    /**
     * 구독 생성 (AI 쉐어링용)
     * @param {string} priceId - Stripe 가격 ID
     * @param {string} sharingId - 쉐어링 ID
     * @param {string} paymentMethodId - 결제 방법 ID
     */
    async createSubscription(priceId, sharingId, paymentMethodId) {
        return this.client.post('/payment/create-subscription', {
            priceId,
            sharingId,
            paymentMethodId
        });
    }

    /**
     * 구독 취소
     * @param {string} subscriptionId - 구독 ID
     * @param {boolean} cancelAtPeriodEnd - 기간 종료시 취소 여부
     */
    async cancelSubscription(subscriptionId, cancelAtPeriodEnd = true) {
        return this.client.post('/payment/cancel-subscription', {
            subscriptionId,
            cancelAtPeriodEnd
        });
    }

    /**
     * 환불 요청 (관리자용)
     * @param {string} paymentIntentId - 결제 인텐트 ID
     * @param {number} amount - 환불 금액 (선택사항, 없으면 전액)
     * @param {string} reason - 환불 사유
     */
    async requestRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
        return this.client.post('/payment/refund', {
            paymentIntentId,
            amount,
            reason
        });
    }

    /**
     * 결제 내역 조회
     * @param {number} page - 페이지 번호
     * @param {number} limit - 페이지당 항목 수
     * @param {string} type - 결제 타입 필터
     */
    async getPaymentHistory(page = 1, limit = 20, type = null) {
        const params = { page, limit };
        if (type) params.type = type;
        
        return this.client.get('/payment/history', params);
    }

    /**
     * 구독 목록 조회
     */
    async getSubscriptions() {
        return this.client.get('/payment/subscriptions');
    }

    /**
     * 결제 방법 목록 조회
     */
    async getPaymentMethods() {
        return this.client.get('/payment/payment-methods');
    }

    /**
     * 결제 방법 삭제
     * @param {string} paymentMethodId - 결제 방법 ID
     */
    async deletePaymentMethod(paymentMethodId) {
        return this.client.delete(`/payment/payment-methods/${paymentMethodId}`);
    }

    /**
     * Stripe Elements용 결제 의도 확인
     * @param {string} clientSecret - 클라이언트 시크릿
     * @param {object} stripe - Stripe 인스턴스
     * @param {object} elements - Stripe Elements
     */
    async confirmPayment(clientSecret, stripe, elements) {
        try {
            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                clientSecret,
                confirmParams: {
                    return_url: `${window.location.origin}/payment/success`
                }
            });

            if (error) {
                throw new APIError(error.message, error.code);
            }

            return { success: true, paymentIntent };
        } catch (error) {
            console.error('결제 확인 실패:', error);
            throw error;
        }
    }

    /**
     * 결제 상태 확인
     * @param {string} paymentIntentId - 결제 인텐트 ID
     */
    async checkPaymentStatus(paymentIntentId) {
        return this.client.get(`/payment/status/${paymentIntentId}`, {}, { 
            showLoading: false 
        });
    }

    /**
     * 쉐어링 그룹 결제 처리 (통합)
     * @param {string} sharingId - 쉐어링 ID
     * @param {object} paymentData - 결제 데이터
     */
    async processSharingPayment(sharingId, paymentData) {
        const { amount, paymentType = 'one_time', paymentMethodId } = paymentData;

        if (paymentType === 'subscription') {
            // 구독 결제
            return this.createSubscription(
                paymentData.priceId, 
                sharingId, 
                paymentMethodId
            );
        } else {
            // 일회성 결제
            return this.createPaymentIntent(
                amount, 
                sharingId, 
                `쉐어링 그룹 결제 - ${sharingId}`
            );
        }
    }

    /**
     * 결제 방법 설정 (Stripe Setup Intent)
     * @param {string} customerId - 고객 ID (선택사항)
     */
    async setupPaymentMethod(customerId = null) {
        return this.client.post('/payment/setup-intent', {
            customerId
        });
    }

    // ===== 비즈니스 관련 API =====

    /**
     * 나의 AI 엔진 목록
     */
    async getMyAIEngines() {
        return this.client.get('/business/engines');
    }

    /**
     * AI 엔진 생성
     */
    async createAIEngine(engineData) {
        return this.client.post('/business/engines', engineData);
    }

    /**
     * AI 엔진 수정
     */
    async updateAIEngine(engineId, engineData) {
        return this.client.patch(`/business/engines/${engineId}`, engineData);
    }

    /**
     * AI 엔진 삭제
     */
    async deleteAIEngine(engineId) {
        return this.client.delete(`/business/engines/${engineId}`);
    }

    /**
     * 수익 통계 조회
     */
    async getRevenueStats(period = '30d') {
        return this.client.get('/business/stats/revenue', { period });
    }

    /**
     * 사용량 통계 조회
     */
    async getUsageStats(engineId, period = '30d') {
        return this.client.get(`/business/engines/${engineId}/stats`, { period });
    }

    // ===== 파일 관리 API =====

    /**
     * 파일 업로드
     */
    async uploadFile(file, options = {}) {
        return this.client.upload('/files/upload', file, options);
    }

    /**
     * 파일 목록 조회
     */
    async getFiles(params = {}) {
        return this.client.get('/files', params);
    }

    /**
     * 파일 삭제
     */
    async deleteFile(fileId) {
        return this.client.delete(`/files/${fileId}`);
    }

    // ===== 알림 관련 API =====

    /**
     * 알림 목록 조회
     */
    async getNotifications(params = {}) {
        return this.client.get('/notifications', params);
    }

    /**
     * 알림 읽음 처리
     */
    async markNotificationAsRead(notificationId) {
        return this.client.patch(`/notifications/${notificationId}`, {
            read: true
        });
    }

    /**
     * 모든 알림 읽음 처리
     */
    async markAllNotificationsAsRead() {
        return this.client.patch('/notifications/mark-all-read');
    }

    // ===== 검색 관련 API =====

    /**
     * 통합 검색
     */
    async search(query, filters = {}) {
        return this.client.get('/search', { query, ...filters });
    }

    /**
     * 검색 제안
     */
    async getSearchSuggestions(query) {
        return this.client.get('/search/suggestions', { query });
    }

    // ===== 시스템 관련 API =====

    /**
     * 서버 상태 확인
     */
    async checkHealth() {
        return this.client.get('/health', {}, { showLoading: false });
    }

    /**
     * 앱 버전 정보
     */
    async getVersionInfo() {
        return this.client.get('/version', {}, { showLoading: false });
    }

    // ===== 마이페이지 호환성을 위한 별칭 메서드들 =====
    
    /**
     * 주간 사용량 조회 (별칭)
     * 마이페이지에서 fetchWeeklyUsage()가 호출하는 메서드
     */
    async getWeeklyUsage() {
        return this.getReliableWeeklyUsage();
    }

    /**
     * 최근 활동 조회 (별칭)
     * 마이페이지에서 fetchRecentActivity()가 호출하는 메서드
     */
    async getRecentActivity(limit = 10) {
        return this.getStandardizedRecentActivity(limit);
    }

    /**
     * 사용량 통계 조회 (마이페이지 호환)
     * period 파라미터를 받아서 적절한 메서드 호출
     */
    async getUsageStats(period = '7d') {
        if (period === '7d' || period === 'weekly') {
            return {
                success: true,
                data: {
                    daily: await this.getReliableWeeklyUsage()
                }
            };
        }
        
        // 다른 기간의 경우 기본 API 호출
        try {
            return await this.client.get('/users/me/usage', { period });
        } catch (error) {
            console.error('사용량 통계 조회 실패:', error);
            return {
                success: false,
                data: { daily: [0, 0, 0, 0, 0, 0, 0] }
            };
        }
    }

    /**
     * 기본 사용자 정보 조회 (캐시 우선)
     * getCurrentUser의 개선된 버전
     */
    async getUserProfile() {
        try {
            // 캐시된 기본 프로필 먼저 시도
            const basic = await this.getBasicProfile();
            if (basic) return { success: true, data: basic };
            
            // 캐시 실패시 전체 프로필 조회
            const full = await this.getCurrentUser();
            return { success: true, data: full.data || full };
            
        } catch (error) {
            console.error('사용자 프로필 조회 실패:', error);
            
            // 최종 폴백: OneAIAuth에서 가져오기
            const authUser = window.OneAIAuth?.getCurrentUser();
            if (authUser) {
                return { success: true, data: authUser };
            }
            
            throw error;
        }
    }

    /**
     * 알림 설정 업데이트 (간소화된 인터페이스)
     */
    async updateNotificationSettings(enabled) {
        // boolean 값을 받아서 적절한 형태로 변환
        const settings = typeof enabled === 'boolean' 
            ? { enabled } 
            : enabled;
            
        try {
            const response = await this.client.patch('/users/me/notifications/settings', settings);
            
            if (response.success) {
                // 로컬 사용자 정보도 업데이트
                if (window.OneAIAuth && window.OneAIAuth.currentUser) {
                    const updatedUser = { 
                        ...window.OneAIAuth.currentUser,
                        settings: {
                            ...window.OneAIAuth.currentUser.settings,
                            notifications: settings.enabled !== undefined ? settings.enabled : settings.notifications
                        }
                    };
                    window.OneAIAuth.updateUser(updatedUser);
                }
            }
            
            return response;
        } catch (error) {
            console.error('알림 설정 업데이트 실패:', error);
            throw error;
        }
    }

    // ===== 결제 관련 유틸리티 메서드 =====

    /**
     * 한국 원화 포맷팅
     * @param {number} amount - 금액 (원)
     */
    formatKRW(amount) {
        return new Intl.NumberFormat('ko-KR', {
            style: 'currency',
            currency: 'KRW'
        }).format(amount);
    }

    /**
     * 결제 상태 한국어 변환
     * @param {string} status - 결제 상태
     */
    translatePaymentStatus(status) {
        const statusMap = {
            'pending': '대기중',
            'succeeded': '성공',
            'failed': '실패',
            'canceled': '취소됨',
            'refunded': '환불됨',
            'processing': '처리중',
            'requires_payment_method': '결제방법 필요',
            'requires_confirmation': '확인 필요',
            'requires_action': '추가 인증 필요'
        };
        
        return statusMap[status] || status;
    }

    /**
     * 구독 상태 한국어 변환
     * @param {string} status - 구독 상태
     */
    translateSubscriptionStatus(status) {
        const statusMap = {
            'active': '활성',
            'past_due': '연체',
            'canceled': '취소됨',
            'unpaid': '미결제',
            'incomplete': '불완전',
            'incomplete_expired': '만료됨',
            'trialing': '체험중',
            'paused': '일시정지'
        };
        
        return statusMap[status] || status;
    }

    /**
     * 결제 에러 메시지 한국어 변환
     * @param {string} errorCode - Stripe 에러 코드
     */
    translatePaymentError(errorCode) {
        const errorMap = {
            'card_declined': '카드가 거부되었습니다.',
            'insufficient_funds': '잔액이 부족합니다.',
            'invalid_cvc': 'CVC 번호가 올바르지 않습니다.',
            'expired_card': '카드가 만료되었습니다.',
            'incorrect_cvc': 'CVC 번호를 확인해주세요.',
            'processing_error': '처리 중 오류가 발생했습니다.',
            'authentication_required': '추가 인증이 필요합니다.',
            'payment_intent_authentication_failure': '결제 인증에 실패했습니다.',
            'payment_method_unactivated': '결제 방법이 활성화되지 않았습니다.',
            'payment_method_invalid': '유효하지 않은 결제 방법입니다.'
        };
        
        return errorMap[errorCode] || '결제 처리 중 오류가 발생했습니다.';
    }

    /**
     * 쉐어링 그룹의 개인 분담금 계산
     * @param {number} totalAmount - 총 금액
     * @param {number} participants - 참여자 수
     */
    calculateSharingCost(totalAmount, participants) {
        if (participants <= 0) return 0;
        return Math.ceil(totalAmount / participants);
    }

    /**
     * 구독 다음 결제일 계산
     * @param {string} interval - 결제 주기 (month, year)
     * @param {number} intervalCount - 주기 횟수
     * @param {Date} startDate - 시작일
     */
    calculateNextBillingDate(interval = 'month', intervalCount = 1, startDate = new Date()) {
        const date = new Date(startDate);
        
        if (interval === 'month') {
            date.setMonth(date.getMonth() + intervalCount);
        } else if (interval === 'year') {
            date.setFullYear(date.getFullYear() + intervalCount);
        } else if (interval === 'week') {
            date.setDate(date.getDate() + (7 * intervalCount));
        } else if (interval === 'day') {
            date.setDate(date.getDate() + intervalCount);
        }
        
        return date;
    }

    /**
     * 결제 방법 마스킹 (카드 번호)
     * @param {string} cardNumber - 카드 번호
     */
    maskCardNumber(cardNumber) {
        if (!cardNumber) return '';
        const cleaned = cardNumber.replace(/\D/g, '');
        if (cleaned.length < 4) return cleaned;
        
        const last4 = cleaned.slice(-4);
        return `**** **** **** ${last4}`;
    }

    /**
     * 카드 브랜드 아이콘 반환
     * @param {string} brand - 카드 브랜드
     */
    getCardBrandIcon(brand) {
        const brandIcons = {
            'visa': '💳',
            'mastercard': '💳', 
            'amex': '💳',
            'discover': '💳',
            'diners': '💳',
            'jcb': '💳',
            'unionpay': '💳',
            'samsung_pay': '📱',
            'apple_pay': '📱',
            'google_pay': '📱',
            'kakaopay': '💛',
            'naverpay': '💚'
        };
        
        return brandIcons[brand?.toLowerCase()] || '💳';
    }

    /**
     * 결제 실패 시 재시도 가능 여부 확인
     * @param {string} errorCode - 에러 코드
     */
    isRetryablePaymentError(errorCode) {
        const retryableErrors = [
            'processing_error',
            'temporary_failure',
            'rate_limit_error',
            'api_connection_error'
        ];
        
        return retryableErrors.includes(errorCode);
    }

    /**
     * 결제 완료 후 성공 페이지로 리다이렉트
     * @param {string} paymentIntentId - 결제 인텐트 ID
     * @param {string} sharingId - 쉐어링 ID (선택사항)
     */
    redirectToPaymentSuccess(paymentIntentId, sharingId = null) {
        const params = new URLSearchParams({ 
            payment_intent: paymentIntentId 
        });
        
        if (sharingId) {
            params.append('sharing_id', sharingId);
        }
        
        window.location.href = `/payment/success?${params.toString()}`;
    }

    /**
     * 결제 실패 후 실패 페이지로 리다이렉트
     * @param {string} error - 에러 메시지
     * @param {string} errorCode - 에러 코드
     */
    redirectToPaymentFailure(error, errorCode = null) {
        const params = new URLSearchParams({ error });
        
        if (errorCode) {
            params.append('error_code', errorCode);
        }
        
        window.location.href = `/payment/failure?${params.toString()}`;
    }
}

// 전역 API 인스턴스 생성
const api = new OneAIAPI();

// 전역 스코프에 추가 (다른 스크립트에서 사용 가능)
if (typeof window !== 'undefined') {
    window.OneAIAPI = api;
    window.APIError = APIError;
}

// ES6 모듈로 내보내기 (번들러 사용시)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OneAIAPI, APIError };
}

// 초기화 완료 이벤트 발생
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 One AI API Client initialized');
        
        // API 클라이언트 준비 완료 이벤트 발생
        window.dispatchEvent(new CustomEvent('oneai:api:ready', {
            detail: { api }
        }));
        
        // ===== 전역 인스턴스에 추가 헬퍼 메서드들 =====
        
        /**
         * 마이페이지 전용 데이터 로더
         * 모든 필요한 데이터를 한 번에 가져오는 헬퍼 메서드
         */
        window.OneAIAPI.loadMyPageData = async function() {
            try {
                console.log('마이페이지 데이터 로딩 시작...');
                
                // 모든 데이터를 병렬로 요청
                const [
                    userProfile,
                    subscriptionInfo, 
                    userStats,
                    weeklyUsage,
                    recentActivity
                ] = await Promise.allSettled([
                    this.getUserProfile(),
                    this.getSubscriptionInfo(),
                    this.getCompleteUserStats(),
                    this.getReliableWeeklyUsage(),
                    this.getStandardizedRecentActivity()
                ]);

                // 결과 정리
                const results = {
                    userProfile: userProfile.status === 'fulfilled' ? userProfile.value?.data : null,
                    subscriptionInfo: subscriptionInfo.status === 'fulfilled' ? subscriptionInfo.value : null,
                    userStats: userStats.status === 'fulfilled' ? userStats.value : null,
                    weeklyUsage: weeklyUsage.status === 'fulfilled' ? weeklyUsage.value : null,
                    recentActivity: recentActivity.status === 'fulfilled' ? recentActivity.value : null,
                    
                    // 로딩 상태 정보
                    loadStatus: {
                        userProfile: userProfile.status,
                        subscriptionInfo: subscriptionInfo.status,
                        userStats: userStats.status,
                        weeklyUsage: weeklyUsage.status,
                        recentActivity: recentActivity.status
                    }
                };

                console.log('마이페이지 데이터 로딩 완료:', results);
                return results;
                
            } catch (error) {
                console.error('마이페이지 데이터 로딩 실패:', error);
                throw error;
            }
        };

        /**
         * 빠른 테스트를 위한 Mock 데이터 모드 토글
         */
        window.OneAIAPI.enableMockMode = function() {
            console.warn('🔧 Mock 모드 활성화 - 실제 API 대신 샘플 데이터 사용');
            
            // 주요 메서드들을 Mock으로 교체
            this.getUserProfile = () => Promise.resolve({
                success: true,
                data: {
                    username: 'Mock사용자',
                    email: 'mock@oneai.com',
                    created_at: '2024-01-15',
                    verified: true,
                    settings: { notifications: true, language: 'ko' }
                }
            });
            
            this.getSubscriptionInfo = () => Promise.resolve({
                type: 'Pro',
                status: 'active',
                price: 29000,
                next_billing_date: '2024-12-15',
                usage_limit: 'unlimited',
                concurrent_sessions: 3
            });
            
            this.getCompleteUserStats = () => Promise.resolve({
                consecutive_days: 15,
                total_conversations: 1250,
                saved_items: 42,
                satisfaction_rating: 4.8,
                monthly_conversations: 156,
                total_usage_hours: 67,
                cost_savings: 125000,
                favorite_prompts: 8
            });
            
            this.getReliableWeeklyUsage = () => Promise.resolve([42, 56, 32, 63, 49, 21, 28]);
            
            this.getStandardizedRecentActivity = () => Promise.resolve([
                {
                    type: 'ai_conversation',
                    title: 'ChatGPT로 코딩 문제 해결',
                    time: '2분 전',
                    icon: '🤖'
                },
                {
                    type: 'sharing_join', 
                    title: 'Claude Pro 쉐어링 참여',
                    time: '30분 전',
                    icon: '🤝'
                }
            ]);
            
            this._mockMode = true;
        };
        
        /**
         * Mock 모드 비활성화
         */
        window.OneAIAPI.disableMockMode = function() {
            if (this._mockMode) {
                console.log('Mock 모드 비활성화 - 페이지를 새로고침하세요');
                location.reload();
            }
        };
    });
}

/**
 * 사용 예제:
 * 
 * // 기본 사용법
 * const api = window.OneAIAPI;
 * 
 * // 로그인
 * try {
 *   const user = await api.login('user@example.com', 'password');
 *   console.log('로그인 성공:', user);
 * } catch (error) {
 *   console.error('로그인 실패:', error.message);
 * }
 * 
 * // 게시글 목록 조회
 * const posts = await api.getPosts({ page: 1, limit: 10 });
 * 
 * // 파일 업로드
 * const fileInput = document.querySelector('#fileInput');
 * const file = fileInput.files[0];
 * const result = await api.uploadFile(file);
 * 
 * // 결제 관련 사용 예제
 * 
 * // 1. 일회성 결제 (쉐어링 그룹 참여비)
 * try {
 *   const paymentIntent = await api.createPaymentIntent(29000, 'sharing_123', '쉐어링 그룹 참여비');
 *   console.log('결제 인텐트 생성:', paymentIntent.clientSecret);
 *   
 *   // Stripe Elements로 결제 처리
 *   const stripe = Stripe('pk_test_...');
 *   const elements = stripe.elements();
 *   const result = await api.confirmPayment(paymentIntent.clientSecret, stripe, elements);
 *   
 *   if (result.success) {
 *     api.redirectToPaymentSuccess(result.paymentIntent.id, 'sharing_123');
 *   }
 * } catch (error) {
 *   console.error('결제 실패:', error);
 *   api.redirectToPaymentFailure(api.translatePaymentError(error.code), error.code);
 * }
 * 
 * // 2. 구독 결제 (AI 서비스 월정액)
 * try {
 *   const subscription = await api.createSubscription('price_monthly_pro', 'sharing_456', 'pm_card_123');
 *   console.log('구독 생성 성공:', subscription);
 * } catch (error) {
 *   console.error('구독 생성 실패:', error);
 * }
 * 
 * // 3. 결제 내역 조회
 * const paymentHistory = await api.getPaymentHistory(1, 20);
 * paymentHistory.payments.forEach(payment => {
 *   console.log(`${api.formatKRW(payment.amount)} - ${api.translatePaymentStatus(payment.status)}`);
 * });
 * 
 * // 4. 결제 방법 관리
 * const paymentMethods = await api.getPaymentMethods();
 * paymentMethods.forEach(pm => {
 *   console.log(`${api.getCardBrandIcon(pm.card.brand)} ${api.maskCardNumber(pm.card.last4)}`);
 * });
 * 
 * // 5. 쉐어링 분담금 계산
 * const totalCost = 120000; // 연 12만원
 * const participants = 4;
 * const individualCost = api.calculateSharingCost(totalCost, participants);
 * console.log(`개인 분담금: ${api.formatKRW(individualCost)}`); // 30,000원
 * 
 * // 에러 핸들링
 * try {
 *   await api.createPost({ title: 'Test', content: 'Content' });
 * } catch (error) {
 *   if (error instanceof APIError) {
 *     if (error.status === 401) {
 *       // 인증 오류 처리
 *     } else if (error.status === 400) {
 *       // 유효성 검사 오류 처리
 *     }
 *   }
 * }
 */