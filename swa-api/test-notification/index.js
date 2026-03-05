const { EmailClient } = require("@azure/communication-email");

module.exports = async function (context, req) {
  context.log('Test notification function triggered');
  
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const senderEmail = process.env.ACS_SENDER_EMAIL || "DoNotReply@d4972e00-557a-4f16-acb7-7803737a1477.azurecomm.net";
  
  const { email } = req.body || {};
  
  if (!email) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Please provide an email address in the request body" }
    };
    return;
  }
  
  if (!connectionString) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { 
        error: "ACS_CONNECTION_STRING not configured",
        configured: {
          connectionString: !!connectionString,
          senderEmail: senderEmail
        }
      }
    };
    return;
  }
  
  try {
    const emailClient = new EmailClient(connectionString);
    
    const emailMessage = {
      senderAddress: senderEmail,
      content: {
        subject: "🎉 PriceWatch Test - Notifications Working!",
        plainText: "Congratulations! Your PriceWatch notification system is configured correctly. You'll receive alerts when tracked products drop below your target price.",
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 500px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding: 32px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 600;">✅ Test Successful!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px; text-align: center;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #1f2937;">PriceWatch Notifications</h2>
              <p style="color: #6b7280; margin: 0 0 24px; line-height: 1.6;">
                Your notification system is configured correctly! You'll receive alerts like this when products you're tracking drop below your target price.
              </p>
              <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <div style="font-size: 14px; color: #059669; font-weight: 600;">What happens next?</div>
                <ul style="text-align: left; color: #4b5563; margin: 12px 0 0; padding-left: 20px; line-height: 1.8;">
                  <li>Add products to track in your dashboard</li>
                  <li>Set your target price</li>
                  <li>We check prices daily</li>
                  <li>Get notified when prices drop!</li>
                </ul>
              </div>
              <a href="https://delightful-glacier-06ac71a1e.2.azurestaticapps.net" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">Go to Dashboard →</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} PriceWatch • Powered by Azure Communication Services
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim()
      },
      recipients: {
        to: [{ address: email }]
      }
    };
    
    context.log('Sending test email to:', email);
    const poller = await emailClient.beginSend(emailMessage);
    const response = await poller.pollUntilDone();
    
    context.log('Test email sent successfully, messageId:', response.id);
    
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        success: true,
        message: `Test email sent to ${email}`,
        messageId: response.id,
        senderEmail: senderEmail
      }
    };
    
  } catch (error) {
    context.log.error('Test notification error:', error);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { 
        error: error.message,
        hint: "Make sure ACS_CONNECTION_STRING is set correctly in app settings"
      }
    };
  }
};
