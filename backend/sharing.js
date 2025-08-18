/**
 * One AI - Sharing Backend Module
 * AI 구독 쉐어링 관리 시스템
 * 
 * 기능:
 * - 쉐어링 그룹 생성/관리
 * - 참여자 관리
 * - 결제 처리
 * - 통계 및 분석
 * - 알림 시스템
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, validateInput } = require('./middleware');
const { 
    getConnection, 
    executeQuery,
    savePaymentLog,
    updatePaymentLog,
    getPaymentHistory,
    saveSubscription,
    updateSubscriptionStatus,
    getSubscriptionByUser,
    getUserSubscriptions,
    saveCustomer,
    findCustomerByUserId,
    getUserById,
    updateSharingPaymentStatus,
    updateSharingParticipantStatus,
    checkSharingGroupPaymentComplete,
    activateSharingGroup,
    removeSharingParticipant
} = require('./database');
const { processPayment, createSubscription, createSharingPaymentIntent } = require('./payment');

// ===== 상수 정의 =====
const AI_SERVICES = {
    'chatgpt-plus': { name: 'ChatGPT Plus', price: 20, maxParticipants: 5, provider: 'OpenAI' },
    'claude-pro': { name: 'Claude Pro', price: 20, maxParticipants: 4, provider: 'Anthropic' },
    'midjourney-pro': { name: 'Midjourney Pro', price: 30, maxParticipants: 6, provider: 'Midjourney' },
    'perplexity-pro': { name: 'Perplexity Pro', price: 20, maxParticipants: 5, provider: 'Perplexity' },
    'gemini-pro': { name: 'Gemini Pro', price: 20, maxParticipants: 4, provider: 'Google' },
    'github-copilot': { name: 'GitHub Copilot', price: 10, maxParticipants: 5, provider: 'GitHub' }
};

const SHARING_STATUS = {
    RECRUITING: 'recruiting',
    ACTIVE: 'active',
    PAUSED: 'paused',
    ENDED: 'ended'
};

const PARTICIPANT_STATUS = {
    PENDING: 'pending',
    ACTIVE: 'active',
    PAYMENT_FAILED: 'payment_failed',
    LEFT: 'left'
};

const FEE_RATE = 0.10; // 10% 수수료

// ===== 쉐어링 그룹 관리 =====

/**
 * 인기 쉐어링 목록 조회
 * GET /api/sharing/popular
 */
