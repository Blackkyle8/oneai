/**
 * One AI Storage Module
 * 파일 업로드, 저장, 관리 및 CDN 기능을 제공하는 저장소 시스템
 * 
 * 기능:
 * - 파일 업로드 (AI 콘텐츠, 프로필 이미지, 문서 등)
 * - 이미지 최적화 및 리사이징
 * - CDN 캐싱 및 전송 최적화
 * - 파일 메타데이터 관리
 * - 보안 검증 및 바이러스 스캔
 * - 저장소 사용량 모니터링
 * - 백업 및 복구
 * 
 * @author One AI Team
 * @version 1.0.0
 */



const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const rateLimit = require('express-rate-limit');
const db = require('./database');

const router = express.Router();

// ClamAV 설정
const ENABLE_SCAN = String(process.env.FILE_SCAN || '').toLowerCase() !== 'off';
let ClamScan = null;

if (ENABLE_SCAN) {
  try {
    ClamScan = require('clamscan');
  } catch (e) {
    console.warn('[storage] clamscan 미설치. FILE_SCAN=off 로 간주하고 스캔 비활성화.');
  }
}

// 바이러스 스캔 함수
async function scanBuffer(buffer) {
  if (!ENABLE_SCAN || !ClamScan) {
    return { isInfected: false, viruses: [] };
  }

  try {
    const clamscan = await new ClamScan().init({
      removeInfected: true, 
      quarantineInfected: './quarantine/',
      scanLog: './logs/clamscan.log',
      debug_mode: process.env.NODE_ENV === 'development'
    });
    
    const { isInfected, viruses } = await clamscan.scanFile(buffer);
    return { isInfected, viruses };
  } catch (error) {
    console.error('바이러스 스캔 오류:', error);
    return { isInfected: false, viruses: [], error: error.message };
  }
}

module.exports.scanBuffer = scanBuffer;


// ==================== 설정 및 초기화 ====================

// AWS S3 클라이언트 설정
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    region: process.env.AWS_REGION || 'ap-northeast-2'
});

// CloudFront CDN 설정
const cloudFrontClient = new CloudFrontClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    region: process.env.AWS_REGION || 'ap-northeast-2'
});

// 업로드 제한 설정
const UPLOAD_LIMITS = {
    fileSize: {
        image: 10 * 1024 * 1024,      // 10MB
        document: 50 * 1024 * 1024,   // 50MB
        video: 500 * 1024 * 1024,     // 500MB
        audio: 100 * 1024 * 1024      // 100MB
    },
    allowedTypes: {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        document: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        video: ['video/mp4', 'video/webm', 'video/avi'],
        audio: ['audio/mp3', 'audio/wav', 'audio/ogg']
    }
};

// 이미지 최적화 설정
const IMAGE_SIZES = {
    thumbnail: { width: 150, height: 150 },
    small: { width: 400, height: 400 },
    medium: { width: 800, height: 800 },
    large: { width: 1200, height: 1200 },
    original: null
};

// 업로드 레이트 리미팅
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 50, // 15분당 최대 50개 파일
    message: {
        error: 'UPLOAD_RATE_LIMIT',
        message: '업로드 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
    }
});

// ClamAV 바이러스 스캐너 초기화
let clamscan;
/* eslint-disable no-unused-vars */
const initClamAV = async () => {
/* eslint-enable no-unused-vars */
    try {
        const clamAV = require('clamscan');
        clamscan = await new clamAV().init({
            removeInfected: true,
            quarantineInfected: './quarantine/',
            scanLog: './logs/clamscan.log',
            debugMode: process.env.NODE_ENV === 'development'
        });
        console.log('✅ ClamAV 바이러스 스캐너 초기화 완료');
    } catch (error) {
        console.warn('⚠️ ClamAV 초기화 실패 (개발 환경에서는 정상):', error.message);
    }
};

// ==================== 유틸리티 함수 ====================

/**
 * 파일 해시 생성
 */
const generateFileHash = (buffer) => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * 안전한 파일명 생성
 */
const generateSafeFilename = (originalName, userId) => {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName).toLowerCase();
    return `${userId}_${timestamp}_${random}${ext}`;
};

/**
 * 파일 타입 검증
 */
