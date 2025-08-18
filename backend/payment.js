/**
 * One AI - Payment Service (Stripe 기반)
 * 결제 처리, 구독 관리, 환불 등 결제 관련 모든 기능을 담당
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticateToken } = require('./middleware');
const { sendEmail } = require('./storage');
const router = express.Router();

// Webhook용 raw body parser
const webhookParser = express.raw({ type: 'application/json' });

/**
 * 결제 인텐트 생성 (일회성 결제)
 * POST /api/payment/create-intent
 */
router.post('/create-intent', authenticateToken, async (req, res) => {
    try {
        const { amount, currency = 'krw', description, metadata = {} } = req.body;
        const userId = req.user.id;

        // 최소 결제 금액 검증 (1000원)
        if (amount < 1000) {
            return res.status(400).json({
                success: false,
                error: '최소 결제 금액은 1,000원입니다.'
            });
        }

        // 결제 인텐트 생성
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            description: description,
            metadata: {
                userId: userId.toString(),
                ...metadata
            },
            automatic_payment_methods: {
                enabled: true
            }
        });

        // 결제 로그 저장
        await savePaymentLog({
            userId,
            type: 'payment_intent_created',
            stripeId: paymentIntent.id,
            amount,
            currency,
            description,
            metadata,
            status: 'pending'
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('결제 인텐트 생성 오류:', error);
        res.status(500).json({
            success: false,
            error: '결제 인텐트 생성에 실패했습니다.'
        });
    }
});

/**
 * 구독 생성 (AI 쉐어링용)
 * POST /api/payment/create-subscription
 */
router.post('/create-subscription', authenticateToken, async (req, res) => {
    try {
        const { priceId, sharingId, paymentMethodId } = req.body;
        const userId = req.user.id;
        const userEmail = req.user.email;

        // Stripe 고객 조회 또는 생성
        const customer = await findOrCreateCustomer(userId, userEmail);

        // 결제 방법 고객에게 연결
        if (paymentMethodId) {
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: customer.id
            });

            // 기본 결제 방법으로 설정
            await stripe.customers.update(customer.id, {
                invoice_settings: {
                    default_payment_method: paymentMethodId
                }
            });
        }

        // 구독 생성
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId }],
            default_payment_method: paymentMethodId,
            expand: ['latest_invoice.payment_intent'],
            metadata: {
                userId: userId.toString(),
                sharingId: sharingId || '',
                type: 'ai_sharing'
            }
        });

        // 구독 정보 DB 저장
        await saveSubscription({
            userId,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customer.id,
            priceId,
            sharingId,
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        });

        // 구독 로그 저장
        await savePaymentLog({
            userId,
            type: 'subscription_created',
            stripeId: subscription.id,
            amount: subscription.items.data[0].price.unit_amount,
            currency: subscription.items.data[0].price.currency,
            description: `AI 쉐어링 구독 - ${sharingId}`,
            metadata: { sharingId },
            status: subscription.status
        });

        res.json({
            success: true,
            subscription: {
                id: subscription.id,
                status: subscription.status,
                clientSecret: subscription.latest_invoice?.payment_intent?.client_secret
            }
        });

    } catch (error) {
        console.error('구독 생성 오류:', error);
        res.status(500).json({
            success: false,
            error: '구독 생성에 실패했습니다.'
        });
    }
});

/**
 * 구독 취소
 * POST /api/payment/cancel-subscription
 */
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
    try {
        const { subscriptionId, cancelAtPeriodEnd = true } = req.body;
        const userId = req.user.id;

        // 구독 소유권 확인
        const subscription = await getSubscriptionByUser(userId, subscriptionId);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: '구독을 찾을 수 없습니다.'
            });
        }

        // Stripe에서 구독 취소
        const canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: cancelAtPeriodEnd
        });

        // DB 상태 업데이트
        await updateSubscriptionStatus(subscriptionId, {
            status: canceledSubscription.status,
            cancelAtPeriodEnd: cancelAtPeriodEnd,
            canceledAt: cancelAtPeriodEnd ? null : new Date()
        });

        // 취소 로그 저장
        await savePaymentLog({
            userId,
            type: 'subscription_canceled',
            stripeId: subscriptionId,
            description: `구독 취소 - ${cancelAtPeriodEnd ? '기간 말' : '즉시'}`,
            status: 'canceled'
        });

        // 이메일 알림
        await sendCancellationEmail(req.user.email, subscription, cancelAtPeriodEnd);

        res.json({
            success: true,
            message: cancelAtPeriodEnd ? 
                '구독이 현재 결제 기간 종료 시 취소됩니다.' : 
                '구독이 즉시 취소되었습니다.'
        });

    } catch (error) {
        console.error('구독 취소 오류:', error);
        res.status(500).json({
            success: false,
            error: '구독 취소에 실패했습니다.'
        });
    }
});

