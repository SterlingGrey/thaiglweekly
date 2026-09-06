# MailerLite Comfort — welcome automation

Account: Thai GL Weekly (Comfort). Form `mO4Dhh` on subscribe.html.
Newsletter stays free. Grok cannot click MailerLite; Sterling can.

## Where you should be

Automations → **Simple welcome email** canvas (not Advanced, not Win back).

- Top box: **Joins group(s)** → group **Subscribers** (done if it says Subscribers, not “Select group(s)”).
- Second box: **Email 1** / Welcome email.
- Do **not** click **+**. Do **not** **Activate** until the letter body is our copy.

## Right-hand panel (Email 1)

These fields are **not** the letter.

| Field | What to put | Visible to reader? |
|---|---|---|
| Email name | `Welcome` (internal). Ignore if it still says hello@… | No |
| Subject | `You're on the list` | Yes — inbox title |
| Who is it from? | `Thai GL Weekly` | Yes |
| Sender email | `hello@thaiglweekly.com` | Yes |
| Preheader | `Monday. One brief. Nothing else.` | Yes — grey line under subject |
| Opens tracking | leave on | — |

**The body is not typed here.** Click **Edit content**.

## Edit content (the letter)

1. Click **Edit content**.
2. Click the block that says **Welcome to {Brand}!** (or similar).
3. Replace it with the body below. Delete leftover “lorem” / purple CTA if it still has no URL.
4. Any button: URL `https://thaiglweekly.com`. That clears **Add missing URLs to buttons**.
5. Leave MailerLite’s footer / unsubscribe. Do not delete it.
6. Close the editor, **Save** on the Email 1 panel.

## Body (paste inside Edit content)

You're on the list.

The Monday brief lands once a week. Every fact sourced, every rumor labeled. Free. Nothing else to sign up for.

While you wait: https://thaiglweekly.com

Rules, so you know what you subscribed to:

• Everything carries a confidence label.
• No dating rumors. Ever.
• When sources conflict, you see all of them.
• Corrections run in full.

Unsubscribe in one click, any issue.

Thai GL Weekly · hello@thaiglweekly.com

## Then

1. **Preview or Send a test email** → send to a normal (not Hide My Email) address. Check Inbox and Junk.
2. If the test looks right: green **Activate**.
3. Hide My Email often lands MailerLite in Junk until the sending domain is authenticated (SPF/DKIM for hello@thaiglweekly.com). That is a later dashboard job, not this workflow.

## Do not use

- Create campaign (that’s the Monday issue)
- Create form (form already exists)
- Create site
- Advanced welcome (Premium, multiple triggers)
- Win back inactive subscribers