const validateFileType = (mimetype, category) => {
    const allowedTypes = UPLOAD_LIMITS.allowedTypes[category];
    return allowedTypes && allowedTypes.includes(mimetype);
};

/**
 * 파일 크기 검증
 */
const validateFileSize = (size, category) => {
    const maxSize = UPLOAD_LIMITS.fileSize[category];
    return maxSize && size <= maxSize;
};

/**
 * 이미지 메타데이터 추출
 */
const extractImageMetadata = async (buffer) => {
    try {
        const metadata = await sharp(buffer).metadata();
        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            channels: metadata.channels,
            density: metadata.density,
            hasAlpha: metadata.channels === 4
        };
    } catch (error) {
        return null;
    }
};

/**
 * 바이러스 스캔
 */
/* eslint-disable no-unused-vars */
const scanForVirus = async (filePath) => {
/* eslint-enable no-unused-vars */
    if (!clamscan) return { isInfected: false };
    
    try {
        const scanResult = await clamscan.scanFile(filePath);
        return {
            isInfected: scanResult.isInfected,
            viruses: scanResult.viruses || []
        };
    } catch (error) {
        console.error('바이러스 스캔 오류:', error);
        return { isInfected: false, error: error.message };
    }
};

// ==================== Multer 설정 ====================

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const category = req.params.category || 'image';
    
    if (!validateFileType(file.mimetype, category)) {
        return cb(new Error(`허용되지 않는 파일 형식입니다: ${file.mimetype}`));
    }
    
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB (최대값, 카테고리별로 추가 검증)
        files: 10 // 한 번에 최대 10개 파일
    }
});

// ==================== 이미지 최적화 ====================

/**
 * 이미지 리사이징 및 최적화
 */
const optimizeImage = async (buffer, size, options = {}) => {
    let sharpInstance = sharp(buffer);
    
    // 리사이징
    if (size && size.width && size.height) {
        sharpInstance = sharpInstance.resize(size.width, size.height, {
            fit: options.fit || 'cover',
            position: options.position || 'center'
        });
    }
    
    // 포맷 최적화
    if (options.format === 'webp') {
        sharpInstance = sharpInstance.webp({ quality: options.quality || 85 });
    } else if (options.format === 'jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: options.quality || 90 });
    } else if (options.format === 'png') {
        sharpInstance = sharpInstance.png({ quality: options.quality || 90 });
    }
    
    return await sharpInstance.toBuffer();
};

/**
 * 이미지 여러 크기 생성
 */
const generateImageSizes = async (buffer, filename) => {
    const results = {};
    
    for (const [sizeName, dimensions] of Object.entries(IMAGE_SIZES)) {
        try {
            if (dimensions) {
                const optimized = await optimizeImage(buffer, dimensions, {
                    format: 'webp',
                    quality: sizeName === 'thumbnail' ? 80 : 85
                });
                results[sizeName] = {
                    buffer: optimized,
                    filename: filename.replace(/\.[^/.]+$/, `_${sizeName}.webp`)
                };
            } else {
                results[sizeName] = {
                    buffer: buffer,
                    filename: filename
                };
            }
        } catch (error) {
            console.error(`이미지 크기 생성 오류 (${sizeName}):`, error);
        }
    }
    
    return results;
};

// ==================== S3 업로드 ====================

/**
 * S3에 파일 업로드
 */
const uploadToS3 = async (buffer, key, metadata = {}) => {
    const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: metadata.mimetype || 'application/octet-stream',
        CacheControl: 'max-age=31536000', // 1년 캐시
        Metadata: {
            uploadedAt: new Date().toISOString(),
            ...metadata
        }
    };
    
    const command = new PutObjectCommand(params);
    const result = await s3Client.send(command);
    return {
        Location: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        ETag: result.ETag
    };
};

/**
 * S3에서 파일 삭제
 */
const deleteFromS3 = async (key) => {
    const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
    };
    
    const command = new DeleteObjectCommand(params);
    return await s3Client.send(command);
};

/**
 * S3 파일 URL 생성
 */
