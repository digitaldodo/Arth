"""Write the six responsive SpendSense Supabase Auth email templates."""

from pathlib import Path

TEMPLATES = {
    "confirmation.html": {
        "subject": "Confirm your SpendSense email address.",
        "title": "Confirm your email address",
        "intro": 'Confirm the email address <strong>{{ .Email }}</strong> to finish setting up your SpendSense account.',
        "button": "Confirm email address",
        "url": "{{ .ConfirmationURL }}",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "notice": "If you did not request a SpendSense account, you can ignore this message.",
    },
    "recovery.html": {
        "subject": "Reset your SpendSense password.",
        "title": "Reset your password",
        "intro": 'We received a request to reset the password for <strong>{{ .Email }}</strong>. Use the secure link below to choose a new password.',
        "button": "Reset password",
        "url": "{{ .ConfirmationURL }}",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "notice": "If you did not request a password reset, you can ignore this message. Your current password will remain unchanged.",
    },
    "magic_link.html": {
        "subject": "Your SpendSense sign-in link.",
        "title": "Sign in to SpendSense",
        "intro": 'Use the secure sign-in link for <strong>{{ .Email }}</strong>. It can be used only for this sign-in request.',
        "button": "Sign in to SpendSense",
        "url": "{{ .ConfirmationURL }}",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "notice": "If you did not request this sign-in link, you can ignore this message.",
    },
    "email_change.html": {
        "subject": "Confirm your new SpendSense email address.",
        "title": "Confirm your new email address",
        "intro": 'Confirm the change from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong> using the secure link below.',
        "button": "Confirm new email address",
        "url": "{{ .ConfirmationURL }}",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "notice": "If you did not request this email change, do not use the link. Review your account security through SpendSense.",
    },
    "invite.html": {
        "subject": "You're invited to SpendSense.",
        "title": "You’re invited to SpendSense",
        "intro": 'An invitation was created for <strong>{{ .Email }}</strong>. Accept it using the secure link below.',
        "button": "Accept invitation",
        "url": "{{ .ConfirmationURL }}",
        "fallback": "If the button does not work, copy and paste this link into your browser:",
        "notice": "If you were not expecting this invitation, you can ignore this message.",
    },
    "reauthentication.html": {
        "subject": "Your SpendSense verification code.",
        "title": "Verify it’s you",
        "intro": 'Enter this one-time verification code in SpendSense to continue:',
        "button": None,
        "url": None,
        "fallback": None,
        "notice": "Never share this code. SpendSense will not ask you to send it to anyone.",
    },
}


def render(name: str, item: dict) -> str:
    cta = (
        f'''<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px">
  <tr><td bgcolor="#193F37" style="border-radius:5px;text-align:center">
    <a href="{item['url']}" style="display:inline-block;padding:13px 22px;color:#ffffff;background:#193F37;border:1px solid #193F37;border-radius:5px;font:600 15px Arial,sans-serif;text-decoration:none">{item['button']}</a>
  </td></tr>
</table>
<p style="margin:0 0 7px;color:#736e66;font:12px/18px Arial,sans-serif">{item['fallback']}</p>
<p style="margin:0;padding:11px 12px;background:#f6f4ed;border:1px solid #e4e2dc;border-radius:4px;word-break:break-all;font:12px/18px Arial,sans-serif"><a href="{item['url']}" style="color:#193f37;text-decoration:underline">{item['url']}</a></p>'''
    ) if item["url"] else f'''<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr><td style="padding:14px 20px;background:#f6f4ed;border:1px solid #e4e2dc;border-radius:5px;color:#193f37;font:bold 25px/32px Arial,sans-serif;letter-spacing:5px">{{{{ .Token }}}}</td></tr></table>'''

    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{item['subject']}</title>
  <style>
    body,table,td,p,a {{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }}
    table {{ border-collapse:collapse; }}
    @media only screen and (max-width:600px) {{ .outer {{ padding:18px 10px !important; }} .card {{ padding:26px 20px !important; }} .cta {{ width:100% !important; }} }}
  </style>
</head>
<body style="margin:0;padding:0;background:#f6f4ed;color:#181615;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" bgcolor="#f6f4ed"><tr><td class="outer" align="center" style="padding:38px 16px">
    <table role="presentation" class="card" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e4e2dc;border-radius:8px">
      <tr><td style="padding:30px 34px 8px">
        <table role="presentation"><tr>
          <td width="32" height="32" bgcolor="#193f37" align="center" valign="middle" style="width:32px;height:32px;border-radius:6px;color:#f6f4ed;font:bold 19px/32px Arial,sans-serif">S</td>
          <td style="padding-left:10px;color:#181615;font:bold 19px/24px Arial,sans-serif;letter-spacing:-.3px">SpendSense</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 34px 32px">
        <h1 style="margin:0 0 14px;color:#181615;font:bold 22px/30px Arial,sans-serif">{item['title']}</h1>
        <p style="margin:0 0 22px;color:#494541;font:15px/24px Arial,sans-serif">{item['intro']}</p>
        {cta}
        <table role="presentation" width="100%" style="margin:25px 0 18px"><tr><td style="border-top:1px solid #e4e2dc;font-size:1px;line-height:1px">&nbsp;</td></tr></table>
        <p style="margin:0;color:#736e66;font:12px/19px Arial,sans-serif">{item['notice']}</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;color:#736e66;text-align:center;font:12px/18px Arial,sans-serif">SpendSense · Personal finance, clearly</p>
  </td></tr></table>
</body>
</html>
'''


def main():
    destination = Path(__file__).resolve().parents[1] / "supabase" / "templates"
    for filename, item in TEMPLATES.items():
        (destination / filename).write_text(render(filename, item), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
