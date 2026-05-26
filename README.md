# miraise-website

Miraise OMS 서비스 랜딩 페이지 + 이메일 문의 접수 시스템.
AWS EC2 + nginx 리버스 프록시로 배포됩니다.

---

## 구조

```
miraise-website/
├── index.html                    # 웹사이트 본체 (정적 파일)
├── api/
│   └── server.js                 # Express 서버 (/api/contact, /api/resend)
├── package.json                  # 의존성 (express, resend, dotenv)
├── .env.example                  # 환경변수 템플릿
└── .gitignore
```

---

## 환경변수

`.env.example`을 참고해 서버의 `.env` 파일에 등록합니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `RESEND_API_KEY` | ✅ | [Resend](https://resend.com) API 키 |
| `RESEND_FROM` | ✅ | 발신자 주소 (인증된 도메인 또는 `onboarding@resend.dev`) |
| `NOTIFY_EMAIL` | 권장 | 폼 제출 수신 이메일 |
| `RESEND_REPLY_TO` | 선택 | Reply-To 주소 |
| `INBOX_EMAIL` | 선택 | 운영팀 내부 알림 수신 주소 |
| `SLACK_WEBHOOK_URL` | 선택 | Slack Incoming Webhook URL |
| `PORT` | 선택 | Express 서버 포트 (기본 4100) |

---

## AWS 배포

- 정적 `index.html`은 nginx가 직접 서빙합니다.
- `/api/*` 요청은 nginx가 `127.0.0.1:4100`에서 동작하는 Express 서버로 프록시합니다.
- 서버 프로세스는 `npm start` (또는 PM2/systemd)로 상시 구동합니다.

```bash
# 서버에서
git pull
npm install
# .env 파일 준비
npm start   # → 127.0.0.1:4100
```

---

## 이메일 전송 흐름

폼 제출 시 Resend API를 통해 메일이 발송되고, `SLACK_WEBHOOK_URL`이 설정되어 있으면 Slack에도 알림이 갑니다.

- **무료 체험 신청** (`demo`): 신청자 정보 + 관심 채널
- **도입 문의** (`contact`): 담당자 정보 + 문의 유형 + 메시지
- **뉴스레터 구독** (`newsletter`): 이메일 주소

`INBOX_EMAIL`이 설정된 경우 폼 제출마다 운영팀에 내부 알림이 추가 발송됩니다.
