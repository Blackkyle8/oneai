/**
 * OneAI Sounds Library
 * 웹 오디오 API를 사용한 사운드 이펙트 시스템
 */

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map();
        this.enabled = true;
        this.volume = 0.5;
        
        this.initAudioContext();
        this.preloadSounds();
    }
    
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }
    
    // 사운드 생성 함수들
    createBeepSound(frequency = 800, duration = 0.1, type = 'sine') {
        if (!this.audioContext) return null;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        
        return { oscillator, gainNode, duration };
    }
    
    createClickSound() {
        return this.createBeepSound(1000, 0.05, 'square');
    }
    
    createHoverSound() {
        return this.createBeepSound(1200, 0.03, 'sine');
    }
    
    createSuccessSound() {
        // 성공 사운드 (상승하는 톤)
        if (!this.audioContext) return null;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(523, this.audioContext.currentTime); // C5
        oscillator.frequency.linearRampToValueAtTime(784, this.audioContext.currentTime + 0.1); // G5
        oscillator.frequency.linearRampToValueAtTime(1047, this.audioContext.currentTime + 0.2); // C6
        
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.4, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
        
        return { oscillator, gainNode, duration: 0.3 };
    }
    
    createErrorSound() {
        // 오류 사운드 (하강하는 톤)
        if (!this.audioContext) return null;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(200, this.audioContext.currentTime + 0.15);
        
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.2);
        
        return { oscillator, gainNode, duration: 0.2 };
    }
    
    createNotificationSound() {
        // 알림 사운드 (더블 비프)
        if (!this.audioContext) return null;
        
        const sounds = [];
        
        // 첫 번째 비프
        const sound1 = this.createBeepSound(800, 0.1, 'sine');
        sounds.push(sound1);
        
        // 두 번째 비프 (약간 높은 톤)
        setTimeout(() => {
            if (this.enabled) {
                const sound2 = this.createBeepSound(1000, 0.1, 'sine');
                this.playSound(sound2);
            }
        }, 150);
        
        return sound1;
    }
    
    createTypingSound() {
        // 타이핑 사운드 (랜덤 주파수)
        const frequencies = [800, 850, 900, 950, 1000];
        const frequency = frequencies[Math.floor(Math.random() * frequencies.length)];
        return this.createBeepSound(frequency, 0.02, 'square');
    }
    
    createWhooshSound() {
        // 휙 하는 소리 (화면 전환 등에 사용)
        if (!this.audioContext) return null;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(500, this.audioContext.currentTime + 0.3);
        
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.2, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
        
        return { oscillator, gainNode, duration: 0.3 };
    }
    
    // 사운드 재생
    playSound(soundData) {
        if (!this.enabled || !soundData || !this.audioContext) return;
        
        try {
            soundData.oscillator.start(this.audioContext.currentTime);
            soundData.oscillator.stop(this.audioContext.currentTime + soundData.duration);
        } catch (error) {
            console.warn('Failed to play sound:', error);
        }
    }
    
    // 프리셋 사운드들
    preloadSounds() {
        this.sounds.set('click', () => this.createClickSound());
        this.sounds.set('hover', () => this.createHoverSound());
        this.sounds.set('success', () => this.createSuccessSound());
        this.sounds.set('error', () => this.createErrorSound());
        this.sounds.set('notification', () => this.createNotificationSound());
        this.sounds.set('typing', () => this.createTypingSound());
        this.sounds.set('whoosh', () => this.createWhooshSound());
    }
    
    // 사운드 재생 (이름으로)
    play(soundName) {
        if (!this.enabled) return;
        
        const soundCreator = this.sounds.get(soundName);
        if (soundCreator) {
            const soundData = soundCreator();
            this.playSound(soundData);
        }
    }
    
    // 볼륨 조절
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
    
    // 사운드 활성화/비활성화
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    // 오디오 컨텍스트 재개 (사용자 상호작용 후)
    resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
}

// UI 사운드 이벤트 바인딩 유틸리티
export function bindUISounds(soundManager) {
    // 버튼 클릭 사운드
    document.addEventListener('click', (e) => {
        if (e.target.matches('button, .btn, .clickable')) {
            soundManager.play('click');
        }
    });
    
    // 호버 사운드
    document.addEventListener('mouseenter', (e) => {
        if (e.target.matches('button:not(:disabled), .btn:not(:disabled), .clickable')) {
            soundManager.play('hover');
        }
    }, true);
    
    // 타이핑 사운드
    document.addEventListener('input', (e) => {
        if (e.target.matches('input[type="text"], input[type="email"], textarea')) {
            soundManager.play('typing');
        }
    });
    
    // 토스트 알림 사운드
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        if (node.classList && node.classList.contains('toast')) {
                            if (node.classList.contains('toast--success')) {
                                soundManager.play('success');
                            } else if (node.classList.contains('toast--error')) {
                                soundManager.play('error');
                            } else {
                                soundManager.play('notification');
                            }
                        }
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}