const getS3Url = (key) => {
    if (process.env.CLOUDFRONT_DOMAIN) {
        return `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;
    }
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

// ==================== 데이터베이스 연동 ====================

/**
 * 파일 메타데이터 저장
 */
const saveFileMetadata = async (fileData) => {
    const query = `
        INSERT INTO files (
            id, user_id, filename, original_name, file_path, file_size, 
            mime_type, category, hash, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    const values = [
        fileData.id,
        fileData.userId,
        fileData.filename,
        fileData.originalName,
        fileData.filePath,
        fileData.fileSize,
        fileData.mimeType,
        fileData.category,
        fileData.hash,
        JSON.stringify(fileData.metadata)
    ];
    
    return await db.execute(query, values);
};

/**
 * 파일 메타데이터 조회
 */
const getFileMetadata = async (fileId, userId) => {
    const query = `
        SELECT * FROM files 
        WHERE id = ? AND user_id = ?
    `;
    
    const [rows] = await db.execute(query, [fileId, userId]);
    return rows[0];
};

/**
 * 사용자 저장소 사용량 조회
 */
const getUserStorageUsage = async (userId) => {
    const query = `
        SELECT 
            COUNT(*) as file_count,
            COALESCE(SUM(file_size), 0) as total_size
        FROM files 
        WHERE user_id = ? AND deleted_at IS NULL
    `;
    
    const [rows] = await db.execute(query, [userId]);
    return rows[0];
};

// ==================== API 엔드포인트 ====================

/**
 * 파일 업로드
 * POST /api/storage/upload/:category
 */
router.post('/upload/:category', uploadLimiter, upload.array('files', 10), async (req, res) => {
    try {
        const { category } = req.params;
        const { userId } = req.user;
        const files = req.files;
        
        if (!files || files.length === 0) {
            return res.status(400).json({
                error: 'NO_FILES',
                message: '업로드할 파일이 없습니다.'
            });
        }
        
        const uploadResults = [];
        
        for (const file of files) {
            // 파일 크기 검증
            if (!validateFileSize(file.size, category)) {
                uploadResults.push({
                    filename: file.originalname,
                    error: 'FILE_TOO_LARGE',
                    message: `파일 크기가 제한을 초과합니다. (최대: ${UPLOAD_LIMITS.fileSize[category] / 1024 / 1024}MB)`
                });
                continue;
            }
            
            // 파일 해시 생성
            const fileHash = generateFileHash(file.buffer);
            
            // 중복 파일 검사
            const existingFile = await db.execute(
                'SELECT id, file_path FROM files WHERE hash = ? AND user_id = ?',
                [fileHash, userId]
            );
            
            if (existingFile[0].length > 0) {
                uploadResults.push({
                    filename: file.originalname,
                    fileId: existingFile[0][0].id,
                    url: getS3Url(existingFile[0][0].file_path),
                    message: '이미 업로드된 파일입니다.'
                });
                continue;
            }
            
            // 임시 파일 저장 (바이러스 스캔용)
            const tempPath = path.join('/tmp', `${Date.now()}_${file.originalname}`);
            await fs.writeFile(tempPath, file.buffer);
            
            try {
                // 바이러스 스캔
                const scanResult = await scanBuffer(file.buffer);
                if (scanResult.isInfected) {
                    uploadResults.push({
                        filename: file.originalname,
                        error: 'VIRUS_DETECTED',
                        message: '바이러스가 감지되어 업로드가 차단되었습니다.',
                        viruses: scanResult.viruses
                    });
                    continue;
                }
                
                const fileId = crypto.randomUUID();
                const safeFilename = generateSafeFilename(file.originalname, userId);
                const s3Key = `uploads/${userId}/${category}/${safeFilename}`;
                
                const uploadedFiles = [];
                
                // 이미지인 경우 여러 크기 생성
                if (category === 'image' && file.mimetype.startsWith('image/')) {
                    const imageSizes = await generateImageSizes(file.buffer, safeFilename);
                    
                    for (const [sizeName, sizeData] of Object.entries(imageSizes)) {
                        const sizeKey = `uploads/${userId}/${category}/${sizeName}/${sizeData.filename}`;
                        await uploadToS3(sizeData.buffer, sizeKey, {
                            originalName: file.originalname,
                            userId: userId,
                            category: category,
                            size: sizeName,
                            mimetype: sizeName === 'original' ? file.mimetype : 'image/webp'
                        });
                        
                        uploadedFiles.push({
                            size: sizeName,
                            url: getS3Url(sizeKey),
                            filename: sizeData.filename
                        });
                    }
                } else {
                    // 일반 파일 업로드
                    await uploadToS3(file.buffer, s3Key, {
                        originalName: file.originalname,
                        userId: userId,
                        category: category,
                        mimetype: file.mimetype
                    });
                    
                    uploadedFiles.push({
                        size: 'original',
                        url: getS3Url(s3Key),
                        filename: safeFilename
                    });
                }
                
                // 메타데이터 추출
                let metadata = {
                    sizes: uploadedFiles.map(f => f.size)
                };
                
                if (category === 'image' && file.mimetype.startsWith('image/')) {
                    const imageMetadata = await extractImageMetadata(file.buffer);
                    if (imageMetadata) {
                        metadata = { ...metadata, ...imageMetadata };
                    }
                }
                
                // 데이터베이스에 저장
                await saveFileMetadata({
                    id: fileId,
                    userId: userId,
                    filename: safeFilename,
                    originalName: file.originalname,
                    filePath: s3Key,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    category: category,
                    hash: fileHash,
                    metadata: metadata
                });
                
                uploadResults.push({
                    fileId: fileId,
                    filename: file.originalname,
                    category: category,
                    size: file.size,
                    mimeType: file.mimetype,
                    files: uploadedFiles,
                    url: uploadedFiles.find(f => f.size === 'original')?.url || uploadedFiles[0]?.url,
                    metadata: metadata
                });
                
            } finally {
                // 임시 파일 삭제
                try {
                    await fs.unlink(tempPath);
                } catch (error) {
                    console.warn('임시 파일 삭제 실패:', error);
                }
            }
        }
        
        res.json({
            success: true,
            message: `${uploadResults.length}개 파일 처리 완료`,
            results: uploadResults
        });
        
    } catch (error) {
        console.error('파일 업로드 오류:', error);
        res.status(500).json({
            error: 'UPLOAD_FAILED',
            message: '파일 업로드 중 오류가 발생했습니다.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * 파일 정보 조회
 * GET /api/storage/files/:fileId
 */
router.get('/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { userId } = req.user;
        
        const fileData = await getFileMetadata(fileId, userId);
        
        if (!fileData) {
            return res.status(404).json({
                error: 'FILE_NOT_FOUND',
                message: '파일을 찾을 수 없습니다.'
            });
        }
        
        // URL 생성
        const metadata = JSON.parse(fileData.metadata);
        const urls = {};
        
        if (metadata.sizes) {
            for (const size of metadata.sizes) {
                const key = size === 'original' 
                    ? fileData.file_path 
                    : fileData.file_path.replace(/\/([^/]+)$/, `/${size}/$1`).replace(/\.[^/.]+$/, '_' + size + '.webp');
                urls[size] = getS3Url(key);
            }
        } else {
            urls.original = getS3Url(fileData.file_path);
        }
        
        res.json({
            fileId: fileData.id,
            filename: fileData.original_name,
            category: fileData.category,
            size: fileData.file_size,
            mimeType: fileData.mime_type,
            metadata: metadata,
            urls: urls,
            createdAt: fileData.created_at,
            updatedAt: fileData.updated_at
        });
        
    } catch (error) {
        console.error('파일 조회 오류:', error);
        res.status(500).json({
            error: 'FETCH_FAILED',
            message: '파일 정보 조회 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 사용자 파일 목록 조회
 * GET /api/storage/files
 */
router.get('/files', async (req, res) => {
    try {
        const { userId } = req.user;
        const { 
            category, 
            page = 1, 
            limit = 20, 
            sortBy = 'created_at', 
            sortOrder = 'DESC' 
        } = req.query;
        
        let query = `
            SELECT id, filename, original_name, file_size, mime_type, 
                   category, metadata, created_at, updated_at
            FROM files 
            WHERE user_id = ? AND deleted_at IS NULL
        `;
        
        const queryParams = [userId];
        
        if (category) {
            query += ' AND category = ?';
            queryParams.push(category);
        }
        
        query += ` ORDER BY ${sortBy} ${sortOrder}`;
        query += ` LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
        
        const [files] = await db.execute(query, queryParams);
        
        // 파일 URL 생성
        const filesWithUrls = files.map(file => {
            const metadata = JSON.parse(file.metadata);
            let url = getS3Url(file.file_path);
            
            // 이미지인 경우 medium 크기 URL 우선 사용
            if (file.category === 'image' && metadata.sizes?.includes('medium')) {
                const mediumKey = file.file_path.replace(/\/([^/]+)$/, '/medium/$1').replace(/\.[^/.]+$/, '_medium.webp');
                url = getS3Url(mediumKey);
            }
            
            return {
                fileId: file.id,
                filename: file.original_name,
                category: file.category,
                size: file.file_size,
                mimeType: file.mime_type,
                url: url,
                metadata: metadata,
                createdAt: file.created_at,
                updatedAt: file.updated_at
            };
        });
        
        // 전체 개수 조회
        let countQuery = 'SELECT COUNT(*) as total FROM files WHERE user_id = ? AND deleted_at IS NULL';
        const countParams = [userId];
        
        if (category) {
            countQuery += ' AND category = ?';
            countParams.push(category);
        }
        
        const [countResult] = await db.execute(countQuery, countParams);
        const total = countResult[0].total;
        
        res.json({
            files: filesWithUrls,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('파일 목록 조회 오류:', error);
        res.status(500).json({
            error: 'FETCH_FAILED',
            message: '파일 목록 조회 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 파일 삭제
 * DELETE /api/storage/files/:fileId
 */
router.delete('/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { userId } = req.user;
        
        const fileData = await getFileMetadata(fileId, userId);
        
        if (!fileData) {
            return res.status(404).json({
                error: 'FILE_NOT_FOUND',
                message: '파일을 찾을 수 없습니다.'
            });
        }
        
        // S3에서 파일 삭제
        const metadata = JSON.parse(fileData.metadata);
        
        if (metadata.sizes) {
            // 이미지인 경우 모든 크기 삭제
            for (const size of metadata.sizes) {
                const key = size === 'original' 
                    ? fileData.file_path 
                    : fileData.file_path.replace(/\/([^/]+)$/, `/${size}/$1`).replace(/\.[^/.]+$/, '_' + size + '.webp');
                
                try {
                    await deleteFromS3(key);
                } catch (error) {
                    console.warn('S3 파일 삭제 실패:', key, error.message);
                }
            }
        } else {
            // 일반 파일 삭제
            try {
                await deleteFromS3(fileData.file_path);
            } catch (error) {
                console.warn('S3 파일 삭제 실패:', fileData.file_path, error.message);
            }
        }
        
        // 데이터베이스에서 소프트 삭제
        await db.execute(
            'UPDATE files SET deleted_at = NOW() WHERE id = ? AND user_id = ?',
            [fileId, userId]
        );
        
        res.json({
            success: true,
            message: '파일이 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('파일 삭제 오류:', error);
        res.status(500).json({
            error: 'DELETE_FAILED',
            message: '파일 삭제 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 저장소 사용량 조회
 * GET /api/storage/usage
 */
router.get('/usage', async (req, res) => {
    try {
        const { userId } = req.user;
        
        const usage = await getUserStorageUsage(userId);
        
        // 사용자 플랜별 제한량
        const userPlan = req.user.plan || 'free';
        const limits = {
            free: 1024 * 1024 * 1024,        // 1GB
            pro: 10 * 1024 * 1024 * 1024,    // 10GB
            enterprise: 100 * 1024 * 1024 * 1024  // 100GB
        };
        
        const limit = limits[userPlan] || limits.free;
        const usagePercent = (usage.total_size / limit) * 100;
        
        res.json({
            fileCount: usage.file_count,
            totalSize: usage.total_size,
            totalSizeMB: Math.round(usage.total_size / 1024 / 1024),
            limit: limit,
            limitMB: Math.round(limit / 1024 / 1024),
            usagePercent: Math.round(usagePercent * 100) / 100,
            plan: userPlan
        });
        
    } catch (error) {
        console.error('사용량 조회 오류:', error);
        res.status(500).json({
            error: 'USAGE_FETCH_FAILED',
            message: '저장소 사용량 조회 중 오류가 발생했습니다.'
        });
    }
});

/**
 * CDN 캐시 무효화
 * POST /api/storage/invalidate-cache
 */
router.post('/invalidate-cache', async (req, res) => {
    try {
        const { paths } = req.body;
        const { userId } = req.user;
        
        if (!paths || !Array.isArray(paths)) {
            return res.status(400).json({
                error: 'INVALID_PATHS',
                message: '무효화할 경로를 배열로 제공해야 합니다.'
            });
        }
        
        // 사용자가 소유한 파일인지 확인
        const userPaths = paths.filter(path => path.includes(`uploads/${userId}/`));
        
        if (userPaths.length === 0) {
            return res.status(400).json({
                error: 'NO_VALID_PATHS',
                message: '무효화할 수 있는 경로가 없습니다.'
            });
        }
        
        if (process.env.CLOUDFRONT_DISTRIBUTION_ID) {
            const params = {
                DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
                InvalidationBatch: {
                    CallerReference: `${userId}-${Date.now()}`,
                    Paths: {
                        Quantity: userPaths.length,
                        Items: userPaths.map(path => `/${path}`)
                    }
                }
            };
            
            const command = new CreateInvalidationCommand(params);
            const result = await cloudFrontClient.send(command);
            
            res.json({
                success: true,
                message: 'CDN 캐시 무효화가 요청되었습니다.',
                invalidationId: result.Invalidation.Id,
                paths: userPaths
            });
        } else {
            res.json({
                success: true,
                message: 'CDN이 설정되지 않아 캐시 무효화를 건너뜁니다.',
                paths: userPaths
            });
        }
        
    } catch (error) {
        console.error('캐시 무효화 오류:', error);
        res.status(500).json({
            error: 'INVALIDATION_FAILED',
            message: 'CDN 캐시 무효화 중 오류가 발생했습니다.'
        });
    }
});

// ==================== 관리자 API ====================

/**
 * 전체 저장소 통계 (관리자용)
 * GET /api/storage/admin/stats
 */
router.get('/admin/stats', async (req, res) => {
    try {
        // 관리자 권한 확인
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                error: 'INSUFFICIENT_PERMISSIONS',
                message: '관리자 권한이 필요합니다.'
            });
        }
        
        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_files,
                SUM(file_size) as total_size,
                COUNT(DISTINCT user_id) as unique_users,
                category,
                COUNT(*) as files_by_category
            FROM files 
            WHERE deleted_at IS NULL
            GROUP BY category
        `);
        
        const [overallStats] = await db.execute(`
            SELECT 
                COUNT(*) as total_files,
                SUM(file_size) as total_size,
                COUNT(DISTINCT user_id) as unique_users
            FROM files 
            WHERE deleted_at IS NULL
        `);
        
        res.json({
            overall: overallStats[0],
            byCategory: stats,
            lastUpdated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('관리자 통계 조회 오류:', error);
        res.status(500).json({
            error: 'ADMIN_STATS_FAILED',
            message: '통계 조회 중 오류가 발생했습니다.'
        });
    }
});

// ==================== 초기화 및 에러 핸들링 ====================

// 초기화
const initializeStorage = async () => {
    try {
        // 업로드 디렉토리 생성
        const uploadDir = path.join(__dirname, '../uploads');
        await fs.mkdir(uploadDir, { recursive: true });
        
        console.log('✅ Storage 모듈 초기화 완료');
    } catch (error) {
        console.error('❌ Storage 모듈 초기화 실패:', error);
    }
};

// 에러 핸들링 미들웨어
router.use((error, req, res) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'FILE_TOO_LARGE',
                message: '파일 크기가 제한을 초과합니다.'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'TOO_MANY_FILES',
                message: '파일 개수가 제한을 초과합니다.'
            });
        }
    }
    
    console.error('Storage 에러:', error);
    res.status(500).json({
        error: 'STORAGE_ERROR',
        message: '저장소 처리 중 오류가 발생했습니다.'
    });
});

// 초기화 실행
initializeStorage();

module.exports = {
    router,
    initializeStorage,
    uploadToS3,
    deleteFromS3,
    getS3Url,
    generateImageSizes,
    optimizeImage
};