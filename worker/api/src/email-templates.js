// Transactional email templates. Keep the markup inline and table-based so it
// survives Gmail, Outlook and mobile clients without external assets.
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

function emailShell({
  subject,
  preheader,
  badge = "OBI-ISM",
  eyebrow,
  title,
  intro,
  codeLabel,
  code,
  codeNote,
  ctaLabel,
  ctaUrl,
  contentHtml = "",
  footerNote = "This is a transactional email about your OBI-ISM reader account.",
  footerReason,
}) {
  const safeSubject = escapeHtml(subject);
  const safePreheader = escapeHtml(preheader);
  const safeBadge = escapeHtml(badge);
  const safeEyebrow = escapeHtml(eyebrow);
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeCodeLabel = escapeHtml(codeLabel || "");
  const safeCode = escapeHtml(code || "");
  const safeCodeNote = escapeHtml(codeNote || "");
  const safeCtaLabel = escapeHtml(ctaLabel || "");
  const safeCtaUrl = escapeHtml(ctaUrl || "");
  const safeFooterNote = escapeHtml(footerNote);
  const safeFooterReason = escapeHtml(footerReason || "");

  const codeBlock = code ? `
          <tr>
            <td class="email-pad" style="padding:24px 34px 0 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#17140e;border-radius:14px;">
                <tr>
                  <td align="center" style="padding:22px 18px 20px 18px;">
                    <p style="margin:0 0 9px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:.22em;line-height:1.4;color:#ebc968;">${safeCodeLabel}</p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:.12em;line-height:1.15;color:#ffffff;word-break:break-all;">${safeCode}</p>
                    ${safeCodeNote ? `<p style="margin:9px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#bdb3a0;">${safeCodeNote}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : "";

  const ctaBlock = ctaUrl ? `
          <tr>
            <td align="center" class="email-pad" style="padding:24px 34px 0 34px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#17140e" style="border-radius:9px;">
                    <a href="${safeCtaUrl}" style="display:inline-block;padding:15px 26px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.12em;line-height:1.2;color:#ebc968;text-decoration:none;border-radius:9px;">${safeCtaLabel} &nbsp;&rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : "";

  const linkBlock = ctaUrl ? `
          <tr>
            <td class="email-pad" style="padding:20px 34px 0 34px;">
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#746c5f;">If the button does not work, paste this link into your browser:</p>
              <p style="margin:6px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#8b6a1c;word-break:break-all;"><a href="${safeCtaUrl}" style="color:#8b6a1c;text-decoration:underline;">${safeCtaUrl}</a></p>
            </td>
          </tr>` : "";

  return `<!doctype html>
<html lang="en" style="color-scheme:light only;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${safeSubject}</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-card { width:100% !important; border-radius:0 !important; }
      .email-pad { padding-left:22px !important; padding-right:22px !important; }
      .email-title { font-size:32px !important; }
      .email-code { font-size:27px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4eee2;color:#17140e;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#f4eee2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${safePreheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4eee2;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e8dfcf;border-radius:18px;overflow:hidden;">
          <tr><td style="height:6px;background-color:#ebc968;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td class="email-pad" style="padding:30px 34px 0 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;letter-spacing:-.06em;line-height:1;color:#17140e;">OBI-<span style="color:#a87918;">ISM</span></td>
                  <td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:.16em;line-height:1.4;color:#8b6a1c;border:1px solid #ead7a2;border-radius:999px;padding:6px 10px;white-space:nowrap;">${safeBadge}</td>
                </tr>
              </table>
              <p style="margin:10px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:.26em;line-height:1.4;color:#8b6a1c;">IDEAS &nbsp;&middot;&nbsp; INTEGRITY &nbsp;&middot;&nbsp; IMPACT</p>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:26px 34px 0 34px;">
              <p style="margin:0 0 10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:.2em;line-height:1.4;color:#8b6a1c;">${safeEyebrow}</p>
              <h1 class="email-title" style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:38px;font-weight:700;letter-spacing:-.05em;line-height:1.03;color:#17140e;">${safeTitle}</h1>
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#5f584c;">${safeIntro}</p>
              ${contentHtml}
            </td>
          </tr>
          ${codeBlock}
          ${ctaBlock}
          ${linkBlock}
          <tr>
            <td class="email-pad" style="padding:24px 34px 28px 34px;">
              <div style="height:1px;background-color:#e8dfcf;margin:0 0 18px 0;font-size:0;line-height:0;">&nbsp;</div>
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#746c5f;">${safeFooterNote}</p>
              ${safeFooterReason ? `<p style="margin:8px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#746c5f;">${safeFooterReason}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:22px 34px 26px 34px;background-color:#fbf8f1;border-top:1px solid #e8dfcf;">
              <p style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;letter-spacing:-.04em;color:#17140e;">OBI-<span style="color:#a87918;">ISM</span></p>
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#746c5f;">Building a Just Society Through Character.</p>
              <p style="margin:8px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;color:#9a917f;">${safeFooterNote} Questions? Reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function verificationEmail({ code, link, email }) {
  const subject = "Your OBI-ISM verification code";
  const text = [
    "OBI-ISM",
    "IDEAS / INTEGRITY / IMPACT",
    "",
    "Confirm your email.",
    "",
    `Use this code to verify the email address on your OBI-ISM reader account (${email}):`,
    "",
    code,
    "",
    "This code expires in 10 minutes.",
    "",
    `Open the verification page: ${link}`,
    "",
    "If you did not create an OBI-ISM account, you can ignore this email.",
    "",
    "OBI-ISM - Building a Just Society Through Character",
    "This is a transactional email about your reader account.",
  ].join("\n");
  const html = emailShell({
    subject,
    preheader: "Your OBI-ISM verification code is inside. It expires in 10 minutes.",
    badge: "ACCOUNT",
    eyebrow: "VERIFY YOUR EMAIL",
    title: "One quick step.",
    intro: "Confirm the email address on your OBI-ISM reader account. Enter the code below, or open the verification page.",
    codeLabel: "YOUR 8-DIGIT CODE",
    code,
    codeNote: "Expires in 10 minutes",
    ctaLabel: "VERIFY MY EMAIL",
    ctaUrl: link,
    footerNote: "This is a transactional email about your reader account.",
    footerReason: `Requested for ${escapeHtml(email)}. If you did not create an OBI-ISM account, you can safely ignore this email.`,
  });
  return { subject, html, text };
}

export function giftCodeEmail({ code, link, recipientName, recipientEmail, message }) {
  const safeName = escapeHtml(recipientName);
  const safeEmail = escapeHtml(recipientEmail);
  const safeMessage = message ? escapeHtml(message) : "";
  const subject = `${recipientName}, your OBI-ISM gift is ready`;
  const text = [
    "OBI-ISM",
    "A GIFT OF CHARACTER",
    "",
    `${recipientName}, you have a gift.`,
    "",
    "Someone bought you the complete OBI-ISM digital edition: Building a Just Society Through Character.",
    "",
    "YOUR UNIQUE GIFT CODE",
    code,
    "",
    ...(message ? [message, ""] : []),
    `Open your gift: ${link}`,
    "",
    `Redeem with this email address: ${recipientEmail}. The code works once and binds to one device.`,
    "",
    "OBI-ISM - Building a Just Society Through Character",
  ].join("\n");
  const html = emailShell({
    subject,
    preheader: `${recipientName}, your OBI-ISM gift is ready to unlock.`,
    badge: "GIFT",
    eyebrow: "A GIFT OF CHARACTER",
    title: `${safeName}, you have a gift.`,
    intro: "Someone bought you the complete OBI-ISM digital edition: Building a Just Society Through Character.",
    codeLabel: "YOUR UNIQUE GIFT CODE",
    code,
    codeNote: "Works once and binds to one device",
    ctaLabel: "UNLOCK MY EDITION",
    ctaUrl: link,
    contentHtml: `${safeMessage ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0 0;background-color:#fbf8f1;border-left:3px solid #ebc968;border-radius:0 10px 10px 0;"><tr><td style="padding:14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#5f584c;">${safeMessage}</td></tr></table>` : ""}`,
    footerNote: `Redeem with the email address this gift was sent to: ${safeEmail}.`,
    footerReason: "Do not forward this email. The gift code works once and binds to one device.",
  });
  return { subject, html, text };
}

export function bulkReceiptEmail({ orderId, quantity, link, email }) {
  const safeOrder = escapeHtml(orderId);
  const safeEmail = escapeHtml(email);
  const subject = "Your OBI-ISM bulk order is ready";
  const text = [
    "OBI-ISM",
    "BULK ORDER RECEIPT",
    "",
    "Your code is ready.",
    "",
    `Order: ${orderId}`,
    `Copies: ${quantity}`,
    "",
    "Open your protected order page to view the activation code:",
    link,
    "",
    "Sign in with the account that placed the order. The full code is not included in this email.",
    "Share the code only with the intended recipients.",
    "",
    `Receipt email: ${email}`,
    "",
    "OBI-ISM - Building a Just Society Through Character",
  ].join("\n");
  const html = emailShell({
    subject,
    preheader: `Your OBI-ISM order for ${quantity} copies is ready. Open the protected page to view the code.`,
    badge: "BULK",
    eyebrow: "BULK ORDER RECEIPT",
    title: "Your code is ready.",
    intro: "Your bulk order has been paid. Open the protected order page to view the activation code and share it with your readers.",
    contentHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0 0;background-color:#fbf8f1;border:1px solid #e8dfcf;border-radius:12px;"><tr><td style="padding:16px 18px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#5f584c;"><strong style="color:#17140e;">Order</strong><br><span style="word-break:break-all;">${safeOrder}</span><br><br><strong style="color:#17140e;">Copies</strong><br>${escapeHtml(quantity)}</td></tr></table>`,
    ctaLabel: "OPEN MY ORDER",
    ctaUrl: link,
    footerNote: `Receipt email: ${safeEmail}. The full code is shown only on the protected order page.`,
    footerReason: "You will be asked to sign in with the account that placed the order. Share the code only with the intended recipients.",
  });
  return { subject, html, text };
}

export function deviceTransferCodeEmail({ code, deviceLabel }) {
  const safeDevice = escapeHtml(deviceLabel || "a new device");
  const subject = "Confirm your OBI-ISM device move";
  const text = [
    "OBI-ISM",
    "DEVICE MOVE",
    "",
    `Your code to move your OBI-ISM edition is ${code}.`,
    "",
    "It expires in 10 minutes.",
    "",
    `Requested from ${deviceLabel || "a new device"}.`,
    "",
    "If this was not you, do not share this code and contact support.",
    "",
    "OBI-ISM - Building a Just Society Through Character",
  ].join("\n");
  const html = emailShell({
    subject,
    preheader: "Your OBI-ISM device-move code is inside. It expires in 10 minutes.",
    badge: "SECURITY",
    eyebrow: "DEVICE MOVE",
    title: "Confirm your new device.",
    intro: "Use the code below to move your OBI-ISM edition to the device that requested it. The code expires in 10 minutes.",
    codeLabel: "YOUR 8-DIGIT CODE",
    code,
    codeNote: "Expires in 10 minutes",
    contentHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0 0;background-color:#fbf8f1;border:1px solid #e8dfcf;border-radius:12px;"><tr><td style="padding:14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#5f584c;"><strong style="color:#17140e;">Requested from</strong><br>${safeDevice}</td></tr></table>`,
    footerNote: "If you did not request this move, do not share the code and contact support.",
    footerReason: "Moving an edition replaces the old device. It does not create an extra simultaneous device.",
  });
  return { subject, html, text };
}

export function deviceMovedEmail({ deviceLabel, link }) {
  const safeDevice = escapeHtml(deviceLabel || "your new device");
  const subject = "Your OBI-ISM edition was moved";
  const text = [
    "OBI-ISM",
    "DEVICE UPDATE",
    "",
    "Your edition was moved.",
    "",
    `The active device is now ${deviceLabel || "your new device"}.`,
    "",
    "If this was not you, contact support immediately.",
    "",
    ...(link ? [`Open your reader: ${link}`] : []),
    "",
    "OBI-ISM - Building a Just Society Through Character",
  ].join("\n");
  const html = emailShell({
    subject,
    preheader: "Your OBI-ISM edition is now active on a new device.",
    badge: "SECURITY",
    eyebrow: "DEVICE UPDATE",
    title: "Your edition was moved.",
    intro: "The active device for your OBI-ISM edition has changed. The previous device is no longer the authorised reader.",
    contentHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0 0;background-color:#fbf8f1;border:1px solid #e8dfcf;border-radius:12px;"><tr><td style="padding:14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#5f584c;"><strong style="color:#17140e;">New active device</strong><br>${safeDevice}</td></tr></table>`,
    ctaLabel: link ? "OPEN MY READER" : "",
    ctaUrl: link || "",
    footerNote: "If you did not make this change, contact support immediately.",
    footerReason: "Moving an edition replaces the old device. It does not create an extra simultaneous device.",
  });
  return { subject, html, text };
}
