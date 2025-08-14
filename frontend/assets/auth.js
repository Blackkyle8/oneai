/**
 * OneAI 통합 인증 시스템
 * 모든 모듈에서 사용자 인증 상태와 정보를 일관되게 관리
 */

class OneAIAuth {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.initialized = false;
        this.userStorageKey = 'oneai_user';
        this.tokenStorageKey = 'oneai_token';
        
        this.init();
    }

    /**
     * 인증 시스템 초기화
     */
    init() {
        // localStorage와 sessionStorage에서 사용자 정보 로드
        this.loadUserFromStorage();
        
        // 페이지 로드 시 인증 상태 확인
        this.checkAuthStatus();
        
        // 다른 탭에서 로그인/로그아웃 시 동기화
        window.addEventListener('storage', (e) => {
            if (e.key === this.userStorageKey || e.key === this.tokenStorageKey) {
                this.loadUserFromStorage();
                this.updateUI();
            }
        });

        this.initialized = true;
        console.log('OneAI Auth System initialized');
    }

    /**
     * Storage에서 사용자 정보 로드
     */
    loadUserFromStorage() {
        try {
            // 토큰 확인 (localStorage 우선, sessionStorage 후순)
            this.token = localStorage.getItem(this.tokenStorageKey) || 
                        sessionStorage.getItem(this.tokenStorageKey);

            // 사용자 정보 확인
            const userStr = localStorage.getItem(this.userStorageKey) || 
                          sessionStorage.getItem(this.userStorageKey);
            
            if (userStr) {
                this.currentUser = JSON.parse(userStr);
                console.log('User loaded from storage:', this.currentUser);
            } else {
                this.currentUser = null;
            }
        } catch (error) {
            console.error('Error loading user from storage:', error);
            this.currentUser = null;
            this.token = null;
        }
    }

    /**
     * 사용자 로그인 처리
     */
    login(userData, token, rememberMe = false) {
        console.log('OneAIAuth.login() called with:', { userData, token, rememberMe });
        
        this.currentUser = userData;
        this.token = token;

        const storage = rememberMe ? localStorage : sessionStorage;
        const otherStorage = rememberMe ? sessionStorage : localStorage;

        console.log('Storing user data in:', rememberMe ? 'localStorage' : 'sessionStorage');

        // 새로운 storage에 저장
        storage.setItem(this.userStorageKey, JSON.stringify(userData));
        storage.setItem(this.tokenStorageKey, token);

        // 다른 storage에서 제거 (중복 방지)
        otherStorage.removeItem(this.userStorageKey);
        otherStorage.removeItem(this.tokenStorageKey);

        console.log('User data stored. Verifying...');
        console.log('Stored user:', storage.getItem(this.userStorageKey));
        console.log('Stored token:', storage.getItem(this.tokenStorageKey));

        this.updateUI();
        
        // 로그인 이벤트 발생
        this.dispatchAuthEvent('login', userData);
        
        console.log('User logged in successfully:', userData);
        console.log('Authentication state:', this.isAuthenticated());
    }

    /**
     * 사용자 로그아웃 처리
     */
    logout() {
        const prevUser = this.currentUser;
        
        this.currentUser = null;
        this.token = null;

        // 모든 storage에서 제거
        localStorage.removeItem(this.userStorageKey);
        localStorage.removeItem(this.tokenStorageKey);
        sessionStorage.removeItem(this.userStorageKey);
        sessionStorage.removeItem(this.tokenStorageKey);

        // 관련 데이터도 정리
        localStorage.removeItem('userInfo');
        localStorage.removeItem('userEmail');

        this.updateUI();
        
        // 로그아웃 이벤트 발생
        this.dispatchAuthEvent('logout', prevUser);
        
        console.log('User logged out');
    }

    /**
     * 현재 로그인된 사용자 정보 반환
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * 현재 토큰 반환
     */
    getToken() {
        return this.token;
    }

    /**
     * 로그인 상태 확인
     */
    isAuthenticated() {
        return !!(this.currentUser && this.token);
    }

    /**
     * 인증 상태 검증 (서버와 통신)
     */
    async checkAuthStatus() {
        if (!this.token) {
            return false;
        }

        try {
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                    // 서버에서 최신 사용자 정보로 업데이트
                    this.currentUser = { ...this.currentUser, ...data.user };
                    this.saveUserToStorage();
                    return true;
                }
            }
            
            // 토큰이 유효하지 않으면 로그아웃
            this.logout();
            return false;
        } catch (error) {
            console.warn('Auth status check failed:', error);
            // 네트워크 오류 시에는 기존 정보 유지
            return this.isAuthenticated();
        }
    }

    /**
     * 사용자 정보 storage에 저장
     */
    saveUserToStorage() {
        if (!this.currentUser) return;

        const isInLocal = localStorage.getItem(this.userStorageKey);
        const storage = isInLocal ? localStorage : sessionStorage;
        storage.setItem(this.userStorageKey, JSON.stringify(this.currentUser));
    }

    /**
     * UI 업데이트
     */
    updateUI() {
        if (!this.isAuthenticated()) {
            this.showLoginState();
        } else {
            this.showLoggedInState();
        }
    }

    /**
     * 로그인 전 상태 UI 표시
     */
    showLoginState() {
        // 프로필 버튼들 숨기기
        const profileBtns = document.querySelectorAll('.profile-btn, .profile-button');
        profileBtns.forEach(btn => {
            if (btn) btn.style.display = 'none';
        });

        // 프로필 드롭다운 숨기기
        const profileDropdowns = document.querySelectorAll('.profile-dropdown, #profileDropdown');
        profileDropdowns.forEach(dropdown => {
            if (dropdown) dropdown.style.display = 'none';
        });

        // 로그인 버튼 표시
        const loginBtns = document.querySelectorAll('.login-btn, .btn-login');
        loginBtns.forEach(btn => {
            if (btn) btn.style.display = 'inline-block';
        });

        // 사용자 이름 표시 영역 초기화
        const userNames = document.querySelectorAll('.user-name, .profile__name');
        userNames.forEach(element => {
            if (element) element.textContent = '사용자';
        });

        // 사용자 이메일 표시 영역 초기화
        const userEmails = document.querySelectorAll('.user-email, .profile-info');
        userEmails.forEach(element => {
            if (element) element.textContent = '';
        });
    }

    /**
     * 로그인 후 상태 UI 표시
     */
    showLoggedInState() {
        if (!this.currentUser) return;

        // 로그인 버튼 숨기기
        const loginBtns = document.querySelectorAll('.login-btn, .btn-login');
        loginBtns.forEach(btn => {
            if (btn) btn.style.display = 'none';
        });

        // 프로필 버튼 표시 및 업데이트
        const profileBtns = document.querySelectorAll('.profile-btn, .profile-button');
        profileBtns.forEach(btn => {
            if (btn) {
                btn.style.display = 'flex';
                // 사용자 이름의 첫 글자 또는 기본값
                const initial = this.currentUser.username ? 
                    this.currentUser.username[0].toUpperCase() : 
                    this.currentUser.email ? this.currentUser.email[0].toUpperCase() : 'U';
                btn.textContent = initial;
            }
        });

        // 사용자 이름 업데이트
        const userNames = document.querySelectorAll('.user-name, .profile__name');
        userNames.forEach(element => {
            if (element) {
                element.textContent = this.currentUser.username || 
                                    this.currentUser.name || 
                                    this.currentUser.email || 
                                    '사용자';
            }
        });

        // 사용자 이메일 업데이트  
        const userEmails = document.querySelectorAll('.user-email, .profile-info');
        userEmails.forEach(element => {
            if (element) {
                element.textContent = this.currentUser.email || '';
            }
        });

        // 프로필 이름 업데이트 (business.html 등)
        const profileNames = document.querySelectorAll('.text-base.font-semibold');
        profileNames.forEach(element => {
            if (element && element.closest('.profile-dropdown, #profileDropdown')) {
                element.textContent = this.currentUser.username || 
                                    this.currentUser.name || 
                                    '사용자';
            }
        });

        // 프로필 정보 업데이트 (data-user-info 속성 사용)
        const profileElements = document.querySelectorAll('[data-user-info]');
        profileElements.forEach(element => {
            const field = element.getAttribute('data-user-info');
            if (this.currentUser[field]) {
                element.textContent = this.currentUser[field];
            }
        });

        // 아바타 이미지 업데이트
        const avatarElements = document.querySelectorAll('.user-avatar, .profile-avatar');
        avatarElements.forEach(element => {
            if (this.currentUser.avatar_url) {
                element.src = this.currentUser.avatar_url;
                element.style.display = 'block';
            }
        });
    }

    /**
     * 인증 이벤트 발생
     */
    dispatchAuthEvent(type, userData) {
        const event = new CustomEvent(`oneai-auth-${type}`, {
            detail: { user: userData, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }

    /**
     * 로그인 페이지로 리다이렉트
     */
    redirectToLogin(returnUrl = null) {
        const currentUrl = returnUrl || window.location.pathname + window.location.search;
        const loginUrl = `/login.html${currentUrl !== '/login.html' ? '?redirect=' + encodeURIComponent(currentUrl) : ''}`;
        window.location.href = loginUrl;
    }

    /**
     * 인증이 필요한 페이지 보호
     */
    requireAuth(redirectOnFail = true) {
        if (!this.isAuthenticated()) {
            if (redirectOnFail) {
                this.redirectToLogin();
            }
            return false;
        }
        return true;
    }

    /**
     * 사용자 정보 업데이트
     */
    updateUser(newUserData) {
        if (this.currentUser) {
            this.currentUser = { ...this.currentUser, ...newUserData };
            this.saveUserToStorage();
            this.updateUI();
            
            // 사용자 정보 업데이트 이벤트 발생
            this.dispatchAuthEvent('user-updated', this.currentUser);
        }
    }
}

// 전역 인스턴스 생성
console.log('Creating OneAIAuth instance...');
window.OneAIAuth = new OneAIAuth();
console.log('OneAIAuth instance created:', window.OneAIAuth);

// DOM 로드 완료 시 초기화
if (document.readyState === 'loading') {
    console.log('Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, updating UI...');
        window.OneAIAuth.updateUI();
    });
} else {
    console.log('Document already loaded, updating UI immediately...');
    window.OneAIAuth.updateUI();
}

