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
<html lang="en" style="color-scheme:light only;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4eee2;color:#17140e;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#f4eee2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    Your OBI-ISM verification code is inside. It expires in 10 minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4eee2;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e8dfcf;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="height:6px;background-color:#ebc968;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:30px 34px 0 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;letter-spacing:-.06em;line-height:1;color:#17140e;">OBI–<span style="color:#a87918;">ISM</span></td>
                  <td align="right" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:.16em;line-height:1.4;color:#8b6a1c;border:1px solid #ead7a2;border-radius:999px;padding:6px 10px;white-space:nowrap;">ACCOUNT</td>
                </tr>
              </table>
              <p style="margin:10px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:.26em;line-height:1.4;color:#8b6a1c;">IDEAS &nbsp;·&nbsp; INTEGRITY &nbsp;·&nbsp; IMPACT</p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 34px 0 34px;">
              <p style="margin:0 0 10px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:.2em;line-height:1.4;color:#8b6a1c;">VERIFY YOUR EMAIL</p>
              <h1 style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:38px;font-weight:700;letter-spacing:-.05em;line-height:1.03;color:#17140e;">One quick step.</h1>
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#5f584c;">Confirm the email address on your OBI-ISM reader account. Enter the code below, or open the verification page.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 34px 0 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#17140e;border-radius:14px;">
                <tr>
                  <td align="center" style="padding:22px 18px 20px 18px;">
                    <p style="margin:0 0 9px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:.22em;line-height:1.4;color:#ebc968;">YOUR 8-DIGIT CODE</p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:.16em;line-height:1.15;color:#ffffff;">${safeCode}</p>
                    <p style="margin:9px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#bdb3a0;">Expires in 10 minutes</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 34px 0 34px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#17140e" style="border-radius:9px;">
                    <a href="${safeLink}" style="display:inline-block;padding:15px 26px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.12em;line-height:1.2;color:#ebc968;text-decoration:none;border-radius:9px;">VERIFY MY EMAIL &nbsp;→</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 34px 0 34px;">
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#746c5f;">If the button does not work, paste this link into your browser:</p>
              <p style="margin:6px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#8b6a1c;word-break:break-all;"><a href="${safeLink}" style="color:#8b6a1c;text-decoration:underline;">${safeLink}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 34px 28px 34px;">
              <div style="height:1px;background-color:#e8dfcf;margin:0 0 18px 0;font-size:0;line-height:0;">&nbsp;</div>
              <p style="margin:0 0 7px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5f584c;">Requested for <strong>${safeEmail}</strong>.</p>
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#746c5f;">If you did not create an OBI-ISM account, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 34px 26px 34px;background-color:#fbf8f1;border-top:1px solid #e8dfcf;">
              <p style="margin:0 0 4px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;letter-spacing:-.04em;color:#17140e;">OBI–<span style="color:#a87918;">ISM</span></p>
              <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#746c5f;">Building a Just Society Through Character.</p>
              <p style="margin:8px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.6;color:#9a917f;">This is a transactional email about your reader account. Questions? Reply to this email.</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td align="center" style="padding:16px 10px 0 10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;line-height:1.5;color:#9a917f;">You received this because an OBI-ISM account was created with this email.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
