// Transactional email templates. Keep the markup inline and table-based so it
// survives Gmail, Outlook and mobile clients without external assets.
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

export function verificationEmail({ code, link, email }) {
  const safeCode = escapeHtml(code);
  const safeLink = escapeHtml(link);
  const safeEmail = escapeHtml(email);
  const subject = "Your OBI-ISM verification code";
  const text = [
    "OBI–ISM",
    "IDEAS · INTEGRITY · IMPACT",
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
    "OBI-ISM · Building a Just Society Through Character",
    "This is a transactional email about your reader account.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f1e4;color:#17140e;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#f7f1e4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    Your OBI-ISM verification code is inside. It expires in 10 minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f1e4;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #ece6dc;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:34px 36px 0 36px;">
              <p style="margin:0 0 7px;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;letter-spacing:-.06em;line-height:1;color:#17140e;">OBI–<span style="color:#a87918;">ISM</span></p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:800;letter-spacing:.28em;line-height:1.4;color:#8b6a1c;">IDEAS &nbsp;·&nbsp; INTEGRITY &nbsp;·&nbsp; IMPACT</p>
              <div style="height:1px;background:#ece6dc;margin:24px 0 0 0;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 0 36px;">
              <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:800;letter-spacing:.2em;line-height:1.4;color:#8b6a1c;">ACCOUNT VERIFICATION</p>
              <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:700;letter-spacing:-.045em;line-height:1.05;color:#17140e;">Confirm your email.</h1>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#5f584c;">Use the code below to verify the email address on your OBI-ISM reader account.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7df;border:1px solid #ead7a2;border-radius:12px;">
                <tr>
                  <td align="center" style="padding:20px 18px 18px 18px;">
                    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:800;letter-spacing:.2em;line-height:1.4;color:#8b6a1c;">YOUR 8-DIGIT CODE</p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:.16em;line-height:1.15;color:#17140e;">${safeCode}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#746c5f;text-align:center;">This code expires in 10 minutes.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:26px 36px 0 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#17140e" style="border-radius:9px;">
                    <a href="${safeLink}" style="display:inline-block;padding:15px 24px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.12em;line-height:1.2;color:#ebc968;text-decoration:none;border-radius:9px;">VERIFY MY EMAIL &nbsp;→</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 0 36px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#746c5f;">If the button does not work, paste this link into your browser:</p>
              <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8b6a1c;word-break:break-all;"><a href="${safeLink}" style="color:#8b6a1c;text-decoration:underline;">${safeLink}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 30px 36px;">
              <div style="height:1px;background:#ece6dc;margin:0 0 18px 0;font-size:0;line-height:0;">&nbsp;</div>
              <p style="margin:0 0 7px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#5f584c;">This code was requested for <strong>${safeEmail}</strong>.</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#746c5f;">If you did not create an OBI-ISM account, you can ignore this email. Someone may have typed your address by mistake.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px 28px 36px;background:#fbf8f1;border-top:1px solid #ece6dc;">
              <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;letter-spacing:-.04em;color:#17140e;">OBI–<span style="color:#a87918;">ISM</span></p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#746c5f;">Building a Just Society Through Character.</p>
              <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.6;color:#9a917f;">This is a transactional email about your reader account. Questions? Reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