// 공통 로그아웃 함수
window.logout = function() {
    if (window.OneAIAuth) {
        window.OneAIAuth.logout();
    }
    window.location.href = 'login.html';
};

// 공통 프로필 토글 함수
window.toggleProfile = function() {
    const dropdown = document.getElementById('profileDropdown') || 
                    document.querySelector('.profile-dropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    }
};

// 프로필 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('profileDropdown') || 
                    document.querySelector('.profile-dropdown');
    const profileBtn = document.querySelector('.profile-btn, .profile-button');
    
    if (dropdown && !event.target.closest('.profile-btn, .profile-button') && 
        !event.target.closest('#profileDropdown, .profile-dropdown')) {
        dropdown.style.display = 'none';
    }
});

console.log('OneAI Auth System loaded');

// 전역 OneAIAuth 인스턴스 생성
window.OneAIAuth = new OneAIAuth();

// 간단한 전역 함수들 생성 (bind 없이)
window.oneAILogin = function(userData, token, rememberMe) {
    return window.OneAIAuth.login(userData, token, rememberMe);
};

window.oneAILogout = function() {
    return window.OneAIAuth.logout();
};

window.oneAIGetCurrentUser = function() {
    return window.OneAIAuth.getCurrentUser();
};

window.oneAIIsAuthenticated = function() {
    return window.OneAIAuth.isAuthenticated();
};

console.log('OneAI Auth System instance created:', window.OneAIAuth);
console.log('Global auth functions created');
