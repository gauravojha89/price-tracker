const { EmailClient } = require("@azure/communication-email");
const { SmsClient } = require("@azure/communication-sms");

module.exports = async function (context, req) {
  context.log('Notification function triggered');
  
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const senderEmail = process.env.ACS_SENDER_EMAIL || "DoNotReply@d4972e00-557a-4f16-acb7-7803737a1477.azurecomm.net";
  const senderPhone = process.env.ACS_SENDER_PHONE; // Optional, only if SMS is configured
  
  const { type, to, subject, message, productName, currentPrice, targetPrice, productUrl } = req.body || {};
  
  if (!type || !to) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Missing required fields: type and to" }
    };
    return;
  }
  
  try {
    let result = {};
    
    if (type === 'email') {
      if (!connectionString) {
        throw new Error("ACS_CONNECTION_STRING not configured");
      }
      
      const emailClient = new EmailClient(connectionString);
      
      // Build email content
      const emailSubject = subject || `🎉 Price Alert: ${productName} is on sale!`;
      const htmlContent = buildEmailHtml(productName, currentPrice, targetPrice, productUrl, message);
      const plainTextContent = message || `${productName} is now $${currentPrice} (target: $${targetPrice}). Check it out: ${productUrl}`;
      
      const emailMessage = {
        senderAddress: senderEmail,
        content: {
          subject: emailSubject,
          plainText: plainTextContent,
          html: htmlContent
        },
        recipients: {
          to: [{ address: to }]
        }
      };
      
      const poller = await emailClient.beginSend(emailMessage);
      const response = await poller.pollUntilDone();
      
      result = {
        type: 'email',
        status: 'sent',
        messageId: response.id,
        to: to
      };
      
      context.log('Email sent successfully to:', to);
      
    } else if (type === 'sms') {
      if (!connectionString || !senderPhone) {
        throw new Error("SMS not configured. Please purchase a phone number in Azure Portal.");
      }
      
      const smsClient = new SmsClient(connectionString);
      
      const smsMessage = message || `PriceWatch Alert: ${productName} is now $${currentPrice}! Target was $${targetPrice}. ${productUrl}`;
      
      const sendResults = await smsClient.send({
        from: senderPhone,
        to: [to],
        message: smsMessage.substring(0, 160) // SMS limit
      });
      
      result = {
        type: 'sms',
        status: 'sent',
        messageId: sendResults[0].messageId,
        to: to,
        successful: sendResults[0].successful
      };
      
      context.log('SMS sent successfully to:', to);
      
    } else if (type === 'both') {
      const results = [];
      
      // Send email
      if (connectionString) {
        try {
          const emailClient = new EmailClient(connectionString);
          const emailSubject = subject || `🎉 Price Alert: ${productName} is on sale!`;
          const htmlContent = buildEmailHtml(productName, currentPrice, targetPrice, productUrl, message);
          const plainTextContent = message || `${productName} is now $${currentPrice} (target: $${targetPrice}). Check it out: ${productUrl}`;
          
          const emailMessage = {
            senderAddress: senderEmail,
            content: {
              subject: emailSubject,
              plainText: plainTextContent,
              html: htmlContent
            },
            recipients: {
              to: [{ address: to.email || to }]
            }
          };
          
          const poller = await emailClient.beginSend(emailMessage);
          const response = await poller.pollUntilDone();
          results.push({ type: 'email', status: 'sent', messageId: response.id });
        } catch (emailError) {
          results.push({ type: 'email', status: 'failed', error: emailError.message });
        }
      }
      
      // Send SMS if configured
      if (connectionString && senderPhone && to.phone) {
        try {
          const smsClient = new SmsClient(connectionString);
          const smsMessage = message || `PriceWatch: ${productName} is now $${currentPrice}! Target: $${targetPrice}`;
          
          const sendResults = await smsClient.send({
            from: senderPhone,
            to: [to.phone],
            message: smsMessage.substring(0, 160)
          });
          results.push({ type: 'sms', status: 'sent', messageId: sendResults[0].messageId });
        } catch (smsError) {
          results.push({ type: 'sms', status: 'failed', error: smsError.message });
        }
      }
      
      result = { type: 'both', results };
    }
    
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: result
    };
    
  } catch (error) {
    context.log.error('Notification error:', error);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: error.message }
    };
  }
};

function buildEmailHtml(productName, currentPrice, targetPrice, productUrl, customMessage) {
  const savings = targetPrice ? (((targetPrice - currentPrice) / targetPrice) * 100).toFixed(0) : 0;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Price Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 500px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);">
              <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">🎉 Price Drop Alert!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; color: #1f2937;">${productName || 'Your tracked product'}</h2>
              
              ${customMessage ? `<p style="color: #6b7280; margin: 0 0 24px;">${customMessage}</p>` : ''}
              
              <!-- Price Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0f9ff; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Current Price</div>
                    <div style="font-size: 36px; font-weight: 700; color: #059669;">$${currentPrice || '—'}</div>
                    ${targetPrice ? `
                    <div style="font-size: 14px; color: #6b7280; margin-top: 12px;">
                      Target: <span style="text-decoration: line-through;">$${targetPrice}</span>
                      <span style="color: #059669; font-weight: 600; margin-left: 8px;">${savings}% OFF</span>
                    </div>
                    ` : ''}
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              ${productUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${productUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">View Product →</a>
                  </td>
                </tr>
              </table>
              ` : ''}
              
              <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0;">
                This alert was sent by PriceWatch. You're receiving this because you set up a price alert for this product.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background: #f9fafb; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} PriceWatch • Powered by Azure
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
