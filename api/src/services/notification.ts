import { EmailClient } from '@azure/communication-email'
import { SmsClient } from '@azure/communication-sms'
import { DefaultAzureCredential } from '@azure/identity'
import { User, Product } from '../models/index.js'

interface NotificationResult {
  success: boolean
  emailSent?: boolean
  smsSent?: boolean
  error?: string
}

class NotificationService {
  private emailClient: EmailClient | null = null
  private smsClient: SmsClient | null = null
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING
    const endpoint = process.env.COMMUNICATION_SERVICES_ENDPOINT

    if (connectionString) {
      // Use connection string if provided (local development)
      this.emailClient = new EmailClient(connectionString)
      this.smsClient = new SmsClient(connectionString)
    } else if (endpoint) {
      // Use Managed Identity in production
      const credential = new DefaultAzureCredential()
      this.emailClient = new EmailClient(endpoint, credential)
      this.smsClient = new SmsClient(endpoint, credential)
    } else {
      console.warn('Communication Services not configured - notifications disabled')
    }

    this.initialized = true
  }

  async sendPriceAlert(
    user: User,
    product: Product,
    previousPrice: number
  ): Promise<NotificationResult> {
    await this.initialize()

    const discount = ((previousPrice - product.currentPrice) / previousPrice * 100).toFixed(0)
    const result: NotificationResult = { success: false }

    const shouldSendEmail = user.notificationPreference === 'email' || user.notificationPreference === 'both'
    const shouldSendSms = (user.notificationPreference === 'sms' || user.notificationPreference === 'both') && user.phoneNumber

    try {
      // Send email notification
      if (shouldSendEmail && this.emailClient && user.email) {
        const emailResult = await this.sendEmail(user, product, previousPrice, discount)
        result.emailSent = emailResult
      }

      // Send SMS notification
      if (shouldSendSms && this.smsClient && user.phoneNumber) {
        const smsResult = await this.sendSms(user, product, discount)
        result.smsSent = smsResult
      }

      result.success = result.emailSent || result.smsSent || false
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Failed to send notification'
    }

    return result
  }

  private async sendEmail(
    user: User,
    product: Product,
    previousPrice: number,
    discount: string
  ): Promise<boolean> {
    if (!this.emailClient) return false

    const senderEmail = process.env.SENDER_EMAIL || 'donotreply@pricewatch.com'
    const currencyFormatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: product.currency || 'USD',
    })

    const emailMessage = {
      senderAddress: senderEmail,
      content: {
        subject: `🎉 Price Drop Alert: ${product.name}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #0ea5e9, #0369a1); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                    <span style="font-size: 28px;">📉</span>
                  </div>
                </div>
                
                <h1 style="margin: 0 0 10px; font-size: 24px; color: #171717; text-align: center;">
                  Price Drop Alert!
                </h1>
                
                <p style="margin: 0 0 30px; color: #525252; text-align: center; font-size: 16px;">
                  A product you're tracking just went on sale.
                </p>
                
                <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                  <h2 style="margin: 0 0 8px; font-size: 18px; color: #171717;">
                    ${escapeHtml(product.name)}
                  </h2>
                  <p style="margin: 0; color: #737373; font-size: 14px;">
                    ${escapeHtml(product.store)}
                  </p>
                </div>
                
                <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 30px;">
                  <div style="text-align: center;">
                    <p style="margin: 0 0 4px; color: #737373; font-size: 12px; text-transform: uppercase;">Was</p>
                    <p style="margin: 0; color: #a3a3a3; font-size: 20px; text-decoration: line-through;">
                      ${currencyFormatter.format(previousPrice)}
                    </p>
                  </div>
                  <div style="text-align: center;">
                    <p style="margin: 0 0 4px; color: #737373; font-size: 12px; text-transform: uppercase;">Now</p>
                    <p style="margin: 0; color: #16a34a; font-size: 24px; font-weight: 700;">
                      ${currencyFormatter.format(product.currentPrice)}
                    </p>
                  </div>
                </div>
                
                <div style="text-align: center; margin-bottom: 30px;">
                  <span style="display: inline-block; background: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px;">
                    You save ${discount}%!
                  </span>
                </div>
                
                ${product.url ? `
                <div style="text-align: center;">
                  <a href="${escapeHtml(product.url)}" style="display: inline-block; background: #171717; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
                    View Product →
                  </a>
                </div>
                ` : ''}
              </div>
              
              <p style="color: #a3a3a3; font-size: 12px; text-align: center; margin-top: 30px;">
                You're receiving this because you're tracking this product on PriceWatch.<br>
                <a href="#" style="color: #737373;">Manage notifications</a>
              </p>
            </div>
          </body>
          </html>
        `,
        plainText: `
Price Drop Alert!

${product.name} at ${product.store}

Was: ${currencyFormatter.format(previousPrice)}
Now: ${currencyFormatter.format(product.currentPrice)}
You save: ${discount}%

${product.url ? `View product: ${product.url}` : ''}

---
You're receiving this because you're tracking this product on PriceWatch.
        `.trim(),
      },
      recipients: {
        to: [{ address: user.email }],
      },
    }

    try {
      const poller = await this.emailClient.beginSend(emailMessage)
      const result = await poller.pollUntilDone()
      return result.status === 'Succeeded'
    } catch (error) {
      console.error('Failed to send email:', error)
      return false
    }
  }

  private async sendSms(user: User, product: Product, discount: string): Promise<boolean> {
    if (!this.smsClient || !user.phoneNumber) return false

    const senderPhone = process.env.SENDER_PHONE || ''
    const currencyFormatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: product.currency || 'USD',
    })

    const message = `PriceWatch: ${product.name} is now ${currencyFormatter.format(product.currentPrice)} (${discount}% off) at ${product.store}!`

    try {
      const sendResults = await this.smsClient.send({
        from: senderPhone,
        to: [user.phoneNumber],
        message: message.slice(0, 160), // SMS limit
      })

      return sendResults[0]?.successful ?? false
    } catch (error) {
      console.error('Failed to send SMS:', error)
      return false
    }
  }
}

function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => escapeMap[char])
}

export const notificationService = new NotificationService()
export default notificationService
