/**
 * One AI Platform - Middleware Collection
 * 인증, 로깅, 에러 핸들링, 보안 등 모든 미들웨어 모음
 */

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { validationResult } = require('express-validator');

// 환경 변수 로드
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-secret-key';

/**
 * 보안 미들웨어 (Helmet)
 * XSS, CSRF, Clickjacking 등 기본 보안 헤더 설정
 */
const securityMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.anthropic.com", "https://api.openai.com"]
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});

/**
 * CORS 미들웨어
 * 크로스 오리진 요청 허용 설정
 */
const corsMiddleware = cors({
    origin: function (origin, callback) {
        // 개발 환경에서는 모든 오리진 허용
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        
        // 프로덕션에서는 허용된 도메인만
        const allowedOrigins = [
            'https://oneai.example.com',
            'https://www.oneai.example.com',
            'http://localhost:3000',
            'http://localhost:8080'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
});

/**
 * 로깅 미들웨어 (Morgan)
 * API 요청 로그 기록
 */
const loggingMiddleware = morgan('combined', {
    skip: function (req, res) {
        // 헬스체크는 로그 제외
        return req.url === '/health';
    }
});

/**
 * Rate Limiting 미들웨어
 * API 요청 횟수 제한
 */
const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 15분당 100회
    message: {
        error: 'Too many requests',
        message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
        retryAfter: Math.ceil(15 * 60 / 60) // 분 단위
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Auth Rate Limiting (더 엄격)
 * 로그인, 회원가입 등 인증 관련 요청 제한
 */
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 5, // 15분당 5회
    message: {
        error: 'Too many authentication attempts',
        message: '인증 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
        retryAfter: 15
    },
    skipSuccessfulRequests: true
});

/**
 * AI API Rate Limiting
 * AI 서비스 API 호출 제한
 */
const aiApiRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: 20, // 분당 20회
    message: {
        error: 'AI API rate limit exceeded',
        message: 'AI API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
    }
});

/**
 * JWT 토큰 검증 미들웨어
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            error: 'Access token required',
            message: '로그인이 필요합니다.'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    error: 'Token expired',
                    message: '토큰이 만료되었습니다. 다시 로그인해주세요.'
                });
            }
            return res.status(403).json({
                error: 'Invalid token',
                message: '유효하지 않은 토큰입니다.'
            });
        }

        req.user = user;
        next();
    });
};

/**
 * 선택적 인증 미들웨어 (토큰이 있으면 검증, 없어도 통과)
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            req.user = null;
        } else {
            req.user = user;
        }
        next();
    });
};

/**
 * 관리자 권한 확인 미들웨어
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Admin access required',
            message: '관리자 권한이 필요합니다.'
        });
    }
    next();
};

/**
 * 프리미엄 사용자 권한 확인 미들웨어
 */
const requirePremium = (req, res, next) => {
    if (!req.user || !req.user.isPremium) {
        return res.status(403).json({
            error: 'Premium access required',
            message: '프리미엄 구독이 필요한 기능입니다.'
        });
    }
    next();
};

/**
 * API 키 검증 미들웨어 (관리자 API용)
 */
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return res.status(401).json({
            error: 'Invalid API key',
            message: '유효하지 않은 API 키입니다.'
        });
    }

    next();
};

/**
 * 입력 검증 미들웨어
 */
const validateInput = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            message: '입력 데이터가 유효하지 않습니다.',
            details: errors.array().map(error => ({
                field: error.param,
                message: error.msg,
                value: error.value
            }))
        });
    }
    
    next();
};

/**
 * 파일 업로드 검증 미들웨어
 */
const validateFileUpload = (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
            error: 'No file uploaded',
            message: '업로드할 파일이 없습니다.'
        });
    }

    const file = req.files.file || req.files[Object.keys(req.files)[0]];
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];

    if (file.size > maxSize) {
        return res.status(400).json({
            error: 'File too large',
            message: '파일 크기는 10MB를 초과할 수 없습니다.'
        });
    }

    if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
            error: 'Invalid file type',
            message: '지원하지 않는 파일 형식입니다.',
            allowedTypes: allowedTypes
        });
    }

    next();
};

/**
 * 에러 핸들링 미들웨어
 */
