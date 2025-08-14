/**
 * 쉐어링 관리 기능
 */

// 쉐어링 그룹 관리
async function manageSharingGroup(groupId) {
    try {
        const response = await fetch(`/api/sharing/group/${groupId}`, {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('oneai_token')
            }
        });

        if (!response.ok) {
            throw new Error('쉐어링 그룹 정보를 불러오는데 실패했습니다.');
        }

        const groupData = await response.json();
        showManageModal(groupData);
    } catch (error) {
        showError(error.message);
    }
}

// 쉐어링 그룹 탈퇴
async function leaveSharingGroup(groupId) {
    try {
        const confirmed = await showConfirmModal(
            '쉐어링 그룹 탈퇴',
            '정말로 이 쉐어링 그룹을 탈퇴하시겠습니까?',
            '탈퇴하기',
            '취소'
        );

        if (!confirmed) return;

        const response = await fetch(`/api/sharing/group/${groupId}/leave`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('oneai_token'),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('쉐어링 그룹 탈퇴에 실패했습니다.');
        }

        showSuccess('쉐어링 그룹에서 탈퇴했습니다.');
        location.reload();
    } catch (error) {
        showError(error.message);
    }
}

// 결제 정보 업데이트
async function updatePaymentInfo(groupId) {
    try {
        const response = await fetch(`/api/sharing/payment/${groupId}/update`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('oneai_token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cardNumber: document.getElementById('cardNumber').value,
                expiryDate: document.getElementById('expiryDate').value,
                cvv: document.getElementById('cvv').value
            })
        });

        if (!response.ok) {
            throw new Error('결제 정보 업데이트에 실패했습니다.');
        }

        showSuccess('결제 정보가 업데이트되었습니다.');
        closeModal('paymentModal');
    } catch (error) {
        showError(error.message);
    }
}

// 관리 모달 표시
function showManageModal(groupData) {
    const modal = document.getElementById('manageModal');
    const content = document.getElementById('manageModalContent');

    content.innerHTML = `
        <h2>${groupData.service_name} 쉐어링 관리</h2>
        <div class="group-info">
            <p><strong>상태:</strong> ${getStatusText(groupData.status)}</p>
            <p><strong>참여자:</strong> ${groupData.current_participants}/${groupData.max_participants}명</p>
            <p><strong>월 비용:</strong> ${formatCurrency(groupData.monthly_cost)}원</p>
        </div>
        <div class="management-actions">
            <button onclick="updatePaymentInfo('${groupData.id}')" class="btn btn--secondary">
                결제 정보 변경
            </button>
            <button onclick="leaveSharingGroup('${groupData.id}')" class="btn btn--danger">
                그룹 탈퇴
            </button>
        </div>
    `;

    modal.style.display = 'block';
}

// 확인 모달 표시
function showConfirmModal(title, message, confirmText, cancelText) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="modal-actions">
                    <button onclick="this.closest('.modal').remove(); resolve(true);" class="btn btn--danger">
                        ${confirmText}
                    </button>
                    <button onclick="this.closest('.modal').remove(); resolve(false);" class="btn btn--secondary">
                        ${cancelText}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    });
}

// 유틸리티 함수
function formatCurrency(amount) {
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW'
    }).format(amount);
}

function getStatusText(status) {
    const statusMap = {
        'recruiting': '모집 중',
        'active': '활성',
        'paused': '일시중지',
        'ended': '종료'
    };
    return statusMap[status] || status;
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast--success';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast--error';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', function() {
    // 쉐어링 목록 로드
    loadMySharings();
});

// 참여 중인 쉐어링 목록 로드
async function loadMySharings() {
    try {
        const response = await fetch('/api/sharing/my', {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('oneai_token')
// 쉐어링 목록 로드
async function loadMySharings() {
    try {
        // 로그인한 경우 내 쉐어링 목록, 아닌 경우 공개 쉐어링 목록 로드
        const endpoint = localStorage.getItem('oneai_token') ? '/api/sharing/my' : '/api/sharing/public';
        const headers = {};
        
        if (localStorage.getItem('oneai_token')) {
            headers['Authorization'] = 'Bearer ' + localStorage.getItem('oneai_token');
        }

        const response = await fetch(endpoint, { headers });

        if (!response.ok) {
            throw new Error('쉐어링 목록을 불러오는데 실패했습니다.');
        }

        const sharings = await response.json();
        displayMySharings(sharings);
    } catch (error) {
        showError(error.message);
    }
}
    if (sharings.length === 0) {
        container.innerHTML = '<p class="empty-state">참여 중인 쉐어링이 없습니다.</p>';
        return;
    }

    container.innerHTML = sharings.map(sharing => `
        <div class="sharing-card">
            <div class="sharing-card__header">
                <h3>${sharing.service_name}</h3>
                <span class="badge badge--${getStatusBadgeClass(sharing.status)}">
                    ${getStatusText(sharing.status)}
                </span>
            </div>
            <div class="sharing-card__body">
                <p><strong>참여자:</strong> ${sharing.current_participants}/${sharing.max_participants}명</p>
                <p><strong>월 비용:</strong> ${formatCurrency(sharing.monthly_cost)}원</p>
                <p><strong>다음 결제일:</strong> ${formatDate(sharing.next_payment_date)}</p>
            </div>
            <div class="sharing-card__actions">
                <button onclick="manageSharingGroup('${sharing.id}')" class="btn btn--secondary">
                    관리하기
                </button>
            </div>
        </div>
    `).join('');
}

function getStatusBadgeClass(status) {
    const classMap = {
        'recruiting': 'warning',
        'active': 'success',
        'paused': 'info',
        'ended': 'error'
    };
    return classMap[status] || 'default';
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}