/**
 * 환불 처리
 * POST /api/payment/refund
 */
router.post('/refund', authenticateToken, async (req, res) => {
    try {
        const { paymentIntentId, amount, reason = 'requested_by_customer' } = req.body;
        const userId = req.user.id;

        // 관리자 권한 확인 (일반 사용자는 환불 요청만 가능)
        if (!req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                error: '환불은 고객센터를 통해 요청해주세요.'
            });
        }

        // 결제 정보 확인
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (!paymentIntent || paymentIntent.status !== 'succeeded') {
            return res.status(400).json({
                success: false,
                error: '환불 가능한 결제를 찾을 수 없습니다.'
            });
        }

        // 환불 처리
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount, // undefined면 전액 환불
            reason: reason,
            metadata: {
                processedBy: userId.toString(),
                originalUserId: paymentIntent.metadata.userId
            }
        });

        // 환불 로그 저장
        await savePaymentLog({
            userId: paymentIntent.metadata.userId,
            type: 'refund_processed',
            stripeId: refund.id,
            amount: refund.amount,
            currency: refund.currency,
            description: `환불 처리 - ${paymentIntentId}`,
            metadata: { originalPaymentIntent: paymentIntentId, reason },
            status: refund.status
        });

        // 환불 완료 이메일 발송
        const originalUser = await getUserById(paymentIntent.metadata.userId);
        if (originalUser) {
            await sendRefundEmail(originalUser.email, refund, paymentIntent);
        }

        res.json({
            success: true,
            refund: {
                id: refund.id,
                amount: refund.amount,
                status: refund.status
            }
        });

    } catch (error) {
        console.error('환불 처리 오류:', error);
        res.status(500).json({
            success: false,
            error: '환불 처리에 실패했습니다.'
        });
    }
});

/**
 * 결제 내역 조회
 * GET /api/payment/history
 */
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const userId = req.user.id;

        const payments = await getPaymentHistory(userId, {
            page: parseInt(page),
            limit: parseInt(limit),
            type
        });

        res.json({
            success: true,
            payments: payments.data,
            pagination: {
                page: payments.page,
                limit: payments.limit,
                total: payments.total,
                totalPages: Math.ceil(payments.total / payments.limit)
            }
        });

    } catch (error) {
        console.error('결제 내역 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '결제 내역 조회에 실패했습니다.'
        });
    }
});

/**
 * 구독 목록 조회
 * GET /api/payment/subscriptions
 */
router.get('/subscriptions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const subscriptions = await getUserSubscriptions(userId);

        res.json({
            success: true,
            subscriptions: subscriptions.map(sub => ({
                id: sub.stripeSubscriptionId,
                status: sub.status,
                priceId: sub.priceId,
                sharingId: sub.sharingId,
                currentPeriodStart: sub.currentPeriodStart,
                currentPeriodEnd: sub.currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                amount: sub.amount,
                currency: sub.currency
            }))
        });

    } catch (error) {
        console.error('구독 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '구독 목록 조회에 실패했습니다.'
        });
    }
});

/**
 * 고객 결제 방법 관리
 * GET /api/payment/payment-methods
 */
router.get('/payment-methods', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const customer = await findCustomerByUserId(userId);

        if (!customer) {
            return res.json({
                success: true,
                paymentMethods: []
            });
        }

        const paymentMethods = await stripe.paymentMethods.list({
            customer: customer.stripeCustomerId,
            type: 'card'
        });

        res.json({
            success: true,
            paymentMethods: paymentMethods.data.map(pm => ({
                id: pm.id,
                type: pm.type,
                card: pm.card ? {
                    brand: pm.card.brand,
                    last4: pm.card.last4,
                    expMonth: pm.card.exp_month,
                    expYear: pm.card.exp_year
                } : null
            }))
        });

    } catch (error) {
        console.error('결제 방법 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '결제 방법 조회에 실패했습니다.'
        });
    }
});

/**
 * 결제 방법 삭제
 * DELETE /api/payment/payment-methods/:paymentMethodId
 */