router.get('/popular', async (req, res) => {
    try {
        const { page = 1, limit = 12, service, status = 'recruiting' } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                s.*,
                u.username as creator_name,
                u.rating as creator_rating,
                COUNT(sp.id) as participant_count,
                AVG(sr.rating) as avg_rating,
                COUNT(sr.id) as review_count
            FROM sharings s
            LEFT JOIN users u ON s.creator_id = u.id
            LEFT JOIN sharing_participants sp ON s.id = sp.sharing_id AND sp.status = ?
            LEFT JOIN sharing_reviews sr ON s.id = sr.sharing_id
            WHERE s.status = ?
        `;
        
        const params = [PARTICIPANT_STATUS.ACTIVE, status];

        if (service && AI_SERVICES[service]) {
            query += ' AND s.service_type = ?';
            params.push(service);
        }

        query += `
            GROUP BY s.id
            ORDER BY 
                (s.max_participants - COUNT(sp.id)) DESC,
                s.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        params.push(parseInt(limit), offset);

        const sharings = await executeQuery(query, params);

        // 각 쉐어링에 대한 추가 정보 계산
        const enrichedSharings = sharings.map(sharing => {
            const serviceInfo = AI_SERVICES[sharing.service_type] || {};
            const basePrice = sharing.custom_price || serviceInfo.price || 0;
            const individualCost = basePrice / sharing.max_participants;
            const totalCost = individualCost * (1 + FEE_RATE);
            const savingsPercent = Math.round((1 - (1 / sharing.max_participants)) * 100);

            return {
                ...sharing,
                service_info: serviceInfo,
                base_price_usd: basePrice,
                individual_cost_usd: individualCost,
                total_cost_krw: Math.round(totalCost * 1380), // USD to KRW 환율 적용
                savings_percent: savingsPercent,
                spots_remaining: sharing.max_participants - sharing.participant_count,
                is_full: sharing.participant_count >= sharing.max_participants,
                avg_rating: parseFloat(sharing.avg_rating) || 0,
                review_count: parseInt(sharing.review_count) || 0
            };
        });

        // 총 개수 조회
        let countQuery = `
            SELECT COUNT(DISTINCT s.id) as total
            FROM sharings s
            WHERE s.status = ?
        `;
        const countParams = [status];
        
        if (service && AI_SERVICES[service]) {
            countQuery += ' AND s.service_type = ?';
            countParams.push(service);
        }

        const [{ total }] = await executeQuery(countQuery, countParams);

        res.json({
            success: true,
            data: enrichedSharings,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(total),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Popular sharings fetch error:', error);
        res.status(500).json({
            success: false,
            message: '인기 쉐어링 목록을 불러오는데 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 새 쉐어링 그룹 생성
 * POST /api/sharing/create
 */
router.post('/create', authenticateToken, validateInput([
    'service_type',
    'title',
    'max_participants'
]), async (req, res) => {
    const connection = await getConnection();
    
    try {
        await connection.beginTransaction();
        
        const {
            service_type,
            title,
            description = '',
            max_participants,
            custom_service_name,
            custom_price,
            custom_logo,
            custom_website
        } = req.body;

        const userId = req.user.id;

        // 서비스 유효성 검증
        let serviceInfo = AI_SERVICES[service_type];
        if (!serviceInfo && service_type !== 'other') {
            return res.status(400).json({
                success: false,
                message: '지원하지 않는 AI 서비스입니다.'
            });
        }

        // 커스텀 서비스 처리
        if (service_type === 'other') {
            if (!custom_service_name || !custom_price) {
                return res.status(400).json({
                    success: false,
                    message: '커스텀 서비스는 이름과 가격이 필요합니다.'
                });
            }
            serviceInfo = {
                name: custom_service_name,
                price: parseFloat(custom_price),
                maxParticipants: parseInt(max_participants),
                provider: 'Custom'
            };
        }

        // 참여자 수 유효성 검증
        if (max_participants < 2 || max_participants > 10) {
            return res.status(400).json({
                success: false,
                message: '참여자 수는 2명 이상 10명 이하여야 합니다.'
            });
        }

        // 사용자가 이미 같은 서비스의 활성 쉐어링을 개설했는지 확인
        const existingSharing = await executeQuery(
            `SELECT id FROM sharings 
             WHERE creator_id = ? AND service_type = ? AND status IN (?, ?)`,
            [userId, service_type, SHARING_STATUS.RECRUITING, SHARING_STATUS.ACTIVE]
        );

        if (existingSharing.length > 0) {
            return res.status(400).json({
                success: false,
                message: '이미 같은 서비스의 활성 쉐어링을 개설하셨습니다.'
            });
        }

        // 쉐어링 그룹 생성
        const sharingId = uuidv4();
        const insertQuery = `
            INSERT INTO sharings (
                id, creator_id, service_type, title, description,
                max_participants, custom_service_name, custom_price,
                custom_logo, custom_website, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        await executeQuery(insertQuery, [
            sharingId,
            userId,
            service_type,
            title,
            description,
            max_participants,
            custom_service_name,
            custom_price,
            custom_logo,
            custom_website,
            SHARING_STATUS.RECRUITING
        ], connection);

        // 개설자를 첫 번째 참여자로 추가
        await executeQuery(
            `INSERT INTO sharing_participants (
                id, sharing_id, user_id, status, joined_at
            ) VALUES (?, ?, ?, ?, NOW())`,
            [uuidv4(), sharingId, userId, PARTICIPANT_STATUS.ACTIVE],
            connection
        );

        await connection.commit();

        // 생성된 쉐어링 정보 반환
        const newSharing = await executeQuery(
            `SELECT s.*, u.username as creator_name
             FROM sharings s
             LEFT JOIN users u ON s.creator_id = u.id
             WHERE s.id = ?`,
            [sharingId]
        );

        res.status(201).json({
            success: true,
            message: '쉐어링이 성공적으로 생성되었습니다.',
            data: {
                ...newSharing[0],
                service_info: serviceInfo
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Sharing creation error:', error);
        res.status(500).json({
            success: false,
            message: '쉐어링 생성에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

/**
 * 결제 완료 후 쉐어링 참여 확정 처리
 * POST /api/sharing/:id/confirm-payment
 */
router.post('/:id/confirm-payment', authenticateToken, async (req, res) => {
    const connection = await getConnection();
    
    try {
        await connection.beginTransaction();
        
        const sharingId = req.params.id;
        const userId = req.user.id;
        const { payment_intent_id } = req.body;

        // Stripe에서 결제 상태 확인
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({
                success: false,
                message: '결제가 완료되지 않았습니다.'
            });
        }

        // 참여자 상태를 ACTIVE로 변경
        await executeQuery(
            `UPDATE sharing_participants 
             SET status = ?, payment_completed_at = NOW() 
             WHERE sharing_id = ? AND user_id = ? AND payment_intent_id = ?`,
            [PARTICIPANT_STATUS.ACTIVE, sharingId, userId, payment_intent_id],
            connection
        );

        // 결제 로그 업데이트
        await executeQuery(
            `UPDATE payment_logs 
             SET status = 'succeeded', completed_at = NOW() 
             WHERE stripe_payment_intent_id = ?`,
            [payment_intent_id],
            connection
        );

        // 현재 활성 참여자 수 확인
        const [{ active_count }] = await executeQuery(
            `SELECT COUNT(*) as active_count 
             FROM sharing_participants 
             WHERE sharing_id = ? AND status = ?`,
            [sharingId, PARTICIPANT_STATUS.ACTIVE]
        );

        // 쉐어링 정보 조회
        const [sharingInfo] = await executeQuery(
            `SELECT * FROM sharings WHERE id = ?`,
            [sharingId]
        );

        // 정원이 찬 경우 상태 변경
        if (active_count >= sharingInfo.max_participants) {
            await executeQuery(
                `UPDATE sharings SET status = ?, started_at = NOW() WHERE id = ?`,
                [SHARING_STATUS.ACTIVE, sharingId],
                connection
            );

            // 구독 설정
            await createSubscription({
                sharing_id: sharingId,
                service_type: sharingInfo.service_type,
                participants: await executeQuery(
                    `SELECT user_id, monthly_cost FROM sharing_participants 
                     WHERE sharing_id = ? AND status = ?`,
                    [sharingId, PARTICIPANT_STATUS.ACTIVE]
                )
            });
        }

        await connection.commit();

        // 개설자에게 알림
        await sendNotification(sharingInfo.creator_id, {
            type: 'sharing_join_confirmed',
            title: '새로운 참여자 결제 완료!',
            message: `쉐어링에 새로운 참여자의 결제가 완료되었습니다.`,
            data: { sharing_id: sharingId }
        });

        res.json({
            success: true,
            message: '쉐어링 참여가 완료되었습니다!',
            data: {
                sharing_status: active_count >= sharingInfo.max_participants ? 'active' : 'recruiting',
                participant_count: active_count
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Payment confirmation error:', error);
        res.status(500).json({
            success: false,
            message: '결제 확인 처리에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

/**
 * 쉐어링 참여 신청
 * POST /api/sharing/:id/join
 */
router.post('/:id/join', authenticateToken, validateInput([
    'nickname',
    'email'
]), async (req, res) => {
    const connection = await getConnection();
    
    try {
        await connection.beginTransaction();
        
        const sharingId = req.params.id;
        const userId = req.user.id;
        const { nickname, email, payment_method } = req.body;

        // 쉐어링 정보 조회
        const sharing = await executeQuery(
            `SELECT s.*, COUNT(sp.id) as participant_count
             FROM sharings s
             LEFT JOIN sharing_participants sp ON s.id = sp.sharing_id AND sp.status = ?
             WHERE s.id = ? AND s.status = ?
             GROUP BY s.id`,
            [PARTICIPANT_STATUS.ACTIVE, sharingId, SHARING_STATUS.RECRUITING]
        );

        if (sharing.length === 0) {
            return res.status(404).json({
                success: false,
                message: '해당 쉐어링을 찾을 수 없거나 모집이 종료되었습니다.'
            });
        }

        const sharingInfo = sharing[0];

        // 이미 참여 중인지 확인
        const existingParticipant = await executeQuery(
            `SELECT id FROM sharing_participants 
             WHERE sharing_id = ? AND user_id = ? AND status IN (?, ?)`,
            [sharingId, userId, PARTICIPANT_STATUS.PENDING, PARTICIPANT_STATUS.ACTIVE]
        );

        if (existingParticipant.length > 0) {
            return res.status(400).json({
                success: false,
                message: '이미 참여 중이거나 신청한 쉐어링입니다.'
            });
        }

        // 정원 확인
        if (sharingInfo.participant_count >= sharingInfo.max_participants) {
            return res.status(400).json({
                success: false,
                message: '이미 정원이 찼습니다.'
            });
        }

        // 결제 금액 계산
        const serviceInfo = AI_SERVICES[sharingInfo.service_type] || {};
        const basePrice = sharingInfo.custom_price || serviceInfo.price || 0;
        const individualCost = basePrice / sharingInfo.max_participants;
        const fee = individualCost * FEE_RATE;
        const totalCost = individualCost + fee;
        const totalCostKRW = Math.round(totalCost * 1380);

        // Stripe Payment Intent 생성
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        
        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: totalCostKRW,
                currency: 'krw',
                description: `${sharingInfo.title} 쉐어링 참여`,
                metadata: {
                    sharing_id: sharingId,
                    user_id: userId.toString(),
                    type: 'sharing_subscription',
                    service_type: sharingInfo.service_type
                },
                automatic_payment_methods: {
                    enabled: true
                }
            });

            // 결제 인텐트가 성공적으로 생성되었다면 일단 처리 중 상태로 기록
            const paymentResult = {
                success: true,
                payment_id: paymentIntent.id,
                client_secret: paymentIntent.client_secret,
                status: paymentIntent.status
            };

        } catch (stripeError) {
            console.error('Stripe Payment Intent 생성 오류:', stripeError);
            return res.status(400).json({
                success: false,
                message: '결제 인텐트 생성에 실패했습니다.',
                error: stripeError.message
            });
        }

        // 참여자 추가 (결제 인텐트 생성 시점에는 pending 상태로)
        const participantId = uuidv4();
        await executeQuery(
            `INSERT INTO sharing_participants (
                id, sharing_id, user_id, nickname, email, status,
                monthly_cost, joined_at, payment_intent_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [
                participantId,
                sharingId,
                userId,
                nickname,
                email,
                PARTICIPANT_STATUS.PENDING, // 결제 완료 전까지는 pending
                totalCostKRW,
                paymentIntent.id
            ],
            connection
        );

        // 결제 로그 저장
        await executeQuery(
            `INSERT INTO payment_logs (
                id, user_id, sharing_id, stripe_payment_intent_id, 
                amount, currency, description, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                uuidv4(),
                userId,
                sharingId,
                paymentIntent.id,
                totalCostKRW,
                'krw',
                `${sharingInfo.title} 쉐어링 참여`,
                'requires_payment_method'
            ],
            connection
        );

        await connection.commit();

        // 클라이언트에 결제 인텐트 정보 반환 (프론트엔드에서 결제 진행)
        res.json({
            success: true,
            message: '결제를 진행해주세요.',
            data: {
                participant_id: participantId,
                payment_intent: {
                    id: paymentIntent.id,
                    client_secret: paymentIntent.client_secret,
                    amount: totalCostKRW
                },
                monthly_cost: totalCostKRW,
                sharing_id: sharingId
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Sharing join error:', error);
        res.status(500).json({
            success: false,
            message: '쉐어링 참여에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

/**
 * 내 쉐어링 목록 조회 (개설한 것)
 * GET /api/sharing/my
 */
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        let query = `
            SELECT 
                s.*,
                COUNT(sp.id) as participant_count,
                SUM(sp.monthly_cost) as total_revenue,
                AVG(sr.rating) as avg_rating,
                COUNT(sr.id) as review_count
            FROM sharings s
            LEFT JOIN sharing_participants sp ON s.id = sp.sharing_id AND sp.status = ?
            LEFT JOIN sharing_reviews sr ON s.id = sr.sharing_id
            WHERE s.creator_id = ?
        `;
        
        const params = [PARTICIPANT_STATUS.ACTIVE, userId];

        if (status) {
            query += ' AND s.status = ?';
            params.push(status);
        }

        query += `
            GROUP BY s.id
            ORDER BY s.created_at DESC
        `;

        const sharings = await executeQuery(query, params);

        const enrichedSharings = sharings.map(sharing => {
            const serviceInfo = AI_SERVICES[sharing.service_type] || {};
            return {
                ...sharing,
                service_info: serviceInfo,
                spots_remaining: sharing.max_participants - sharing.participant_count,
                is_full: sharing.participant_count >= sharing.max_participants,
                monthly_revenue: parseInt(sharing.total_revenue) || 0,
                avg_rating: parseFloat(sharing.avg_rating) || 0,
                review_count: parseInt(sharing.review_count) || 0
            };
        });

        res.json({
            success: true,
            data: enrichedSharings
        });

    } catch (error) {
        console.error('My sharings fetch error:', error);
        res.status(500).json({
            success: false,
            message: '내 쉐어링 목록을 불러오는데 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 참여 중인 쉐어링 목록 조회
 * GET /api/sharing/joined
 */
router.get('/joined', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT 
                s.*,
                sp.nickname,
                sp.monthly_cost,
                sp.joined_at,
                sp.status as participant_status,
                u.username as creator_name,
                u.rating as creator_rating,
                COUNT(sp2.id) as participant_count
            FROM sharing_participants sp
            JOIN sharings s ON sp.sharing_id = s.id
            LEFT JOIN users u ON s.creator_id = u.id
            LEFT JOIN sharing_participants sp2 ON s.id = sp2.sharing_id AND sp2.status = ?
            WHERE sp.user_id = ? AND sp.status IN (?, ?)
            GROUP BY s.id, sp.id
            ORDER BY sp.joined_at DESC
        `;

        const sharings = await executeQuery(query, [
            PARTICIPANT_STATUS.ACTIVE,
            userId,
            PARTICIPANT_STATUS.ACTIVE,
            PARTICIPANT_STATUS.PENDING
        ]);

        const enrichedSharings = sharings.map(sharing => {
            const serviceInfo = AI_SERVICES[sharing.service_type] || {};
            const totalSaved = calculateSavings(serviceInfo.price || sharing.custom_price, sharing.monthly_cost);
            
            return {
                ...sharing,
                service_info: serviceInfo,
                total_saved: totalSaved,
                is_active: sharing.participant_status === PARTICIPANT_STATUS.ACTIVE
            };
        });

        res.json({
            success: true,
            data: enrichedSharings
        });

    } catch (error) {
        console.error('Joined sharings fetch error:', error);
        res.status(500).json({
            success: false,
            message: '참여 중인 쉐어링 목록을 불러오는데 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 쉐어링 탈퇴
 * POST /api/sharing/:id/leave
 */
router.post('/:id/leave', authenticateToken, async (req, res) => {
    const connection = await getConnection();
    
    try {
        await connection.beginTransaction();
        
        const sharingId = req.params.id;
        const userId = req.user.id;

        // 참여자 정보 확인
        const participant = await executeQuery(
            `SELECT sp.*, s.creator_id, s.status as sharing_status, s.title
             FROM sharing_participants sp
             JOIN sharings s ON sp.sharing_id = s.id
             WHERE sp.sharing_id = ? AND sp.user_id = ? AND sp.status = ?`,
            [sharingId, userId, PARTICIPANT_STATUS.ACTIVE]
        );

        if (participant.length === 0) {
            return res.status(404).json({
                success: false,
                message: '참여 중인 쉐어링을 찾을 수 없습니다.'
            });
        }

        const participantInfo = participant[0];

        // 개설자인 경우 특별 처리
        if (participantInfo.creator_id === userId) {
            return res.status(400).json({
                success: false,
                message: '개설자는 탈퇴할 수 없습니다. 쉐어링을 종료해주세요.'
            });
        }

        // 활성 쉐어링에서 탈퇴하는 경우 환불 처리
        if (participantInfo.sharing_status === SHARING_STATUS.ACTIVE) {
            const refundAmount = calculateProRatedRefund(participantInfo.monthly_cost);
            if (refundAmount > 0) {
                await processRefund({
                    user_id: userId,
                    amount: refundAmount,
                    reason: '쉐어링 탈퇴',
                    sharing_id: sharingId
                });
            }
        }

        // 참여자 상태 변경
        await executeQuery(
            `UPDATE sharing_participants 
             SET status = ?, left_at = NOW() 
             WHERE sharing_id = ? AND user_id = ?`,
            [PARTICIPANT_STATUS.LEFT, sharingId, userId],
            connection
        );

        // 참여자 수 재계산
        const [{ active_count }] = await executeQuery(
            `SELECT COUNT(*) as active_count 
             FROM sharing_participants 
             WHERE sharing_id = ? AND status = ?`,
            [sharingId, PARTICIPANT_STATUS.ACTIVE]
        );

        // 참여자가 너무 적어진 경우 모집 상태로 변경
        if (active_count < 2) {
            await executeQuery(
                `UPDATE sharings 
                 SET status = ?, started_at = NULL 
                 WHERE id = ?`,
                [SHARING_STATUS.RECRUITING, sharingId],
                connection
            );
        }

        await connection.commit();

        // 개설자에게 알림
        await sendNotification(participantInfo.creator_id, {
            type: 'sharing_leave',
            title: '참여자가 탈퇴했습니다',
            message: `"${participantInfo.title}" 쉐어링에서 참여자가 탈퇴했습니다.`,
            data: { sharing_id: sharingId }
        });

        res.json({
            success: true,
            message: '쉐어링에서 탈퇴했습니다.',
            data: {
                refund_processed: participantInfo.sharing_status === SHARING_STATUS.ACTIVE,
                remaining_participants: active_count
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Sharing leave error:', error);
        res.status(500).json({
            success: false,
            message: '쉐어링 탈퇴에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

// ===== 통계 및 분석 =====

/**
 * 쉐어링 통계 조회
 * GET /api/sharing/stats
 */
router.get('/stats', async (req, res) => {
    try {
        // 전체 통계
        const globalStats = await executeQuery(`
            SELECT 
                COUNT(DISTINCT s.id) as total_sharings,
                COUNT(DISTINCT sp.user_id) as total_participants,
                AVG(100 - (100 / s.max_participants)) as avg_savings_percent,
                SUM(sp.monthly_cost) as total_savings_krw
            FROM sharings s
            LEFT JOIN sharing_participants sp ON s.id = sp.sharing_id AND sp.status = ?
            WHERE s.status IN (?, ?)
        `, [PARTICIPANT_STATUS.ACTIVE, SHARING_STATUS.RECRUITING, SHARING_STATUS.ACTIVE]);

        // 서비스별 통계
        const serviceStats = await executeQuery(`
            SELECT 
                s.service_type,
                COUNT(DISTINCT s.id) as sharing_count,
                COUNT(sp.id) as participant_count,
                AVG(sp.monthly_cost) as avg_monthly_cost
            FROM sharings s
            LEFT JOIN sharing_participants sp ON s.id = sp.sharing_id AND sp.status = ?
            WHERE s.status IN (?, ?)
            GROUP BY s.service_type
            ORDER BY sharing_count DESC
        `, [PARTICIPANT_STATUS.ACTIVE, SHARING_STATUS.RECRUITING, SHARING_STATUS.ACTIVE]);

        res.json({
            success: true,
            data: {
                global: globalStats[0],
                by_service: serviceStats.map(stat => ({
                    ...stat,
                    service_info: AI_SERVICES[stat.service_type] || {}
                }))
            }
        });

    } catch (error) {
        console.error('Sharing stats fetch error:', error);
        res.status(500).json({
            success: false,
            message: '통계 조회에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 사용자별 쉐어링 통계
 * GET /api/sharing/stats/user
 */
router.get('/stats/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 사용자 쉐어링 통계
        const userStats = await executeQuery(`
            SELECT 
                COUNT(DISTINCT CASE WHEN s.creator_id = ? THEN s.id END) as created_sharings,
                COUNT(DISTINCT CASE WHEN sp.user_id = ? AND sp.status = ? THEN sp.sharing_id END) as joined_sharings,
                SUM(CASE WHEN sp.user_id = ? AND sp.status = ? THEN sp.monthly_cost ELSE 0 END) as monthly_spending,
                SUM(CASE WHEN s.creator_id = ? THEN sp.monthly_cost ELSE 0 END) as monthly_revenue
            FROM sharings s
            LEFT JOIN sharing_participants sp ON s.id = sp.sharing_id
            WHERE (s.creator_id = ? OR sp.user_id = ?)
        `, [userId, userId, PARTICIPANT_STATUS.ACTIVE, userId, PARTICIPANT_STATUS.ACTIVE, userId, userId, userId]);

        // 절약 금액 계산
        const savingsData = await executeQuery(`
            SELECT 
                sp.monthly_cost,
                s.service_type,
                s.custom_price,
                s.max_participants
            FROM sharing_participants sp
            JOIN sharings s ON sp.sharing_id = s.id
            WHERE sp.user_id = ? AND sp.status = ?
        `, [userId, PARTICIPANT_STATUS.ACTIVE]);

        let totalSavings = 0;
        savingsData.forEach(item => {
            const serviceInfo = AI_SERVICES[item.service_type] || {};
            const fullPrice = (item.custom_price || serviceInfo.price || 0) * 1380; // USD to KRW
            const savedAmount = fullPrice - item.monthly_cost;
            totalSavings += savedAmount;
        });

        res.json({
            success: true,
            data: {
                ...userStats[0],
                total_savings_krw: totalSavings,
                monthly_spending: parseInt(userStats[0].monthly_spending) || 0,
                monthly_revenue: parseInt(userStats[0].monthly_revenue) || 0
            }
        });

    } catch (error) {
        console.error('User sharing stats fetch error:', error);
        res.status(500).json({
            success: false,
            message: '사용자 통계 조회에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ===== 유틸리티 함수 =====

/**
 * 절약 금액 계산
 */
function calculateSavings(originalPrice, currentCost) {
    const originalPriceKRW = originalPrice * 1380; // USD to KRW
    return Math.max(0, originalPriceKRW - currentCost);
}

/**
 * 일할계산 환불 금액 계산
 */
function calculateProRatedRefund(monthlyAmount) {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysPassed = today.getDate();
    const remainingDays = daysInMonth - daysPassed;
    
    return Math.round((monthlyAmount / daysInMonth) * remainingDays);
}

/**
 * 알림 발송 (실제 구현은 별도 알림 시스템 필요)
 */
async function sendNotification(userId, notification) {
    try {
        // 여기서는 데이터베이스에 알림 저장만 수행
        await executeQuery(
            `INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
                uuidv4(),
                userId,
                notification.type,
                notification.title,
                notification.message,
                JSON.stringify(notification.data || {})
            ]
        );
    } catch (error) {
        console.error('Notification send error:', error);
    }
}

/**
 * 환불 처리 (실제 결제 시스템과 연동 필요)
 */
async function processRefund({ user_id, amount, reason, sharing_id }) {
    try {
        // 실제 환불 로직 구현 필요
        console.log(`Processing refund: ${amount}KRW for user ${user_id}, reason: ${reason}`);
        
        // 환불 기록 저장
        await executeQuery(
            `INSERT INTO refunds (id, user_id, amount, reason, sharing_id, status, processed_at)
             VALUES (?, ?, ?, ?, ?, 'completed', NOW())`,
            [uuidv4(), user_id, amount, reason, sharing_id]
        );
        
        return { success: true };
    } catch (error) {
        console.error('Refund processing error:', error);
        return { success: false, error: error.message };
    }
}

// ===== 관리자 기능 =====

/**
 * 쉐어링 관리 (관리자용)
 * PUT /api/sharing/:id/admin
 */
router.put('/:id/admin', authenticateToken, async (req, res) => {
    try {
        // 관리자 권한 확인
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 필요합니다.'
            });
        }

        const sharingId = req.params.id;
        const { status, reason } = req.body;

        await executeQuery(
            `UPDATE sharings 
             SET status = ?, admin_note = ?, updated_at = NOW()
             WHERE id = ?`,
            [status, reason, sharingId]
        );

        res.json({
            success: true,
            message: '쉐어링 상태가 변경되었습니다.'
        });

    } catch (error) {
        console.error('Admin sharing update error:', error);
        res.status(500).json({
            success: false,
            message: '쉐어링 관리 작업에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 정기 작업: 만료된 쉐어링 정리
 */
async function cleanupExpiredSharings() {
    try {
        // 30일 이상 비활성 상태인 모집 중 쉐어링 정리
        await executeQuery(`
            UPDATE sharings 
            SET status = ? 
            WHERE status = ? 
              AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
              AND id NOT IN (
                  SELECT sharing_id 
                  FROM sharing_participants 
                  WHERE status = ? 
                  GROUP BY sharing_id 
                  HAVING COUNT(*) > 1
              )
        `, [SHARING_STATUS.ENDED, SHARING_STATUS.RECRUITING, PARTICIPANT_STATUS.ACTIVE]);

        console.log('Expired sharings cleanup completed');
    } catch (error) {
        console.error('Cleanup expired sharings error:', error);
    }
}

// 정기 작업 스케줄 (1일마다 실행)
setInterval(cleanupExpiredSharings, 24 * 60 * 60 * 1000);

module.exports = router;