// 사운드 설정 UI
export function createSoundSettingsUI(soundManager) {
    const settingsHTML = `
        <div class="sound-settings">
            <div class="sound-setting-item">
                <label class="sound-setting-label">
                    <input type="checkbox" id="soundEnabled" ${soundManager.enabled ? 'checked' : ''}>
                    <span>사운드 효과 활성화</span>
                </label>
            </div>
            
            <div class="sound-setting-item">
                <label class="sound-setting-label">
                    <span>볼륨</span>
                    <input type="range" id="soundVolume" min="0" max="1" step="0.1" value="${soundManager.volume}">
                    <span id="volumeValue">${Math.round(soundManager.volume * 100)}%</span>
                </label>
            </div>
            
            <div class="sound-setting-item">
                <label class="sound-setting-label">
                    <span>사운드 테스트</span>
                    <div class="sound-test-buttons">
                        <button type="button" onclick="soundManager.play('click')">클릭</button>
                        <button type="button" onclick="soundManager.play('success')">성공</button>
                        <button type="button" onclick="soundManager.play('error')">오류</button>
                        <button type="button" onclick="soundManager.play('notification')">알림</button>
                    </div>
                </label>
            </div>
        </div>
    `;
    
    return settingsHTML;
}

// 사운드 설정 이벤트 바인딩
export function bindSoundSettings(soundManager) {
    const enabledCheckbox = document.getElementById('soundEnabled');
    const volumeSlider = document.getElementById('soundVolume');
    const volumeValue = document.getElementById('volumeValue');
    
    if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', (e) => {
            soundManager.setEnabled(e.target.checked);
            localStorage.setItem('oneai_sound_enabled', e.target.checked);
        });
    }
    
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            soundManager.setVolume(volume);
            if (volumeValue) {
                volumeValue.textContent = Math.round(volume * 100) + '%';
            }
            localStorage.setItem('oneai_sound_volume', volume);
        });
    }
}

// 설정 로드
export function loadSoundSettings(soundManager) {
    const savedEnabled = localStorage.getItem('oneai_sound_enabled');
    const savedVolume = localStorage.getItem('oneai_sound_volume');
    
    if (savedEnabled !== null) {
        soundManager.setEnabled(savedEnabled === 'true');
    }
    
    if (savedVolume !== null) {
        soundManager.setVolume(parseFloat(savedVolume));
    }
}

// 전역 사운드 매니저 인스턴스
export const soundManager = new SoundManager();

// 사용자 상호작용 후 오디오 컨텍스트 활성화
document.addEventListener('click', () => {
    soundManager.resumeAudioContext();
}, { once: true });

// 설정 로드
loadSoundSettings(soundManager);

// 사운드 이벤트 바인딩
document.addEventListener('DOMContentLoaded', () => {
    bindUISounds(soundManager);
});

// Web Audio API 지원 여부 확인
export function isWebAudioSupported() {
    return !!(window.AudioContext || window.webkitAudioContext);
}

// 사운드 CSS 클래스
export const SOUND_CSS = `
.sound-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: var(--color-surface-elevated);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.sound-setting-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.sound-setting-label {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-primary);
    font-size: 14px;
    cursor: pointer;
}

.sound-setting-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary-500);
}

.sound-setting-label input[type="range"] {
    flex: 1;
    height: 6px;
    background: var(--color-surface-modal);
    border-radius: 3px;
    outline: none;
    accent-color: var(--color-primary-500);
}

.sound-test-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.sound-test-buttons button {
    padding: 6px 12px;
    background: var(--color-surface-modal);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.sound-test-buttons button:hover {
    background: var(--color-primary-500);
    border-color: var(--color-primary-500);
}

#volumeValue {
    min-width: 40px;
    text-align: right;
    color: var(--text-tertiary);
    font-size: 12px;
}
`;

export default {
    SoundManager,
    soundManager,
    bindUISounds,
    createSoundSettingsUI,
    bindSoundSettings,
    loadSoundSettings,
    isWebAudioSupported,
    SOUND_CSS
};