router.delete('/payment-methods/:paymentMethodId', authenticateToken, async (req, res) => {
    try {
        const { paymentMethodId } = req.params;
        const userId = req.user.id;

        // 결제 방법 소유권 확인
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        const customer = await findCustomerByUserId(userId);

        if (!customer || paymentMethod.customer !== customer.stripeCustomerId) {
            return res.status(403).json({
                success: false,
                error: '권한이 없습니다.'
            });
        }

        // 결제 방법 분리
        await stripe.paymentMethods.detach(paymentMethodId);

        res.json({
            success: true,
            message: '결제 방법이 삭제되었습니다.'
        });

    } catch (error) {
        console.error('결제 방법 삭제 오류:', error);
        res.status(500).json({
            success: false,
            error: '결제 방법 삭제에 실패했습니다.'
        });
    }
});

/**
 * Stripe 웹훅 처리
 * POST /api/payment/webhook
 */
router.post('/webhook', webhookParser, async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('웹훅 서명 검증 실패:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        await handleWebhookEvent(event);
        res.json({ received: true });
    } catch (error) {
        console.error('웹훅 처리 오류:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

/**
 * 웹훅 이벤트 처리
 */
async function handleWebhookEvent(event) {
    switch (event.type) {
        case 'payment_intent.succeeded':
            await handlePaymentSuccess(event.data.object);
            break;

        case 'payment_intent.payment_failed':
            await handlePaymentFailed(event.data.object);
            break;

        case 'invoice.payment_succeeded':
            await handleInvoicePaymentSuccess(event.data.object);
            break;

        case 'invoice.payment_failed':
            await handleInvoicePaymentFailed(event.data.object);
            break;

        case 'customer.subscription.updated':
            await handleSubscriptionUpdated(event.data.object);
            break;

        case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(event.data.object);
            break;

        default:
            console.log(`처리되지 않은 이벤트 타입: ${event.type}`);
    }
}

/**
 * 결제 성공 처리
 */
async function handlePaymentSuccess(paymentIntent) {
    const userId = paymentIntent.metadata.userId;
    const sharingId = paymentIntent.metadata.sharingId;
    
    // 결제 로그 업데이트
    await updatePaymentLog(paymentIntent.id, {
        status: 'succeeded',
        completedAt: new Date()
    });

    // 쉐어링 그룹 참여자 상태 업데이트
    if (sharingId) {
        await updateSharingParticipantStatus(sharingId, userId, 'paid');
        
        // 쉐어링 그룹의 모든 참여자가 결제했는지 확인
        const isGroupComplete = await checkSharingGroupPaymentComplete(sharingId);
        if (isGroupComplete) {
            await activateSharingGroup(sharingId);
        }
    }

    // 사용자 알림
    const user = await getUserById(userId);
    if (user) {
        await sendPaymentSuccessEmail(user.email, paymentIntent);
    }

    console.log(`결제 성공: ${paymentIntent.id} (사용자: ${userId})`);
}

/**
 * 결제 실패 처리
 */
async function handlePaymentFailed(paymentIntent) {
    const userId = paymentIntent.metadata.userId;
    
    // 결제 로그 업데이트
    await updatePaymentLog(paymentIntent.id, {
        status: 'failed',
        failureReason: paymentIntent.last_payment_error?.message
    });

    // 사용자 알림
    const user = await getUserById(userId);
    if (user) {
        await sendPaymentFailedEmail(user.email, paymentIntent);
    }

    console.log(`결제 실패: ${paymentIntent.id} (사용자: ${userId})`);
}

/**
 * 구독 결제 성공 처리
 */
async function handleInvoicePaymentSuccess(invoice) {
    const subscriptionId = invoice.subscription;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata.userId;

    // 구독 상태 업데이트
    await updateSubscriptionStatus(subscriptionId, {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    });

    // 쉐어링 그룹 상태 업데이트
    if (subscription.metadata.sharingId) {
        await updateSharingPaymentStatus(subscription.metadata.sharingId, userId, 'paid');
    }

    console.log(`구독 결제 성공: ${subscriptionId} (사용자: ${userId})`);
}

/**
 * 구독 결제 실패 처리
 */
async function handleInvoicePaymentFailed(invoice) {
    const subscriptionId = invoice.subscription;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata.userId;

    // 쉐어링 그룹 상태 업데이트
    if (subscription.metadata.sharingId) {
        await updateSharingPaymentStatus(subscription.metadata.sharingId, userId, 'failed');
    }

    // 사용자 알림
    const user = await getUserById(userId);
    if (user) {
        await sendSubscriptionPaymentFailedEmail(user.email, subscription, invoice);
    }

    console.log(`구독 결제 실패: ${subscriptionId} (사용자: ${userId})`);
}

/**
 * 구독 업데이트 처리
 */
async function handleSubscriptionUpdated(subscription) {
    const userId = subscription.metadata.userId;
    const subscriptionId = subscription.id;

    try {
        // 구독 상태 업데이트
        await updateSubscriptionStatus(subscriptionId, {
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end
        });

        // 상태에 따른 처리
        switch (subscription.status) {
            case 'active':
                // 구독 활성화 - 쉐어링 그룹 접근 권한 부여
                if (subscription.metadata.sharingId) {
                    await updateSharingParticipantStatus(subscription.metadata.sharingId, userId, 'active');
                }
                break;

            case 'past_due':
                // 연체 상태 - 접근 제한
                if (subscription.metadata.sharingId) {
                    await updateSharingParticipantStatus(subscription.metadata.sharingId, userId, 'past_due');
                }
                break;

            case 'canceled':
                // 구독 취소 - 접근 권한 제거
                if (subscription.metadata.sharingId) {
                    await updateSharingParticipantStatus(subscription.metadata.sharingId, userId, 'canceled');
                }
                break;
        }

        // 구독 로그 저장
        await savePaymentLog({
            userId,
            type: 'subscription_updated',
            stripeId: subscriptionId,
            description: `구독 상태 변경: ${subscription.status}`,
            status: subscription.status
        });

        console.log(`구독 업데이트: ${subscriptionId} (사용자: ${userId}, 상태: ${subscription.status})`);
    } catch (error) {
        console.error('구독 업데이트 처리 오류:', error);
        throw error;
    }
}

/**
 * 구독 삭제 처리
 */
async function handleSubscriptionDeleted(subscription) {
    const userId = subscription.metadata.userId;
    const subscriptionId = subscription.id;

    try {
        // 구독 상태를 삭제됨으로 업데이트
        await updateSubscriptionStatus(subscriptionId, {
            status: 'deleted',
            deletedAt: new Date()
        });

        // 쉐어링 그룹에서 사용자 제거
        if (subscription.metadata.sharingId) {
            await removeSharingParticipant(subscription.metadata.sharingId, userId);
        }

        // 구독 삭제 로그 저장
        await savePaymentLog({
            userId,
            type: 'subscription_deleted',
            stripeId: subscriptionId,
            description: '구독 완전 삭제',
            status: 'deleted'
        });

        // 사용자에게 알림
        const user = await getUserById(userId);
        if (user) {
            await sendSubscriptionDeletedEmail(user.email, subscription);
        }

        console.log(`구독 삭제: ${subscriptionId} (사용자: ${userId})`);
    } catch (error) {
        console.error('구독 삭제 처리 오류:', error);
        throw error;
    }
}

/**
 * 구독 삭제 알림 이메일
 */
async function sendSubscriptionDeletedEmail(email, subscription) {
    const emailTemplate = `
        <h2>구독이 완전히 종료되었습니다</h2>
        <p>구독 서비스가 완전히 종료되었습니다.</p>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>종료 정보</h3>
            <p><strong>구독 ID:</strong> ${subscription.id}</p>
            <p><strong>종료 일시:</strong> ${new Date().toLocaleString('ko-KR')}</p>
        </div>
        <p>언제든지 다시 구독하실 수 있습니다. One AI 서비스를 이용해 주셔서 감사했습니다.</p>
    `;

    await sendEmail({
        to: email,
        subject: '[One AI] 구독 서비스 종료 안내',
        html: emailTemplate
    });
}

/**
 * 구독 결제 실패 알림 이메일
 */
async function sendSubscriptionPaymentFailedEmail(email, subscription, invoice) {
    const emailTemplate = `
        <h2>구독 결제에 실패했습니다</h2>
        <p>구독 서비스 결제 처리 중 문제가 발생했습니다.</p>
        <div style="background: #fff5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h3>결제 실패 정보</h3>
            <p><strong>구독 ID:</strong> ${subscription.id}</p>
            <p><strong>청구서 ID:</strong> ${invoice.id}</p>
            <p><strong>결제 시도 일시:</strong> ${new Date(invoice.created * 1000).toLocaleString('ko-KR')}</p>
            <p><strong>다음 재시도:</strong> ${invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toLocaleString('ko-KR') : '없음'}</p>
        </div>
        <p>결제 방법을 확인하고 업데이트해 주세요. 계속 실패하면 구독이 취소될 수 있습니다.</p>
        <p><a href="${process.env.CLIENT_URL}/payment/methods">결제 방법 관리하기</a></p>
    `;

    await sendEmail({
        to: email,
        subject: '[One AI] 구독 결제 실패 안내',
        html: emailTemplate
    });
}

/**
 * 쉐어링 전용 결제 인텐트 생성
 */
async function createSharingPaymentIntent({ user_id, amount, currency = 'krw', description, metadata = {} }) {
    try {
        const user = await getUserById(user_id);
        if (!user) {
            throw new Error('사용자를 찾을 수 없습니다.');
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            description: description,
            metadata: {
                userId: user_id.toString(),
                ...metadata
            },
            automatic_payment_methods: {
                enabled: true
            }
        });

        // 결제 로그 저장
        await savePaymentLog({
            userId: user_id,
            type: 'sharing_payment_intent_created',
            stripeId: paymentIntent.id,
            amount,
            currency,
            description,
            metadata,
            status: paymentIntent.status
        });

        return {
            success: true,
            payment_id: paymentIntent.id,
            client_secret: paymentIntent.client_secret,
            status: paymentIntent.status
        };

    } catch (error) {
        console.error('쉐어링 결제 인텐트 생성 오류:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 기존 processPayment 함수 (하위 호환성을 위해 유지)
 */
async function processPayment(params) {
    console.warn('processPayment 함수는 deprecated됩니다. createSharingPaymentIntent를 사용하세요.');
    return await createSharingPaymentIntent(params);
}

/**
 * 쉐어링 그룹 구독 생성
 */
async function createSubscription({ sharing_id, service_type, participants }) {
    try {
        console.log(`쉐어링 그룹 구독 생성: ${sharing_id} (서비스: ${service_type})`);
        
        // 각 참여자에 대해 개별 구독 생성 (필요에 따라)
        const subscriptions = [];
        
        for (const participant of participants) {
            try {
                const user = await getUserById(participant.user_id);
                if (!user) continue;

                const customer = await findOrCreateCustomer(participant.user_id, user.email);
                
                // 쉐어링 전용 가격 생성 (동적으로)
                const price = await createSharingPrice({
                    amount: participant.monthly_cost,
                    currency: 'krw',
                    service_type,
                    sharing_id
                });

                // 구독 생성
                const subscription = await stripe.subscriptions.create({
                    customer: customer.id,
                    items: [{ price: price.id }],
                    metadata: {
                        userId: participant.user_id.toString(),
                        sharingId: sharing_id,
                        serviceType: service_type,
                        type: 'ai_sharing'
                    }
                });

                // DB에 구독 정보 저장
                await saveSubscription({
                    userId: participant.user_id,
                    stripeSubscriptionId: subscription.id,
                    stripeCustomerId: customer.id,
                    priceId: price.id,
                    sharingId: sharing_id,
                    status: subscription.status,
                    currentPeriodStart: new Date(subscription.current_period_start * 1000),
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000)
                });

                subscriptions.push(subscription);
                
                console.log(`구독 생성 완료: ${subscription.id} (사용자: ${participant.user_id})`);
                
            } catch (error) {
                console.error(`참여자 ${participant.user_id} 구독 생성 실패:`, error);
                // 개별 실패는 로그만 남기고 계속 진행
            }
        }

        return {
            success: true,
            subscriptions: subscriptions.map(sub => ({
                id: sub.id,
                status: sub.status,
                user_id: sub.metadata.userId
            }))
        };

    } catch (error) {
        console.error('쉐어링 구독 생성 오류:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 쉐어링 전용 가격 생성
 */
async function createSharingPrice({ amount, currency, service_type, sharing_id }) {
    try {
        const price = await stripe.prices.create({
            currency: currency,
            unit_amount: amount,
            recurring: {
                interval: 'month'
            },
            product_data: {
                name: `AI 쉐어링 - ${service_type}`,
                description: `쉐어링 그룹 ${sharing_id}의 월 구독료`,
                metadata: {
                    serviceType: service_type,
                    sharingId: sharing_id,
                    type: 'ai_sharing'
                }
            },
            metadata: {
                serviceType: service_type,
                sharingId: sharing_id,
                type: 'ai_sharing'
            }
        });

        return price;
    } catch (error) {
        console.error('쉐어링 가격 생성 오류:', error);
        throw error;
    }
}

// Stripe 고객 조회 또는 생성
async function findOrCreateCustomer(userId, email) {
    try {
        // DB에서 기존 고객 정보 조회
        const customer = await findCustomerByUserId(userId);
        
        if (customer) {
            // Stripe에서 고객 정보 확인
            const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
            if (stripeCustomer && !stripeCustomer.deleted) {
                return stripeCustomer;
            }
        }

        // 새 Stripe 고객 생성
        const stripeCustomer = await stripe.customers.create({
            email: email,
            metadata: {
                userId: userId.toString()
            }
        });

        // DB에 고객 정보 저장
        await saveCustomer({
            userId,
            stripeCustomerId: stripeCustomer.id,
            email
        });

        return stripeCustomer;
    } catch (error) {
        console.error('고객 생성/조회 오류:', error);
        throw error;
    }
}

// 이메일 발송 함수들
async function sendPaymentSuccessEmail(email, paymentIntent) {
    const emailTemplate = `
        <h2>결제가 완료되었습니다</h2>
        <p>One AI 서비스 이용해 주셔서 감사합니다.</p>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>결제 정보</h3>
            <p><strong>결제 ID:</strong> ${paymentIntent.id}</p>
            <p><strong>결제 금액:</strong> ${(paymentIntent.amount / 100).toLocaleString()}원</p>
            <p><strong>결제 일시:</strong> ${new Date().toLocaleString('ko-KR')}</p>
        </div>
        <p>문의사항이 있으시면 고객센터로 연락해 주세요.</p>
    `;

    await sendEmail({
        to: email,
        subject: '[One AI] 결제 완료 안내',
        html: emailTemplate
    });
}

async function sendPaymentFailedEmail(email, paymentIntent) {
    const emailTemplate = `
        <h2>결제 처리 중 오류가 발생했습니다</h2>
        <p>결제 처리 중 문제가 발생했습니다. 다시 시도해 주세요.</p>
        <div style="background: #fff5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h3>오류 정보</h3>
            <p><strong>결제 ID:</strong> ${paymentIntent.id}</p>
            <p><strong>오류 메시지:</strong> ${paymentIntent.last_payment_error?.message || '알 수 없는 오류'}</p>
        </div>
        <p>계속 문제가 발생하면 고객센터로 연락해 주세요.</p>
    `;

    await sendEmail({
        to: email,
        subject: '[One AI] 결제 실패 안내',
        html: emailTemplate
    });
}

async function sendCancellationEmail(email, subscription, cancelAtPeriodEnd) {
    const emailTemplate = `
        <h2>구독 취소 안내</h2>
        <p>구독 취소 요청이 처리되었습니다.</p>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>취소 정보</h3>
            <p><strong>구독 ID:</strong> ${subscription.stripeSubscriptionId}</p>
            <p><strong>취소 방식:</strong> ${cancelAtPeriodEnd ? '기간 만료 시 취소' : '즉시 취소'}</p>
            ${cancelAtPeriodEnd ? `<p><strong>서비스 종료일:</strong> ${subscription.currentPeriodEnd.toLocaleDateString('ko-KR')}</p>` : ''}
        </div>
        <p>One AI 서비스를 이용해 주셔서 감사했습니다.</p>
    `;

    await sendEmail({
        to: email,
        subject: '[One AI] 구독 취소 완료',
        html: emailTemplate
    });
}

async function sendRefundEmail(email, refund, paymentIntent) {
    const emailTemplate = `
        <h2>환불이 완료되었습니다</h2>
        <p>요청하신 환불이 처리되었습니다.</p>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <h3>환불 정보</h3>
            <p><strong>환불 ID:</strong> ${refund.id}</p>
            <p><strong>환불 금액:</strong> ${(refund.amount / 100).toLocaleString()}원</p>
            <p><strong>원본 결제 ID:</strong> ${paymentIntent.id}</p>
            <p><strong>환불 예상 일시:</strong> 영업일 기준 3-5일</p>
        </div>
        <p>환불 처리에는 영업일 기준 3-5일이 소요될 수 있습니다.</p>
    `;

    await sendEmail({
        to: email,
        subject: '[One AI] 환불 완료 안내',
        html: emailTemplate
    });
}

// DB 관련 함수들 (database.js에서 구현)
const {
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

module.exports = router;

// 다른 모듈에서 사용할 수 있도록 함수들 export
module.exports.processPayment = processPayment;
module.exports.createSharingPaymentIntent = createSharingPaymentIntent;
module.exports.createSubscription = createSubscription;
module.exports.createSharingPrice = createSharingPrice;
