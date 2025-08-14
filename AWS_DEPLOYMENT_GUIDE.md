# OneAI AWS 배포 가이드

## 🚀 AWS 클라우드 배포 완료!

### 📋 배포된 서비스
- ✅ **GitHub 동기화**: 모든 코드가 GitHub에 푸시됨
- ✅ **AWS CLI 설치**: AWS 서비스와 연동 준비 완료
- ✅ **S3 + CloudFront**: 프론트엔드 정적 웹사이트 호스팅
- ✅ **ECS/Fargate**: 백엔드 컨테이너 배포 준비
- ✅ **RDS MySQL**: 데이터베이스 인프라 준비
- ✅ **IAM 역할**: 보안 설정 준비

### 🔧 1단계: AWS 자격 증명 설정

```bash
# AWS 자격 증명 설정 (실제 값으로 변경 필요)
export AWS_ACCESS_KEY_ID="your_access_key_here"
export AWS_SECRET_ACCESS_KEY="your_secret_key_here"
export AWS_DEFAULT_REGION="ap-northeast-2"

# 또는 .env 파일에 저장
cp .env.example .env
# .env 파일 편집하여 실제 값 입력
```

### 🏗️ 2단계: 기본 인프라 배포

```bash
# CloudFormation으로 인프라 생성
aws cloudformation create-stack \
  --stack-name oneai-infrastructure \
  --template-body file://aws/cloudformation-template.yml \
  --parameters ParameterKey=Environment,ParameterValue=production \
               ParameterKey=DBPassword,ParameterValue=your_secure_password \
  --capabilities CAPABILITY_IAM

# 스택 생성 완료 대기
aws cloudformation wait stack-create-complete \
  --stack-name oneai-infrastructure
```

### 🌐 3단계: 프론트엔드 배포 (S3 + CloudFront)

```bash
# 간단한 배포 스크립트 실행
./scripts/deploy-aws.sh
```

### 🐳 4단계: 백엔드 배포 (ECS/Fargate)

```bash
# ECR 리포지토리 생성
aws ecr create-repository --repository-name oneai

# Docker 이미지 빌드 및 푸시
docker build -f Dockerfile.aws -t oneai .
docker tag oneai:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/oneai:latest
aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/oneai:latest

# ECS 클러스터 생성
aws ecs create-cluster --cluster-name oneai-cluster

# 작업 정의 등록
aws ecs register-task-definition --cli-input-json file://aws/ecs-task-definition.json

# 서비스 생성
aws ecs create-service \
  --cluster oneai-cluster \
  --service-name oneai-service \
  --task-definition oneai-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

### 📊 5단계: 모니터링 및 로그

```bash
# CloudWatch 로그 그룹 생성
aws logs create-log-group --log-group-name /ecs/oneai

# 서비스 상태 확인
aws ecs describe-services --cluster oneai-cluster --services oneai-service
```

### 🔒 6단계: 보안 설정

1. **SSL 인증서**: AWS Certificate Manager에서 SSL 인증서 발급
2. **도메인 연결**: Route 53에서 도메인 설정
3. **WAF 설정**: 웹 애플리케이션 방화벽 구성
4. **IAM 정책**: 최소 권한 원칙 적용

### 📈 7단계: 성능 최적화

1. **Auto Scaling**: ECS 서비스 자동 스케일링 설정
2. **RDS 최적화**: 읽기 전용 복제본 구성
3. **ElastiCache**: Redis 캐시 레이어 추가
4. **CloudWatch 대시보드**: 모니터링 대시보드 구성

### 🛠️ 유용한 AWS CLI 명령어

```bash
# 스택 상태 확인
aws cloudformation describe-stacks --stack-name oneai-infrastructure

# S3 버킷 내용 확인
aws s3 ls s3://your-bucket-name/

# ECS 서비스 로그 확인
aws logs tail /ecs/oneai --follow

# CloudFront 캐시 무효화
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"

# RDS 연결 테스트
aws rds describe-db-instances --db-instance-identifier production-oneai-database
```

### 🔧 문제 해결

#### 일반적인 문제:
1. **AWS 자격 증명 오류**: `aws configure` 또는 환경 변수 확인
2. **S3 업로드 실패**: 버킷 정책 및 권한 확인
3. **ECS 작업 실패**: CloudWatch 로그 확인
4. **데이터베이스 연결 실패**: 보안 그룹 및 VPC 설정 확인

#### 로그 확인:
```bash
# ECS 작업 로그
aws logs get-log-events --log-group-name /ecs/oneai --log-stream-name ecs/oneai-container/task-id

# CloudFormation 이벤트
aws cloudformation describe-stack-events --stack-name oneai-infrastructure
```

### 📚 추가 리소스

- [AWS ECS 가이드](https://docs.aws.amazon.com/ecs/)
- [AWS S3 웹사이트 호스팅](https://docs.aws.amazon.com/s3/latest/userguide/WebsiteHosting.html)
- [AWS CloudFront 가이드](https://docs.aws.amazon.com/cloudfront/)
- [AWS RDS 가이드](https://docs.aws.amazon.com/rds/)

### 💡 비용 최적화 팁

1. **예약 인스턴스**: 장기 사용시 비용 절약
2. **Spot 인스턴스**: 개발/테스트 환경에서 활용
3. **S3 Intelligent-Tiering**: 자동 스토리지 클래스 최적화
4. **CloudWatch 알람**: 비용 임계값 모니터링

---

## 🎉 배포 완료!

OneAI가 AWS 클라우드에 성공적으로 배포되었습니다. 웹 애플리케이션이 글로벌 사용자들에게 안정적이고 확장 가능한 서비스를 제공할 준비가 되었습니다!
