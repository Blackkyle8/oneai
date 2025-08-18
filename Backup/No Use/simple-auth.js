/**
 * Simple Auth System for OneAI
 * 간단하고 안전한 인증 시스템
 */

window.SimpleAuth = {
    // 로그인 함수
    login: function(userData, token, rememberMe) {
        console.log('SimpleAuth.login called:', { userData, token, rememberMe });
        
        try {
            const storage = rememberMe ? localStorage : sessionStorage;
            const otherStorage = rememberMe ? sessionStorage : localStorage;
            
            // 기존 데이터 정리
            otherStorage.removeItem('oneai_user');
            otherStorage.removeItem('oneai_token');
            
            // 새 데이터 저장
            storage.setItem('oneai_user', JSON.stringify(userData));
            storage.setItem('oneai_token', token);
            
            console.log('SimpleAuth: User data stored successfully');
            return true;
        } catch (error) {
            console.error('SimpleAuth.login error:', error);
            return false;
        }
    },

    // 로그아웃 함수
    logout: function() {
        console.log('SimpleAuth.logout called');
        
        try {
            localStorage.removeItem('oneai_user');
            localStorage.removeItem('oneai_token');
            sessionStorage.removeItem('oneai_user');
            sessionStorage.removeItem('oneai_token');
            
            console.log('SimpleAuth: User data cleared');
            return true;
        } catch (error) {
            console.error('SimpleAuth.logout error:', error);
            return false;
        }
    },

    // 현재 사용자 정보 가져오기
    getCurrentUser: function() {
        try {
            const userStr = localStorage.getItem('oneai_user') || 
                          sessionStorage.getItem('oneai_user');
            return userStr ? JSON.parse(userStr) : null;
        } catch (error) {
            console.error('SimpleAuth.getCurrentUser error:', error);
            return null;
        }
    },

    // 인증 상태 확인
    isAuthenticated: function() {
        const token = localStorage.getItem('oneai_token') || 
                     sessionStorage.getItem('oneai_token');
        const user = this.getCurrentUser();
        return !!(token && user);
    },

    // 토큰 가져오기
    getToken: function() {
        return localStorage.getItem('oneai_token') || 
               sessionStorage.getItem('oneai_token');
    }
};

// 전역 로그아웃 함수
window.logout = function() {
    window.SimpleAuth.logout();
    window.location.href = 'login.html';
};

console.log('SimpleAuth system loaded');
