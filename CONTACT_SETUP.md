# Contact form

The contact form posts directly to FormSubmit for delivery to `anupbajgain999@gmail.com`. It does not require visitors to have an email application configured. FormSubmit handles the spam check and confirmation page. The separate email links remain ordinary email links.

## One-time activation

1. Publish the updated website using the normal hosting workflow.
2. Submit a test message from the website served over HTTPS (not an HTML file opened from disk).
3. Check `anupbajgain999@gmail.com`, including spam, for FormSubmit's activation email and confirm it.
4. Submit another test message and verify that it arrives. Replying should address the visitor's submitted email.

The code is configured, but inbox delivery cannot be confirmed until the owner activates the destination. No live test message or activation email was sent during implementation.

All visitor fields (`name`, `email`, `subject`, `message`) are sent in the POST body. The email notification uses a fixed portfolio subject and includes the visitor's subject in its body. Browser validation requires a name, valid email, and message. FormSubmit's default reCAPTCHA is enabled, with an additional hidden honeypot field. No API key is required or stored in the website.

Documentation: [FormSubmit setup](https://formsubmit.co/) and [form options](https://formsubmit.co/documentation).
