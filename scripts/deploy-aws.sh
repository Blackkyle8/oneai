#!/bin/bash

# OneAI AWS 배포 스크립트
set -e

echo "🚀 OneAI AWS 배포를 시작합니다..."

# 환경 변수 확인
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ AWS 자격 증명이 설정되지 않았습니다."
    echo "다음 환경 변수를 설정해주세요:"
    echo "  export AWS_ACCESS_KEY_ID=your_access_key"
    echo "  export AWS_SECRET_ACCESS_KEY=your_secret_key"
    echo "  export AWS_DEFAULT_REGION=ap-northeast-2"
    exit 1
fi

# AWS CLI 설정 확인
echo "🔧 AWS CLI 설정 확인 중..."
aws sts get-caller-identity

# S3 버킷 생성 (존재하지 않는 경우)
BUCKET_NAME=${AWS_S3_BUCKET:-oneai-uploads}
REGION=${AWS_DEFAULT_REGION:-ap-northeast-2}

echo "📦 S3 버킷 확인/생성: $BUCKET_NAME"
if ! aws s3 ls "s3://$BUCKET_NAME" 2>/dev/null; then
    echo "버킷이 존재하지 않습니다. 새로 생성합니다..."
    aws s3 mb "s3://$BUCKET_NAME" --region "$REGION"
    
    # 버킷 정책 설정 (웹 호스팅용)
    cat > bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
        }
    ]
}
EOF
    
    # 웹사이트 호스팅 설정
    aws s3 website "s3://$BUCKET_NAME" --index-document index.html --error-document index.html
    
    echo "✅ S3 버킷 생성 완료: $BUCKET_NAME"
else
    echo "✅ S3 버킷이 이미 존재합니다: $BUCKET_NAME"
fi

# 프론트엔드 빌드 및 S3 업로드
echo "🏗️ 프론트엔드 빌드 및 업로드..."

# frontend 폴더의 모든 파일을 S3에 업로드
aws s3 sync frontend/ "s3://$BUCKET_NAME/" --delete --acl public-read

echo "✅ 프론트엔드 S3 업로드 완료"

# CloudFront 배포 생성 (존재하지 않는 경우)
echo "🌐 CloudFront 설정 확인..."

# CloudFront 배포 확인
DISTRIBUTION_ID=${AWS_CLOUDFRONT_DISTRIBUTION_ID:-}
if [ -z "$DISTRIBUTION_ID" ]; then
    echo "CloudFront 배포를 새로 생성합니다..."
    
    cat > cloudfront-config.json << EOF
{
    "CallerReference": "oneai-$(date +%s)",
    "Comment": "OneAI CDN Distribution",
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-$BUCKET_NAME",
        "ViewerProtocolPolicy": "redirect-to-https",
        "MinTTL": 0,
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {
                "Forward": "none"
            }
        }
    },
    "Origins": {
        "Quantity": 1,
        "Items": [
            {
                "Id": "S3-$BUCKET_NAME",
                "DomainName": "$BUCKET_NAME.s3-website-$REGION.amazonaws.com",
                "CustomOriginConfig": {
                    "HTTPPort": 80,
                    "HTTPSPort": 443,
                    "OriginProtocolPolicy": "http-only"
                }
            }
        ]
    },
    "Enabled": true,
    "DefaultRootObject": "index.html"
}
EOF
    
    DISTRIBUTION_ID=$(aws cloudfront create-distribution --distribution-config file://cloudfront-config.json --query 'Distribution.Id' --output text)
    echo "✅ CloudFront 배포 생성 완료: $DISTRIBUTION_ID"
    echo "📝 .env 파일에 다음을 추가하세요: AWS_CLOUDFRONT_DISTRIBUTION_ID=$DISTRIBUTION_ID"
else
    echo "✅ 기존 CloudFront 배포 사용: $DISTRIBUTION_ID"
    
    # CloudFront 캐시 무효화
    echo "🔄 CloudFront 캐시 무효화 중..."
    aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"
fi

# EC2 또는 ECS 설정 (선택사항)
echo "💡 백엔드 배포를 위한 옵션:"
echo "  1. EC2 인스턴스에 직접 배포"
echo "  2. AWS ECS/Fargate 컨테이너 배포"
echo "  3. AWS Lambda + API Gateway (서버리스)"
echo ""
echo "현재는 S3 + CloudFront 프론트엔드 배포만 완료되었습니다."

# 정리
rm -f bucket-policy.json cloudfront-config.json

echo ""
echo "🎉 OneAI AWS 배포가 완료되었습니다!"
echo ""
echo "📊 배포 정보:"
echo "  S3 버킷: $BUCKET_NAME"
echo "  웹사이트 URL: http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
if [ ! -z "$DISTRIBUTION_ID" ]; then
    CLOUDFRONT_URL=$(aws cloudfront get-distribution --id "$DISTRIBUTION_ID" --query 'Distribution.DomainName' --output text)
    echo "  CloudFront URL: https://$CLOUDFRONT_URL"
fi
echo ""
echo "🔧 다음 단계:"
echo "  1. AWS 자격 증명을 .env 파일에 저장"
echo "  2. 백엔드 서버 배포 (EC2/ECS/Lambda 선택)"
echo "  3. 데이터베이스 설정 (RDS 등)"
echo "  4. 도메인 연결 및 SSL 인증서 설정"
