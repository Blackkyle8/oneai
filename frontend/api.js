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
        const endpoint = userId ? `/users/${userId}/stats` : '/users/me/stats';
        return this.client.get(endpoint, { period });
    }

    /**
     * 사용자의 최근 활동 조회
     */
    async getRecentActivity(userId = null, limit = 10) {
        const endpoint = userId ? `/users/${userId}/activity` : '/users/me/activity';
        return this.client.get(endpoint, { limit });
    }

    /**
     * 사용자 구독 정보 조회
     */
    async getSubscriptionInfo() {
        return this.client.get('/users/me/subscription');
    }

    /**
     * 사용자 사용량 통계 조회
     */
    async getUsageStats(period = '7d') {
        return this.client.get('/users/me/usage', { period });
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
        return this.client.patch('/users/me/notifications/settings', settings);
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
     * 쉐어링 결제
     */
    async processPayment(sharingId, paymentData) {
        return this.client.post(`/sharing/${sharingId}/payment`, paymentData);
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