const errorHandler = (err, req, res, next) => {
    // 로그 기록
    console.error('Error occurred:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        user: req.user?.id,
        timestamp: new Date().toISOString()
    });

    // MongoDB 에러
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: '데이터 유효성 검사 실패',
            details: Object.values(err.errors).map(e => e.message)
        });
    }

    // JWT 에러
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid Token',
            message: '유효하지 않은 토큰입니다.'
        });
    }

    // 중복 키 에러
    if (err.code === 11000) {
        return res.status(409).json({
            error: 'Duplicate Entry',
            message: '이미 존재하는 데이터입니다.'
        });
    }

    // 기본 에러 응답
    const status = err.status || err.statusCode || 500;
    const message = err.message || '서버 내부 오류가 발생했습니다.';

    res.status(status).json({
        error: err.name || 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 
            (status === 500 ? '서버 내부 오류가 발생했습니다.' : message) : 
            message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

/**
 * 404 핸들러 미들웨어
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: '요청한 리소스를 찾을 수 없습니다.',
        path: req.path,
        method: req.method
    });
};

/**
 * 헬스체크 미들웨어
 */
const healthCheck = (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
    });
};

/**
 * 요청 로그 미들웨어
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
    });
    
    next();
};

/**
 * 사용자 활동 추적 미들웨어
 */
const trackUserActivity = async (req, res, next) => {
    if (req.user) {
        try {
            // 사용자의 마지막 활동 시간 업데이트
            // 실제 구현에서는 데이터베이스 업데이트 로직 추가
            req.user.lastActivity = new Date();
        } catch (error) {
            console.error('Failed to track user activity:', error);
        }
    }
    next();
};

/**
 * 캐시 제어 미들웨어
 */
const cacheControl = (duration = 3600) => {
    return (req, res, next) => {
        res.set('Cache-Control', `public, max-age=${duration}`);
        next();
    };
};

/**
 * 요청 크기 제한 미들웨어
 */
const limitRequestSize = (limit = '10mb') => {
    return express.json({ limit });
};

/**
 * 개발 환경 전용 미들웨어
 */
const developmentOnly = (req, res, next) => {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({
            error: 'Development Only',
            message: '개발 환경에서만 사용 가능한 기능입니다.'
        });
    }
    next();
};

/**
 * 프로덕션 환경 전용 미들웨어
 */
const productionOnly = (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        return res.status(403).json({
            error: 'Production Only',
            message: '프로덕션 환경에서만 사용 가능한 기능입니다.'
        });
    }
    next();
};

/**
 * IP 화이트리스트 미들웨어
 */
const ipWhitelist = (allowedIPs = []) => {
    return (req, res, next) => {
        const clientIP = req.ip || req.connection.remoteAddress;
        
        if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
            return res.status(403).json({
                error: 'IP Not Allowed',
                message: '허용되지 않은 IP 주소입니다.'
            });
        }
        
        next();
    };
};

/**
 * 실시간 요청 모니터링
 */
const requestMonitor = (req, res, next) => {
    // 실시간 대시보드나 모니터링 시스템에 데이터 전송
    const requestData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id
    };
    
    // WebSocket이나 Server-Sent Events로 실시간 전송
    // broadcast(requestData);
    
    next();
};

module.exports = {
    // 보안 & CORS
    securityMiddleware,
    corsMiddleware,
    
    // 로깅 & 모니터링
    loggingMiddleware,
    requestLogger,
    requestMonitor,
    
    // Rate Limiting
    generalRateLimit,
    authRateLimit,
    aiApiRateLimit,
    
    // 인증 & 권한
    authenticateToken,
    optionalAuth,
    requireAdmin,
    requirePremium,
    validateApiKey,
    
    // 검증
    validateInput,
    validateFileUpload,
    
    // 에러 핸들링
    errorHandler,
    notFoundHandler,
    
    // 유틸리티
    healthCheck,
    trackUserActivity,
    cacheControl,
    limitRequestSize,
    
    // 환경별
    developmentOnly,
    productionOnly,
    
    // 보안
    ipWhitelist,
    
    /**
     * 기본 미들웨어 스택 (권장 순서)
     */
    getDefaultStack: () => [
        securityMiddleware,
        corsMiddleware,
        loggingMiddleware,
        requestLogger,
        generalRateLimit,
        requestMonitor
    ],
    
    /**
     * 인증이 필요한 라우트용 미들웨어 스택
     */
    getAuthStack: () => [
        authenticateToken,
        trackUserActivity
    ],
    
    /**
     * 관리자 전용 라우트용 미들웨어 스택
     */
    getAdminStack: () => [
        authenticateToken,
        requireAdmin,
        trackUserActivity
    ]
};