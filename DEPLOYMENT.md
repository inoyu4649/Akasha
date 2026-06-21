# Akasha — 서버 배포 가이드

> **대상 환경:** AWS EC2 (us-east-1, 버지니아 북부)  
> **인스턴스:** t4g.large (Graviton2 ARM / 2 vCPU / 8GB RAM)  
> **OS:** Ubuntu 22.04 LTS (ARM64)  
> **도메인:** `ai.akademiya.kr`

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [EC2 인스턴스 생성](#2-ec2-인스턴스-생성)
3. [서버 초기 설정](#3-서버-초기-설정)
4. [Docker 설치](#4-docker-설치)
5. [Google OAuth 설정](#5-google-oauth-설정)
6. [코드 배포](#6-코드-배포)
7. [환경 변수 설정](#7-환경-변수-설정)
8. [SSL 인증서 발급](#8-ssl-인증서-발급)
9. [Docker Compose 실행](#9-docker-compose-실행)
10. [Ollama 모델 설치](#10-ollama-모델-설치)
11. [배포 후 확인](#11-배포-후-확인)
12. [관리 명령어](#12-관리-명령어)
13. [트러블슈팅](#13-트러블슈팅)

---

## 1. 사전 준비

### 체크리스트

- [ ] AWS 계정 + IAM 사용자 (EC2 권한)
- [ ] us-east-1 리전 선택
- [ ] EC2 키 페어 생성 (`.pem` 파일 보관)
- [ ] Elastic IP 할당 (인스턴스 재시작 시 IP 유지)
- [ ] DNS A 레코드: `ai.akademiya.kr` → Elastic IP
- [ ] DNS 전파 확인: `nslookup ai.akademiya.kr`
- [ ] Google Cloud Console OAuth 앱 준비

---

## 2. EC2 인스턴스 생성

### AWS 콘솔 → EC2 → Launch Instance

| 항목 | 값 |
|------|----|
| 리전 | us-east-1 (버지니아 북부) |
| AMI | Ubuntu Server 22.04 LTS (HVM), SSD — **64-bit (Arm)** |
| 인스턴스 타입 | **t4g.large** (Graviton2 / 2 vCPU / 8GB RAM) |
| 스토리지 | gp3 / 30GB (Ollama 모델 저장 공간) |
| 키 페어 | 기존 키 페어 선택 또는 새로 생성 |

### 보안 그룹 (Security Group) 설정

새 보안 그룹 생성 또는 기존 그룹에 인바운드 규칙 추가:

| Type | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | 내 IP |
| HTTP | TCP | 80 | 0.0.0.0/0 |
| HTTPS | TCP | 443 | 0.0.0.0/0 |

> SSH는 "내 IP"로 제한하면 보안이 강화됩니다.

### Elastic IP 할당 및 연결

```
EC2 콘솔 → Elastic IPs → Allocate Elastic IP address → Allocate
→ Actions → Associate Elastic IP address → 생성한 인스턴스 선택
```

---

## 3. 서버 초기 설정

```bash
# SSH 접속
ssh -i ~/.ssh/your-key.pem ubuntu@<Elastic_IP>

# 패키지 업데이트
sudo apt update && sudo apt upgrade -y

# UFW 상태 확인 (보통 비활성화 상태)
sudo ufw status
# "Status: inactive" 이면 Security Group이 방화벽 역할 → 추가 설정 불필요
# 만약 active 상태면 포트 허용 필요:
# sudo ufw allow 80/tcp && sudo ufw allow 443/tcp

# swap 추가 (8GB RAM이지만 Ollama 안전망 확보)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# swappiness 낮춤 (Ollama 추론 성능 우선)
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## 4. Docker 설치

```bash
# Docker 공식 설치 스크립트
curl -fsSL https://get.docker.com | sh

# 현재 유저에게 docker 그룹 권한 부여
sudo usermod -aG docker $USER
newgrp docker

# 설치 확인
docker compose version
# Docker Compose version v2.x.x
```

---

## 5. Google OAuth 설정

1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. **APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth client ID**
3. Application type: **Web application**
4. **Authorized redirect URIs**에 정확히 추가:
   ```
   https://ai.akademiya.kr/api/auth/google/callback
   ```
5. **Client ID**와 **Client Secret** 저장

> **도메인 제한:** 백엔드가 `@hafs.hs.kr` 이메일을 강제 검증합니다.

---

## 6. 코드 배포

```bash
cd ~
git clone https://github.com/inoyu4649/Akasha.git akasha
cd akasha
```

---

## 7. 환경 변수 설정

```bash
cp .env.example .env
nano .env
```

아래 내용으로 채웁니다:

```dotenv
NODE_ENV=production

# ── URL 설정 ─────────────────────────────────────────────────────────────────
PORT=3001
FRONTEND_URL=https://ai.akademiya.kr
OLLAMA_URL=http://ollama:11434

# ── 데이터베이스 ──────────────────────────────────────────────────────────────
DATABASE_URL=mysql://root:${MYSQL_ROOT_PASSWORD}@mysql:3306/akasha
MYSQL_ROOT_PASSWORD=여기에_강력한_비밀번호_입력

# ── Google OAuth ─────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=여기에_Client_ID_입력
GOOGLE_CLIENT_SECRET=여기에_Client_Secret_입력
GOOGLE_CALLBACK_URL=https://ai.akademiya.kr/api/auth/google/callback

# ── JWT 시크릿 ───────────────────────────────────────────────────────────────
JWT_SECRET=여기에_랜덤_문자열_입력
JWT_REFRESH_SECRET=여기에_다른_랜덤_문자열_입력
```

랜덤 시크릿 생성:

```bash
openssl rand -hex 32   # MYSQL_ROOT_PASSWORD
openssl rand -hex 64   # JWT_SECRET
openssl rand -hex 64   # JWT_REFRESH_SECRET
```

> **⚠️ 보안:** `.env`는 `.gitignore`에 포함되어 Git에 올라가지 않습니다.

---

## 8. SSL 인증서 발급

Docker를 올리기 **전에** 80 포트로 인증서를 발급합니다.

### 8-1. Certbot 발급

```bash
sudo apt install -y certbot

sudo certbot certonly --standalone \
  -d ai.akademiya.kr \
  --agree-tos \
  --no-eff-email \
  -m 022207@hafs.hs.kr
```

### 8-2. 인증서 복사

```bash
mkdir -p ~/akasha/nginx/ssl

sudo cp /etc/letsencrypt/live/ai.akademiya.kr/fullchain.pem ~/akasha/nginx/ssl/
sudo cp /etc/letsencrypt/live/ai.akademiya.kr/privkey.pem   ~/akasha/nginx/ssl/
sudo chown $USER:$USER ~/akasha/nginx/ssl/*.pem
chmod 600 ~/akasha/nginx/ssl/privkey.pem
```

### 8-3. 자동 갱신 (crontab)

```bash
(crontab -l 2>/dev/null; echo "0 3 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/ai.akademiya.kr/fullchain.pem ~/akasha/nginx/ssl/ && cp /etc/letsencrypt/live/ai.akademiya.kr/privkey.pem ~/akasha/nginx/ssl/ && docker compose -f ~/akasha/docker-compose.yml exec nginx nginx -s reload") | crontab -
```

---

## 9. Docker Compose 실행

```bash
cd ~/akasha

# 이미지 빌드 + 전체 스택 실행 (첫 빌드: 3~5분)
docker compose up -d --build

# 로그 확인 (Prisma 마이그레이션 자동 실행됨)
docker compose logs -f backend

# 전체 서비스 상태
docker compose ps
```

**정상 기동 확인:**

```
NAME                STATUS
akasha-mysql-1      Up (healthy)
akasha-ollama-1     Up
akasha-backend-1    Up
akasha-frontend-1   Up
akasha-nginx-1      Up
```

---

## 10. Ollama 모델 설치

모델은 `ollama_data` Docker 볼륨에 저장됩니다 (인스턴스 재시작 후 유지).

```bash
# ── 크레딧 1 (경량 모델) ──────────────────────────────────────────────────────
docker compose exec ollama ollama pull llama3.2:1b
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull phi4-mini
docker compose exec ollama ollama pull gemma3:4b
docker compose exec ollama ollama pull qwen3:4b
docker compose exec ollama ollama pull qwen2.5-coder:3b

# ── 크레딧 3 (중형 모델, RAM 여유 확인 후) ───────────────────────────────────
docker compose exec ollama ollama pull llama3.2:8b
docker compose exec ollama ollama pull qwen3:7b
docker compose exec ollama ollama pull qwen2.5-coder:7b

# ── 크레딧 5 ──────────────────────────────────────────────────────────────────
docker compose exec ollama ollama pull deepseek-r1-distill-qwen:7b
```

메모리 확인:

```bash
watch -n 2 free -h
```

> **참고:** 7B 모델은 약 4.5~5GB RAM. t4g.large(8GB)에서 단일 모델 추론은 안정적으로 동작합니다.

---

## 11. 배포 후 확인

### API 헬스체크

```bash
curl https://ai.akademiya.kr/api/health
# {"status":"ok","timestamp":"2026-..."}
```

### 브라우저 체크리스트

1. `https://ai.akademiya.kr` 접속 — 로그인 화면 확인
2. `@hafs.hs.kr` Google 계정으로 로그인
3. 모델 선택 → 메시지 전송 → 스트리밍 응답 확인
4. `022207@hafs.hs.kr` 계정으로 `/admin` 접근

### 메모리 모니터링

```bash
watch -n 2 'docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"'
```

---

## 12. 관리 명령어

### 서비스 관리

```bash
docker compose restart                  # 전체 재시작
docker compose restart backend          # 백엔드만
docker compose restart ollama           # Ollama만
docker compose down                     # 중단
docker compose logs -f backend          # 실시간 로그
```

### DB 관리

```bash
# MySQL 직접 접속
docker compose exec mysql mysql -u root -p akasha

# 마이그레이션 수동 실행
docker compose exec backend npx prisma migrate deploy

# Prisma Studio (DB GUI — 브라우저: http://<IP>:5555)
docker compose exec backend npx prisma studio --hostname 0.0.0.0
```

### Ollama 모델 관리

```bash
docker compose exec ollama ollama list          # 설치된 모델 목록
docker compose exec ollama ollama ps            # 메모리에 올라간 모델
docker compose exec ollama ollama rm <model>    # 모델 삭제
```

### 업데이트 배포

```bash
cd ~/akasha
git pull origin main
docker compose up -d --build
```

### 비용 절감 (미사용 시)

```bash
# EC2 인스턴스 중지 (Elastic IP 유지, 스토리지 유지)
# AWS 콘솔 → EC2 → Instances → Stop Instance
# t3.large 비용: 약 $0.0832/시간 → 중지 시 스토리지 비용만 발생
```

---

## 13. 트러블슈팅

### 백엔드 기동 실패 — DB 연결 오류

```bash
docker compose ps mysql                 # healthy 상태 확인
docker compose restart backend
```

### Ollama OOM

```bash
free -h
docker compose restart ollama
```

### SSL 인증서 오류

```bash
ls -la ~/akasha/nginx/ssl/
openssl x509 -in ~/akasha/nginx/ssl/fullchain.pem -noout -dates

sudo certbot renew
sudo cp /etc/letsencrypt/live/ai.akademiya.kr/fullchain.pem ~/akasha/nginx/ssl/
sudo cp /etc/letsencrypt/live/ai.akademiya.kr/privkey.pem   ~/akasha/nginx/ssl/
docker compose exec nginx nginx -s reload
```

### 포트 80/443 접근 불가

```bash
# 1. AWS Security Group 인바운드 규칙 확인 (콘솔에서 직접 확인)
# 2. UFW 상태 확인
sudo ufw status
# active 상태면:
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp

# 3. Docker가 포트 점유 중인지 확인
sudo ss -tlnp | grep -E ':80|:443'
```

### Google OAuth — redirect_uri_mismatch

Google Cloud Console → Credentials에서 아래가 **정확히** 등록되어 있는지 확인:
```
https://ai.akademiya.kr/api/auth/google/callback
```

### SSE 스트리밍 중단

`nginx/nginx.conf`의 `/api/` 블록 확인:
```nginx
proxy_buffering    off;
proxy_cache        off;
proxy_read_timeout 600s;
```

---

## 아키텍처

```
인터넷 (80/443)
      │
      ▼
  AWS Security Group
      │
  nginx:alpine
  (reverse proxy + SSL)
      │
      ├── / ────────► frontend (nginx, SPA)
      │
      └── /api/ ───► backend (Node 24, Express 5)
                          │
                          ├── MySQL 8.0
                          └── Ollama
                              (단일 모델, keep_alive=0)
```

### 메모리 배분 (t4g.large / 8GB)

| 서비스    | 메모리 상한 | CPU 상한 |
|-----------|-------------|----------|
| Ollama    | 4,800MB     | 0.90     |
| MySQL     | 384MB       | 0.30     |
| Backend   | 192MB       | 0.30     |
| Frontend  | 64MB        | 0.10     |
| Nginx     | 64MB        | 0.10     |
| OS + 여유 | ~2,500MB    | —        |
| **합계**  | **≈8GB**    | **1.70** |

### AWS 예상 비용 (us-east-1)

| 항목 | 단가 | 월 예상 |
|------|------|---------|
| t4g.large (On-Demand) | $0.0672/h | ~$49 |
| EBS gp3 30GB | $0.08/GB-월 | ~$2.40 |
| Elastic IP (연결됨) | 무료 | $0 |
| 데이터 전송 (아웃바운드 1GB~) | $0.09/GB | ~$0.09 |
| **합계** | | **~$52/월** |

> 비용 절감: **Reserved Instance (1년)** 구매 시 약 40% 절감 (~$31/월)

---

*최초 작성: 2026-06-22 / AWS 전환: 2026-06-22*
