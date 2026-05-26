// api/server.js
  const express = require('express');
  const { Resend } = require('resend');
  require('dotenv').config();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // CORS (필요 없으면 제거 가능 — 같은 도메인이면 불필요)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  function requireEnv(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function buildEmail(kind, payload, isResend) {
    if (!payload || !payload.email) throw new Error('Missing payload.email');
    const from = requireEnv('RESEND_FROM');
    const to = process.env.NOTIFY_EMAIL || from;
    const replyTo = process.env.RESEND_REPLY_TO || from;

    const titleByKind = {
      demo: 'Miraise 무료 체험 신청',
      contact: 'Miraise 도입 문의 접수',
      newsletter: 'Miraise 뉴스레터 구독',
    };

    const subjectPrefix = isResend ? '[재전송] ' : '';
    const subject = `${subjectPrefix}${titleByKind[kind] || 'Miraise 문의'} 확인 메일`;

    const lines = [];
    lines.push('Miraise 팀입니다.');
    lines.push('');
    lines.push('아래 내용을 기준으로 메일을 전송했습니다.');
    lines.push('');
    lines.push(`요청 타입: ${kind}`);
    if (payload.name) lines.push(`이름: ${payload.name}`);
    if (payload.email) lines.push(`이메일: ${payload.email}`);
    if (payload.phone) lines.push(`연락처: ${payload.phone}`);
    if (payload.company) lines.push(`회사명: ${payload.company}`);
    if (payload.inquiryType) lines.push(`문의 유형: ${payload.inquiryType}`);
    if (payload.message) lines.push(`메시지: ${payload.message}`);
    if (payload.inquiryType === 'oms') lines.push('필요 시 OMS 데모/연동 체크리스트를 함께 안내드릴 예정입니다.');
    lines.push('');
    lines.push('감사합니다.');

    const text = lines.join('\n');
    const html = `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.7;">
      <p>Miraise 팀입니다.</p>
      <p style="margin-top:18px;">아래 내용을 기준으로 메일을 전송했습니다.</p>
      <pre style="background:#f6f8fa;border:1px solid #e5e7eb;padding:12px;border-radius:10px;white-space:pre-wrap;">${escapeHtml(text)}</pre>
      <p style="margin-top:18px;">감사합니다.</p>
    </div>`;

    return { to, from, replyTo, subject, text, html };
  }

  function kindToInternalSubject(kind, isResend) {
    const base = {
      demo: '무료 체험 신청',
      contact: '도입 문의 접수',
      newsletter: '뉴스레터 구독',
    }[kind] || 'Miraise 문의';
    return `${isResend ? '[재전송] ' : ''}${base}`;
  }

  function buildSlackMessage(kind, payload, isResend) {
    const kindEmoji = { demo: '🎯', contact: '💬', newsletter: '📰' }[kind] || '📩';
    const kindLabel = { demo: '무료 체험 신청', contact: '도입 문의', newsletter: '뉴스레터 구독' }[kind] || '문의';
    const prefix = isResend ? '[재전송] ' : '';
    const headline = `${kindEmoji} *${prefix}${kindLabel}*`;

    const fields = [];
    if (payload.name) fields.push({ type: 'mrkdwn', text: `*이름*\n${payload.name}` });
    if (payload.email) fields.push({ type: 'mrkdwn', text: `*이메일*\n${payload.email}` });
    if (payload.phone) fields.push({ type: 'mrkdwn', text: `*연락처*\n${payload.phone}` });
    if (payload.company) fields.push({ type: 'mrkdwn', text: `*회사명*\n${payload.company}` });
    if (payload.inquiryType) fields.push({ type: 'mrkdwn', text: `*문의 유형*\n${payload.inquiryType}` });

    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: headline } },
    ];
    if (fields.length) blocks.push({ type: 'section', fields });
    if (payload.message) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*메시지*\n${payload.message}` } });
    }

    return {
      text: `${prefix}${kindLabel} - ${payload.email || ''}`,
      blocks,
    };
  }

  async function notifySlack(kind, payload, isResend) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return;
    try {
      const body = buildSlackMessage(kind, payload, isResend);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error('[slack] webhook failed:', res.status, txt);
      } else {
        console.log('[slack] notified | kind:', kind);
      }
    } catch (err) {
      console.error('[slack] error:', err && err.message ? err.message : err);
    }
  }

  async function handleSubmission(req, res) {
    const startedAt = Date.now();
    try {
      const apiKey = requireEnv('RESEND_API_KEY');
      const resend = new Resend(apiKey);

      const { kind, payload, resend: isResend } = req.body || {};
      if (!kind) return res.status(400).json({ error: 'Missing kind' });
      if (!payload || !payload.email) return res.status(400).json({ error: 'Missing payload.email' });

      const mainEmail = buildEmail(kind, payload, !!isResend);

      const { data: d1, error: e1 } = await resend.emails.send({
        from: mainEmail.from,
        to: mainEmail.to,
        replyTo: mainEmail.replyTo,
        subject: mainEmail.subject,
        text: mainEmail.text,
        html: mainEmail.html,
      });
      if (e1) throw new Error(`Resend API error: ${e1.message || JSON.stringify(e1)}`);
      console.log('[resend] sent to:', mainEmail.to, '| id:', d1 && d1.id);

      const inbox = process.env.INBOX_EMAIL;
      if (inbox) {
        const internalLines = [];
        internalLines.push(`type: ${kind}`);
        if (payload.name) internalLines.push(`name: ${payload.name}`);
        if (payload.email) internalLines.push(`email: ${payload.email}`);
        if (payload.phone) internalLines.push(`phone: ${payload.phone}`);
        if (payload.company) internalLines.push(`company: ${payload.company}`);
        if (payload.inquiryType) internalLines.push(`inquiryType: ${payload.inquiryType}`);
        if (payload.message) internalLines.push(`message: ${payload.message}`);

        const { error: e2 } = await resend.emails.send({
          from: mainEmail.from,
          to: inbox,
          replyTo: mainEmail.replyTo,
          subject: kindToInternalSubject(kind, !!isResend),
          text: internalLines.join('\n'),
        });
        if (e2) console.error('[resend] inbox send failed:', e2.message || JSON.stringify(e2));
      }

      await notifySlack(kind, payload, !!isResend);

      res.json({ ok: true, kind, tookMs: Date.now() - startedAt });
    } catch (err) {
      console.error('[resend] error:', err && err.message ? err.message : err);
      res.status(500).json({ error: err.message || 'Failed' });
    }
  }

  app.post('/api/contact', handleSubmission);
  app.post('/api/resend', handleSubmission);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  const PORT = process.env.PORT || 4100;
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[landing-api] listening on 127.0.0.1:${PORT}`);
  });
