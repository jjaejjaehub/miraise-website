# miraise-website

miraise OMS 서비스 랜딩 페이지 + 이메일 문의 접수 시스템.  
Netlify에 배포되는 정적 사이트입니다.

---

## 구조

```
miraise-website/
├── index.html                    # 웹사이트 본체
├── netlify.toml                  # Netlify 설정
├── netlify/
│   └── functions/
│       ├── resend.js             # 이메일 전송 서버리스 함수
│       └── package.json
├── .env.example                  # 환경변수 템플릿
└── .gitignore
```

---

## 환경변수

`.env.example`을 참고해 Netlify 대시보드 → Environment variables에 등록합니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `RESEND_API_KEY` | ✅ | [Resend](https://resend.com) API 키 |
| `RESEND_FROM` | ✅ | 발신자 주소 (인증된 도메인 또는 `onboarding@resend.dev`) |
| `NOTIFY_EMAIL` | 권장 | 폼 제출 수신 이메일 |
| `RESEND_REPLY_TO` | 선택 | Reply-To 주소 |
| `INBOX_EMAIL` | 선택 | 운영팀 내부 알림 수신 주소 |

---

## Netlify 배포

1. 이 리포지토리를 Netlify에 연결
2. Build command: 비움  
   Publish directory: `.`
3. 환경변수 등록 후 Deploy

`netlify.toml`에 의해 `/api/resend` 요청이 자동으로 Netlify Function으로 라우팅됩니다.

---

## 이메일 전송 흐름

폼 제출 시 Resend API를 통해 메일이 발송됩니다.

- **무료 체험 신청** (`demo`): 신청자 정보 + 관심 채널
- **도입 문의** (`contact`): 담당자 정보 + 문의 유형 + 메시지
- **뉴스레터 구독** (`newsletter`): 이메일 주소

`INBOX_EMAIL`이 설정된 경우 폼 제출마다 운영팀에 내부 알림이 추가 발송됩니다.
