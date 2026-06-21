# Akasha — 서버 배포 가이드

> **대상 환경:** OCI (Oracle Cloud Infrastructure) ARM 인스턴스  
> **스펙:** OCPU 1 / RAM 6GB / Ubuntu 22.04 LTS  
> **도메인:** `ai.akademiya.kr`

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [서버 초기 설정](#2-서버-초기-설정)
3. [Docker 설치](#3-docker-설치)
4. [Google OAuth 설정](#4-google-oauth-설정)
5. [코드 배포](#5-코드-배포)
6. [환경 변수 설정](#6-환경-변수-설정)
7. [SSL 인증서 발급](#7-ssl-인증서-발급)
8. [Docker Compose 실행](#8-docker-compose-실행)
9. [Ollama 모델 설치](#9-ollama-모델-설치)
10. [배포 후 확인](#10-배포-후-확인)
11. [관리 명령어](#11-관리-명령어)
12. [트러블슈팅](#12-트러블슈팅)

---

## 1. 사전 준비

### 체크리스트

- [ ] OCI 인스턴스 생성 (Ubuntu 22.04, ARM 또는 x86)
- [ ] 공인 IP 확보
- [ ] DNS A 레코드: `ai.akademiya.kr` → 서버 공인 IP
- [ ] OCI 보안 그룹: 포트 80, 443 인바운드 허용
- [ ] Google Cloud Console OAuth 앱 준비
- [ ] DNS 전파 확인: `nslookup ai.akademiya.kr` 로 서버 IP가 응답되는지 확인

### OCI VCN 인바운드 규칙 추가

OCI 콘솔 → Networking → Virtual Cloud Networks → 사용 중인 VCN → Security Lists → Default Security List

| Direction | Protocol | Port Range | Source CIDR |
|-----------|----------|------------|-------------|
| Ingress   | TCP      | 80         | 0.0.0.0/0  |
| Ingress   | TCP      | 443        | 0.0.0.0/0  |

---

## 2. 서버 초기 설정

```bash
# SSH 접속
ssh ubuntu@<서버_공인_IP>

# 패키지 업데이트
sudo apt update && sudo apt upgrade -y

# Ubuntu iptables도 열어줘야 함 (OCI는 이중 방화벽)
sudo iptables -I INPUT 6 -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# swap 추가 (RAM 6GB OOM 완충용, Ollama 크래시 방지)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# swappiness 낮춤 (Ollama 응답 속도 우선)
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## 3. Docker 설치

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

## 4. Google OAuth 설정

1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. **APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth client ID**
3. Application type: **Web application**
4. **Authorized redirect URIs**에 정확히 추가:
   ```
   https://ai.akademiya.kr/api/auth/google/callback
   ```
5. **Client ID**와 **Client Secret** 저장

> **도메인 제한:** 백엔드가 `@hafs.hs.kr` 이메일을 강제 검증합니다.  
> Google 앱 설정에서 별도로 도메인을 제한할 필요는 없습니다.

---

## 5. 코드 배포

```bash
cd ~
git clone https://github.com/inoyu4649/Akasha.git akasha
cd akasha
```

---

## 6. 환경 변수 설정

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

랜덤 시크릿 생성 명령어:

```bash
openssl rand -hex 32   # MYSQL_ROOT_PASSWORD 용
openssl rand -hex 64   # JWT_SECRET 용
openssl rand -hex 64   # JWT_REFRESH_SECRET 용
```

> **⚠️ 보안 주의:** `.env`는 `.gitignore`에 포함되어 Git에 올라가지 않습니다.  
> 서버에서만 관리하고, 외부에 절대 공유하지 마세요.

---

## 7. SSL 인증서 발급

Docker를 올리기 **전에** 80 포트로 인증서를 발급합니다.

### 7-1. Certbot으로 발급

```bash
sudo apt install -y certbot

# 80 포트가 비어 있어야 합니다 (Docker 아직 실행 전)
sudo certbot certonly --standalone \
  -d ai.akademiya.kr \
  --agree-tos \
  --no-eff-email \
  -m 022207@hafs.hs.kr
```

### 7-2. 인증서를 프로젝트 디렉토리에 복사

```bash
mkdir -p ~/akasha/nginx/ssl

sudo cp /etc/letsencrypt/live/ai.akademiya.kr/fullchain.pem ~/akasha/nginx/ssl/
sudo cp /etc/letsencrypt/live/ai.akademiya.kr/privkey.pem   ~/akasha/nginx/ssl/
sudo chown $USER:$USER ~/akasha/nginx/ssl/*.pem
chmod 600 ~/akasha/nginx/ssl/privkey.pem
```

### 7-3. 자동 갱신 (crontab)

```bash
# 매월 1일 새벽 3시 갱신 후 Nginx 리로드
(crontab -l 2>/dev/null; echo "0 3 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/ai.akademiya.kr/fullchain.pem ~/akasha/nginx/ssl/ && cp /etc/letsencrypt/live/ai.akademiya.kr/privkey.pem ~/akasha/nginx/ssl/ && docker compose -f ~/akasha/docker-compose.yml exec nginx nginx -s reload") | crontab -
```

---

## 8. Docker Compose 실행

```bash
cd ~/akasha

# 이미지 빌드 + 전체 스택 실행 (첫 빌드: 3~5분 소요)
docker compose up -d --build

# 로그 확인 (마이그레이션 자동 실행됨)
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

> 백엔드는 기동 시 `prisma migrate deploy`를 자동 실행합니다.  
> DB 스키마, 테이블이 자동으로 생성됩니다.

---

## 9. Ollama 모델 설치

모델은 `ollama_data` Docker 볼륨에 저장되므로 재시작 후에도 유지됩니다.

```bash
# ── 크레딧 1 (경량 모델 — 1~3GB) ─────────────────────────────────────────
docker compose exec ollama ollama pull llama3.2:1b
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull phi4-mini
docker compose exec ollama ollama pull gemma3:4b
docker compose exec ollama ollama pull qwen3:4b
docker compose exec ollama ollama pull qwen2.5-coder:3b

# ── 크레딧 3 (중형 모델 — 4~5GB, RAM 여유 확인 후) ──────────────────────
docker compose exec ollama ollama pull llama3.2:8b
docker compose exec ollama ollama pull qwen3:7b
docker compose exec ollama ollama pull qwen2.5-coder:7b

# ── 크레딧 5 (최대 모델 — ~5GB) ─────────────────────────────────────────
docker compose exec ollama ollama pull deepseek-r1-distill-qwen:7b
```

Pull 진행 중 메모리 확인:

```bash
# 다른 터미널에서 실행
watch -n 2 free -h
```

> **⚠️ OOM 주의:**  
> - 한 번에 하나씩 pull하고 메모리를 확인하면서 진행하세요.  
> - Akasha는 항상 **한 모델만** 메모리에 유지합니다 (`keep_alive=0` 정책).  
> - 7B 모델은 약 4.5~5GB RAM을 사용합니다.

---

## 10. 배포 후 확인

### API 헬스체크

```bash
curl https://ai.akademiya.kr/api/health
# 정상: {"status":"ok","timestamp":"2026-..."}
```

### 브라우저 체크리스트

1. `https://ai.akademiya.kr` 접속 — 로그인 화면 확인
2. `@hafs.hs.kr` Google 계정으로 로그인
3. 모델 선택 → 메시지 전송 → 스트리밍 응답 확인
4. `022207@hafs.hs.kr` 계정으로 `/admin` 접근 → Admin Dashboard 확인
5. 다른 도메인 계정 로그인 시 `DOMAIN_NOT_ALLOWED` 오류 확인

### 메모리 모니터링

```bash
# 컨테이너별 실시간 메모리
watch -n 2 'docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"'

# 전체 시스템 메모리
free -h
```

---

## 11. 관리 명령어

### 서비스 관리

```bash
# 전체 재시작
docker compose restart

# 특정 서비스만 재시작
docker compose restart backend
docker compose restart ollama

# 완전 중단
docker compose down

# 실시간 로그
docker compose logs -f backend
docker compose logs -f ollama
docker compose logs -f nginx
```

### DB 관리

```bash
# MySQL 직접 접속
docker compose exec mysql mysql -u root -p akasha

# Prisma 마이그레이션 수동 실행
docker compose exec backend npx prisma migrate deploy

# 시드 재실행 (모델 설정 초기화)
docker compose exec backend npx prisma db seed

# Prisma Studio (DB GUI — 포트 5555)
docker compose exec backend npx prisma studio --hostname 0.0.0.0
# 브라우저: http://<서버IP>:5555
```

### Ollama 모델 관리

```bash
# 설치된 모델 목록
docker compose exec ollama ollama list

# 현재 메모리에 올라간 모델
docker compose exec ollama ollama ps

# 특정 모델 삭제 (용량 확보)
docker compose exec ollama ollama rm <model_name>
```

### 업데이트 배포

```bash
cd ~/akasha
git pull origin main
docker compose up -d --build
# 새 마이그레이션은 backend 기동 시 자동 적용됨
```

### 디스크 정리

```bash
# 미사용 Docker 이미지/컨테이너 정리 (볼륨 제외)
docker system prune -f

# 볼륨까지 포함한 완전 정리 (데이터 삭제됨, 주의!)
# docker system prune --volumes -f
```

---

## 12. 트러블슈팅

### 백엔드 기동 실패 — DB 연결 오류

```
Error: Can't reach database server at `mysql:3306`
```

MySQL 헬스체크가 완료될 때까지 대기한 후 재시작:

```bash
docker compose ps mysql          # healthy 상태 확인
docker compose restart backend
```

### Ollama OOM / 모델 로드 실패

```bash
# 메모리 확인
free -h

# Ollama 재시작으로 메모리 강제 해제
docker compose restart ollama

# 더 작은 모델로 전환 후 재시도
```

### SSL 인증서 오류 (nginx 시작 실패)

```bash
# 인증서 파일 존재 여부 확인
ls -la ~/akasha/nginx/ssl/

# 인증서 만료일 확인
openssl x509 -in ~/akasha/nginx/ssl/fullchain.pem -noout -dates

# 수동 갱신 후 nginx 리로드
sudo certbot renew
sudo cp /etc/letsencrypt/live/ai.akademiya.kr/fullchain.pem ~/akasha/nginx/ssl/
sudo cp /etc/letsencrypt/live/ai.akademiya.kr/privkey.pem   ~/akasha/nginx/ssl/
docker compose exec nginx nginx -s reload
```

### Google OAuth — redirect_uri_mismatch

Google Cloud Console에서 아래 URI가 **정확히** 등록되어 있는지 확인:

```
https://ai.akademiya.kr/api/auth/google/callback
```

슬래시, 프로토콜(https), 도메인 오타 없어야 합니다.

### 포트 80/443 접근 불가

```bash
# 1. Ubuntu iptables 확인
sudo iptables -L INPUT -n | grep -E "80|443"

# 2. OCI 콘솔에서 VCN Security List 인바운드 규칙 확인
#    80, 443 TCP 허용 필요

# 3. Docker가 80/443 포트를 점유 중인지 확인
sudo netstat -tlnp | grep -E ":80|:443"
```

### SSE 스트리밍이 중간에 끊김

`nginx/nginx.conf`의 `/api/` 블록에 아래가 설정되어 있는지 확인:

```nginx
proxy_buffering    off;
proxy_cache        off;
proxy_read_timeout 600s;
```

### 마이그레이션 충돌 오류

```bash
# migration history 상태 확인
docker compose exec backend npx prisma migrate status

# 강제 초기화가 필요한 경우 (데이터 삭제됨, 개발 환경 전용)
# docker compose exec backend npx prisma migrate reset
```

---

## 아키텍처

```
인터넷 (80/443)
      │
      ▼
  nginx:alpine
  (reverse proxy + SSL)
      │
      ├── / ────────► frontend (nginx, SPA)
      │
      └── /api/ ───► backend (Node 24, Express 5)
                          │
                          ├── MySQL 8.0 (DB, 384MB)
                          │
                          └── Ollama (LLM, 4800MB)
                              ※ 한 번에 모델 1개만 메모리에 유지
                              ※ 모델 전환: unload → clear → load
```

### 메모리 배분 (RAM 6GB)

| 서비스    | 메모리 상한 | CPU 상한 |
|-----------|-------------|----------|
| Ollama    | 4,800MB     | 0.90     |
| MySQL     | 384MB       | 0.30     |
| Backend   | 192MB       | 0.30     |
| Frontend  | 64MB        | 0.10     |
| Nginx     | 64MB        | 0.10     |
| OS + 여유 | ~500MB      | —        |
| **합계**  | **≈6GB**    | **1.70** |

---

*최초 작성: 2026-06-22*
